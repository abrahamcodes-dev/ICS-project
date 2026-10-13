import { HttpsError } from 'firebase-functions/v2/https';
import type { ConsultationCall, CallDescription, StartConsultationCallResult } from '../../../../shared/types/consultationCallContracts';
import type { DomainTimestamp } from '../../../../shared/types/profiles';
import type { ConsultationTransaction } from '../openHandler';
import { createAuthorization, requireAuthenticated } from '../../shared/authorization';
import { DomainValidationError, fail, safeId } from '../../profiles/domainValidation';
import { validateAppointment } from '../../scheduling/validation';
import { compareTimes } from '../../scheduling/primitives';
import { bindConsultation } from '../domain';
import { authorizeHistory } from '../policy';
import { callId, validateMutationResult, validateStartInput, validateStoredDescription } from './domain';
import { CallPolicyError, makeReceipt, planStartCall, type CallReceipt } from './policy';

/** Backend-only state. Absent means no calls; a persisted state always counts at least one creation. */
export interface CallControl { consultationId: string; activeCallId: string | null; attemptCount: number; schemaVersion: 1 }
export interface StartCallTransaction extends Pick<ConsultationTransaction, 'identity' | 'appointment' | 'consultation' | 'profile' | 'publicProfile' | 'verification' | 'close'> {
  control(room: string): Promise<CallControl | null>;
  calls(room: string): Promise<readonly ConsultationCall[]>;
  call(room: string, id: string): Promise<ConsultationCall | null>;
  offer(room: string, id: string): Promise<CallDescription<'offer'> | null>;
  receipt(room: string, id: string): Promise<CallReceipt | null>;
  createCall(call: ConsultationCall): void;
  createOffer(room: string, id: string, offer: CallDescription<'offer'>): void;
  createReceipt(room: string, receipt: CallReceipt): void;
  saveControl(control: CallControl): void;
  closeCall(call: ConsultationCall): void;
}
export interface StartCallDependencies {
  now(): DomainTimestamp;
  transact<T>(action: (tx: StartCallTransaction) => Promise<T>): Promise<T>;
}

/** No logging. Errors and successful responses never include SDP or private control state. */
export function createStartConsultationCallHandler(deps: StartCallDependencies) {
  return async (request: { auth?: { uid: string }; data: unknown }): Promise<StartConsultationCallResult> => {
    const uid = requireAuthenticated(request.auth);
    let input;
    try { safeId(uid); input = validateStartInput(request.data); }
    catch { throw new HttpsError('invalid-argument', 'Invalid call request.'); }
    try {
      const outcome = await deps.transact(async tx => {
        const caller = await createAuthorization(key => tx.identity(key)).requireActive({ uid });
        const rawAppointment = await tx.appointment(input.consultationId);
        if (!rawAppointment) fail();
        const appointment = validateAppointment(rawAppointment);
        if (appointment.appointmentId !== input.consultationId) fail();
        const projection = { appointmentId: appointment.appointmentId, patientId: appointment.patientId, doctorId: appointment.doctorId,
          startAt: appointment.startAt, endAt: appointment.endAt, status: appointment.status };
        if (authorizeHistory(projection, caller) !== uid) fail();
        const room = bindConsultation(await tx.consultation(input.consultationId), projection);
        const id = callId(room.consultationId, uid, input.requestId);
        const control = await tx.control(room.consultationId);
        // At most eight calls exist. Check the complete bounded metadata inventory so a
        // corrupt null pointer/count cannot silently reset allowance or hide a live call.
        const calls = await tx.calls(room.consultationId);
        if (calls.length !== (control?.attemptCount ?? 0)) fail();
        const nonterminal = calls.filter(call => call.state !== 'ended');
        if (nonterminal.length > 1 || (nonterminal.length === 1 && nonterminal[0].callId !== control?.activeCallId)
          || (control?.activeCallId && !calls.some(call => call.callId === control.activeCallId))) fail();
        const existing = await tx.call(room.consultationId, id);
        const offer = await tx.offer(room.consultationId, id);
        const receipt = await tx.receipt(room.consultationId, id);
        if ((existing === null) !== (offer === null) || (existing === null) !== (receipt === null)) fail();
        if (existing && offer && receipt) {
          if (offer.senderId !== existing.initiatorId || compareTimes(offer.createdAt, existing.createdAt) !== 0) fail();
          // Verify persisted offer/mode against the original receipt, independently of retry payload.
          const originalReceipt = makeReceipt('start', existing.initiatorId, { consultationId: room.consultationId,
            requestId: receipt.requestId, mode: existing.mode, offer: { type: offer.type, sdp: offer.sdp } });
          if (JSON.stringify(originalReceipt) !== JSON.stringify(receipt)) fail();
        }
        const active = control?.activeCallId ? control.activeCallId === id ? existing : await tx.call(room.consultationId, control.activeCallId) : null;
        let patient: unknown = null, doctor: unknown = null;
        let profile = null, publicProfile: unknown = null, source = null;
        if (receipt === null) {
          patient = uid === room.patientId ? caller : await tx.identity(room.patientId);
          doctor = uid === room.doctorId ? caller : await tx.identity(room.doctorId);
          try {
            profile = await tx.profile(room.doctorId);
            publicProfile = await tx.publicProfile(room.doctorId);
            if (publicProfile && typeof publicProfile === 'object' && 'approvedRequestId' in publicProfile) {
              source = await tx.verification(safeId(publicProfile.approvedRequestId));
            }
          } catch (error) {
            // Corrupt approval denies a new start, but must not prevent history-authorized closure.
            if (!(error instanceof DomainValidationError)) throw error;
            profile = null; publicProfile = null; source = null;
          }
        }
        const now = deps.now(); // All reads completed; refreshed on every transaction retry.
        const plan = planStartCall({ uid, appointment, consultation: room, actors: { caller, patient, doctor },
          approval: { profile, projection: publicProfile, source }, now }, input, {
          attemptCount: control?.attemptCount ?? 0, activeCallId: control?.activeCallId ?? null,
          activeCall: active, existingCall: existing, receipt,
        });
        const result = plan.error === null && plan.call ? validateMutationResult({ call: plan.call, replayed: plan.replayed }) : null;
        const newOffer = plan.create && plan.call ? validateStoredDescription({ ...input.offer, senderId: uid, createdAt: plan.call.createdAt, schemaVersion: 1 }, 'offer') : null;
        // Writes begin here. Return denial, rather than throw, to commit required reconciliation.
        if (plan.writeConsultation) tx.close(plan.consultation);
        if (plan.previous?.writeCall) tx.closeCall(plan.previous.call);
        if (plan.create && plan.call && newOffer) {
          tx.createCall(plan.call);
          tx.createOffer(room.consultationId, id, newOffer);
          tx.createReceipt(room.consultationId, makeReceipt('start', uid, input));
        }
        if (plan.create || (control && control.activeCallId !== plan.activeCallId)) {
          tx.saveControl({ consultationId: room.consultationId, activeCallId: plan.activeCallId, attemptCount: plan.attemptCount, schemaVersion: 1 });
        }
        return { error: plan.error, result };
      });
      if (outcome.error) throw new CallPolicyError(outcome.error);
      if (!outcome.result) throw new Error('missing-call-result');
      return outcome.result;
    } catch (error) {
      if (error instanceof CallPolicyError) throw new HttpsError(error.code, 'Call operation unavailable.');
      if (error instanceof DomainValidationError || (error instanceof HttpsError && error.code === 'permission-denied'))
        throw new HttpsError('permission-denied', 'Call operation unavailable.');
      throw new HttpsError('internal', 'Unable to start call. Please retry later.');
    }
  };
}
