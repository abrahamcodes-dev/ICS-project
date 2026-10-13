import { HttpsError } from 'firebase-functions/v2/https';
import type { CallDescription, CallMutationInput, CallMutationResult, ConsultationCall, GetConsultationCallInput,
  GetConsultationCallResult, RespondToConsultationCallInput, CallIceCandidate, PublishConsultationIceInput, PublishConsultationIceResult } from '../../../../shared/types/consultationCallContracts';
import type { DomainTimestamp } from '../../../../shared/types/profiles';
import { createAuthorization, requireAuthenticated } from '../../shared/authorization';
import { DomainValidationError, fail, safeId } from '../../profiles/domainValidation';
import { compareTimes } from '../../scheduling/primitives';
import { validateAppointment } from '../../scheduling/validation';
import { bindConsultation, plusSeconds } from '../domain';
import { authorizeHistory, reconcileConsultation } from '../policy';
import { CALL_LIMITS, validateEndInput, validateGetInput, validateGetResult, validateMutationResult, validateRespondInput, validateStoredDescription,
  validatePublishInput, validatePublishResult, validateStoredCandidate } from './domain';
import { CallPolicyError, makeReceipt, planCallAction, planGetCall, planIceEligibility, type CallContext, type CallReceipt } from './policy';
import type { StartCallTransaction } from './startHandler';
import { checkIceInventory, checkIceReceipt, iceCandidateId, iceFingerprint, type CandidateEntry, type IceReceipt, type IceSenderState } from './iceState';

export interface CallLifecycleTransaction extends StartCallTransaction {
  answer(room: string, id: string): Promise<CallDescription<'answer'> | null>;
  answerReceipt(room: string, id: string): Promise<CallReceipt | null>;
  actionReceipt(room: string, operation: 'respond' | 'end', uid: string, requestId: string): Promise<CallReceipt | null>;
  acceptCall(call: ConsultationCall): void;
  createAnswer(room: string, id: string, answer: CallDescription<'answer'>): void;
  createAnswerReceipt(room: string, receipt: CallReceipt): void;
  createActionReceipt(room: string, receipt: CallReceipt): void;
  candidates(room: string, id: string): Promise<readonly CandidateEntry[]>;
  iceState(room: string, id: string, uid: string): Promise<IceSenderState | null>;
  iceReceipt(room: string, uid: string, requestId: string): Promise<IceReceipt | null>;
  createCandidate(room: string, id: string, candidateId: string, value: CallIceCandidate): void;
  saveIceState(room: string, id: string, state: IceSenderState): void;
  createIceReceipt(room: string, receipt: IceReceipt): void;
}
export interface CallLifecycleDependencies {
  now(): DomainTimestamp;
  transact<T>(action: (tx: CallLifecycleTransaction) => Promise<T>): Promise<T>;
}
type Request = { auth?: { uid: string }; data: unknown };
const sameReceipt = (a: CallReceipt, b: CallReceipt) => a.operation === b.operation && a.uid === b.uid
  && a.requestId === b.requestId && a.callId === b.callId && a.fingerprint === b.fingerprint;

/** Shared lifecycle transaction, including C6E ICE. No SDP or candidate logging. */
export function createCallLifecycleHandlers(deps: CallLifecycleDependencies) {
  async function execute(operation: 'respond' | 'end' | 'get' | 'ice', request: Request) {
    const uid = requireAuthenticated(request.auth);
    let input: GetConsultationCallInput;
    let responseInput: RespondToConsultationCallInput | null = null;
    let mutationInput: CallMutationInput | null = null;
    let iceInput: PublishConsultationIceInput | null = null;
    try {
      safeId(uid);
      if (operation === 'respond') { responseInput = validateRespondInput(request.data); mutationInput = responseInput; input = responseInput; }
      else if (operation === 'end') { mutationInput = validateEndInput(request.data); input = mutationInput; }
      else if (operation === 'ice') { iceInput = validatePublishInput(request.data); input = iceInput; }
      else input = validateGetInput(request.data);
    } catch { throw new HttpsError('invalid-argument', 'Invalid call request.'); }
    try {
      const outcome = await deps.transact(async tx => {
        const caller = await createAuthorization(key => tx.identity(key)).requireActive({ uid });
        const raw = await tx.appointment(input.consultationId);
        if (!raw) fail();
        const appointment = validateAppointment(raw);
        if (appointment.appointmentId !== input.consultationId) fail();
        const projection = { appointmentId: appointment.appointmentId, patientId: appointment.patientId, doctorId: appointment.doctorId,
          startAt: appointment.startAt, endAt: appointment.endAt, status: appointment.status };
        if (authorizeHistory(projection, caller) !== uid) fail();
        const room = bindConsultation(await tx.consultation(input.consultationId), projection);
        const control = await tx.control(room.consultationId), inventory = await tx.calls(room.consultationId);
        if (inventory.length !== (control?.attemptCount ?? 0)) fail();
        const nonterminal = inventory.filter(c => c.state !== 'ended');
        if (nonterminal.length > 1 || (nonterminal.length === 1 && nonterminal[0].callId !== control?.activeCallId)
          || (control?.activeCallId && !inventory.some(c => c.callId === control.activeCallId))) fail();
        const targetId = input.callId ?? control?.activeCallId ?? null;
        const target = targetId === null ? null : inventory.find(c => c.callId === targetId) ?? null;
        if (targetId !== null && target === null) fail();
        const active = control?.activeCallId ? inventory.find(c => c.callId === control.activeCallId)! : null;
        let storedAnswer: CallDescription<'answer'> | null = null, acceptedReceipt: CallReceipt | null = null;
        if (target) {
          const offer = await tx.offer(room.consultationId, target.callId), startReceipt = await tx.receipt(room.consultationId, target.callId);
          if (!offer || !startReceipt || offer.senderId !== target.initiatorId || compareTimes(offer.createdAt, target.createdAt) !== 0) fail();
          const expected = makeReceipt('start', target.initiatorId, { consultationId: room.consultationId, requestId: startReceipt.requestId,
            mode: target.mode, offer: { type: offer.type, sdp: offer.sdp } });
          if (!sameReceipt(startReceipt, expected)) fail();
          storedAnswer = await tx.answer(room.consultationId, target.callId);
          acceptedReceipt = await tx.answerReceipt(room.consultationId, target.callId);
          if (target.acceptedAt === null) {
            if (storedAnswer !== null || acceptedReceipt !== null) fail();
          } else {
            if (!storedAnswer || !acceptedReceipt || storedAnswer.senderId !== target.recipientId
              || compareTimes(storedAnswer.createdAt, target.acceptedAt) !== 0) fail();
            const expectedAnswer = makeReceipt('respond', target.recipientId, { consultationId: room.consultationId, callId: target.callId,
              requestId: acceptedReceipt.requestId, action: 'accept', answer: { type: 'answer', sdp: storedAnswer.sdp } });
            if (!sameReceipt(acceptedReceipt, expectedAnswer)) fail();
            const originalRequest = await tx.actionReceipt(room.consultationId, 'respond', target.recipientId, acceptedReceipt.requestId);
            if (!originalRequest || !sameReceipt(originalRequest, acceptedReceipt)) fail();
          }
        }
        const receipt = (operation === 'respond' || operation === 'end') && mutationInput
          ? await tx.actionReceipt(room.consultationId, operation, uid, mutationInput.requestId) : null;
        const iceReceipt = iceInput ? await tx.iceReceipt(room.consultationId, uid, iceInput.requestId) : null;
        const candidates = iceInput && target ? await tx.candidates(room.consultationId, target.callId) : [];
        const iceState = iceInput && target ? await tx.iceState(room.consultationId, target.callId, uid) : null;
        let patient: unknown = null, doctor: unknown = null;
        let profile = null, publicProfile: unknown = null, source = null;
        // New acceptance/ICE need current live eligibility; history/replay/termination do not.
        if ((responseInput?.action === 'accept' && receipt === null) || (iceInput && !iceReceipt)) {
          patient = uid === room.patientId ? caller : await tx.identity(room.patientId);
          doctor = uid === room.doctorId ? caller : await tx.identity(room.doctorId);
          try {
            profile = await tx.profile(room.doctorId); publicProfile = await tx.publicProfile(room.doctorId);
            if (publicProfile && typeof publicProfile === 'object' && 'approvedRequestId' in publicProfile)
              source = await tx.verification(safeId(publicProfile.approvedRequestId));
          } catch (e) {
            if (!(e instanceof DomainValidationError)) throw e;
            profile = null; publicProfile = null; source = null;
          }
        }
        const now = deps.now(); // Final read completed. Same time for every plan; resampled on retry.
        const context: CallContext = { uid, appointment, consultation: room, actors: { caller, patient, doctor },
          approval: { profile, projection: publicProfile, source }, now };
        const closure = appointment.status === 'scheduled' ? {} : { terminalDecisionAt: appointment.status === 'cancelled'
          ? appointment.cancellation.cancelledAt : appointment.outcome.recordedAt };
        const effectiveRoom = reconcileConsultation(room, projection, now, closure);
        const activePlan = active ? planGetCall(context, active) : null;
        const targetPlan = target ? operation === 'get' || (iceInput && iceReceipt) ? planGetCall(context, target)
          : iceInput ? planIceEligibility(context, target, iceInput)
          : planCallAction(context, target, operation as 'respond' | 'end', input, receipt) : null;
        if (operation !== 'get' && !targetPlan) fail();
        let error = targetPlan?.error ?? null;
        let ice: PublishConsultationIceResult | null = null;
        let newCandidates: CallIceCandidate[] = [];
        let newIceReceipt: IceReceipt | null = null;
        if (iceInput && target && targetPlan) {
          checkIceInventory(candidates, iceState, target, uid, now);
          const fingerprint = iceFingerprint(iceInput);
          const ids = iceInput.candidates.map((_, i) => iceCandidateId(iceInput!, uid, i));
          if (iceReceipt) {
            if (iceReceipt.callId === target.callId) checkIceReceipt(iceReceipt, candidates, room.consultationId);
            if (iceReceipt.callId !== target.callId || iceReceipt.fingerprint !== fingerprint) error = 'already-exists';
          } else {
            if (ids.some(id => candidates.some(c => c.id === id))) fail(); // Orphaned batch receipt.
            if (!error && ((iceState?.count ?? 0) + ids.length > CALL_LIMITS.candidatesPerSender
              || (iceState && compareTimes(now, plusSeconds(iceState.lastBatchAt, CALL_LIMITS.batchIntervalSeconds)) < 0))) error = 'resource-exhausted';
          }
          if (!error) {
            ice = validatePublishResult({ call: targetPlan.call, replayed: !!iceReceipt, candidateIds: iceReceipt?.candidateIds ?? ids });
            if (!iceReceipt) {
              newCandidates = iceInput.candidates.map((c, i) => validateStoredCandidate({ ...c, senderId: uid,
                sequence: (iceState?.count ?? 0) + i + 1, createdAt: now, schemaVersion: 1 }));
              newIceReceipt = { senderId: uid, requestId: iceInput.requestId, callId: target.callId, fingerprint, candidateIds: ids, schemaVersion: 1 };
            }
          }
        }
        const mutation = (operation === 'respond' || operation === 'end') && targetPlan && !error
          ? validateMutationResult({ call: targetPlan.call, replayed: targetPlan.replayed }) : null;
        const read = operation === 'get' ? validateGetResult({ call: targetPlan?.call ?? null }) : null;
        const newSuccess = (operation === 'respond' || operation === 'end') && targetPlan && !error && !targetPlan.replayed;
        const newReceipt = newSuccess ? makeReceipt(operation as 'respond' | 'end', uid, input) : null;
        const newAnswer = newSuccess && responseInput?.action === 'accept'
          ? validateStoredDescription({ ...responseInput.answer, senderId: uid, createdAt: targetPlan!.call.acceptedAt, schemaVersion: 1 }, 'answer') : null;
        if (targetPlan?.replayed && responseInput?.action === 'accept'
          && (!receipt || !acceptedReceipt || !sameReceipt(receipt, acceptedReceipt))) fail();
        const finalActive = active && targetPlan?.call.callId === active.callId ? targetPlan : activePlan;
        const clearPointer = control?.activeCallId && finalActive?.call.state === 'ended';
        // No reads below. A returned denial commits reconciliation; thrown corruption/errors roll back.
        if (effectiveRoom.state !== room.state) tx.close(effectiveRoom);
        if (activePlan?.writeCall && activePlan.call.callId !== targetPlan?.call.callId) tx.closeCall(activePlan.call);
        if (targetPlan?.writeCall) {
          if (targetPlan.call.state === 'accepted') tx.acceptCall(targetPlan.call);
          else if (targetPlan.call.state === 'ended') tx.closeCall(targetPlan.call);
        }
        if (newAnswer && newReceipt && target) {
          tx.createAnswer(room.consultationId, target.callId, newAnswer);
          tx.createAnswerReceipt(room.consultationId, newReceipt);
        }
        if (newReceipt) tx.createActionReceipt(room.consultationId, newReceipt);
        if (newIceReceipt && target) {
          newCandidates.forEach((c, i) => tx.createCandidate(room.consultationId, target.callId, newIceReceipt!.candidateIds[i], c));
          tx.saveIceState(room.consultationId, target.callId, { senderId: uid, count: (iceState?.count ?? 0) + newCandidates.length, lastBatchAt: now, schemaVersion: 1 });
          tx.createIceReceipt(room.consultationId, newIceReceipt);
        }
        if (clearPointer && control) tx.saveControl({ ...control, activeCallId: null });
        return { error, mutation, read, ice };
      });
      if (outcome.error) throw new CallPolicyError(outcome.error);
      return outcome;
    } catch (e) {
      if (e instanceof CallPolicyError) throw new HttpsError(e.code, 'Call operation unavailable.');
      if (e instanceof DomainValidationError || (e instanceof HttpsError && e.code === 'permission-denied'))
        throw new HttpsError('permission-denied', 'Call operation unavailable.');
      throw new HttpsError('internal', 'Unable to process call. Please retry later.');
    }
  }
  return {
    async respond(request: Request): Promise<CallMutationResult> { const r = await execute('respond', request); if (!r.mutation) throw new HttpsError('internal', 'Call unavailable.'); return r.mutation; },
    async end(request: Request): Promise<CallMutationResult> { const r = await execute('end', request); if (!r.mutation) throw new HttpsError('internal', 'Call unavailable.'); return r.mutation; },
    async get(request: Request): Promise<GetConsultationCallResult> { const r = await execute('get', request); if (!r.read) throw new HttpsError('internal', 'Call unavailable.'); return r.read; },
    async publishIce(request: Request): Promise<PublishConsultationIceResult> { const r = await execute('ice', request); if (!r.ice) throw new HttpsError('internal', 'Call unavailable.'); return r.ice; },
  };
}
