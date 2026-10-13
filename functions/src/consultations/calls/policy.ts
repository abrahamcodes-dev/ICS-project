import { createHash } from 'crypto';
import type { ConsultationCall, ConsultationCallErrorCode } from '../../../../shared/types/consultationCallContracts';
import type { Consultation } from '../../../../shared/types/consultationContracts';
import type { DoctorProfile, DomainTimestamp } from '../../../../shared/types/profiles';
import type { VerificationRequest } from '../../../../shared/types/verification';
import { DomainValidationError, fail, safeId, strictRecord } from '../../profiles/domainValidation';
import { validateApprovedDoctorBinding } from '../../scheduling/approvalBinding';
import { validateAppointment } from '../../scheduling/validation';
import { compareTimes, schedulingTimestamp } from '../../scheduling/primitives';
import { digestId } from '../../scheduling/ids';
import { bindConsultation, plusSeconds, POST_END_GRACE_MS } from '../domain';
import { authorizeHistory, authorizeNew, assertSendWindow, reconcileConsultation, type ConsultationActors } from '../policy';
import { CALL_LIMITS, callId, validateCall, validateStartInput, validateRespondInput, validateEndInput, validatePublishInput } from './domain';

/** Supplied exclusively from authenticated UID and transaction snapshots, never request fields.
 * Adapters must finish all dependency reads THEN sample now once per transaction attempt. */
export interface CallContext {
  uid: string; appointment: unknown; consultation: unknown; actors: ConsultationActors;
  approval: { profile: DoctorProfile | null; projection: unknown; source: VerificationRequest | null };
  now: DomainTimestamp;
}
export class CallPolicyError extends Error {
  constructor(public readonly code: ConsultationCallErrorCode) { super(code); this.name = 'CallPolicyError'; }
}
function deny(code: ConsultationCallErrorCode): never { throw new CallPolicyError(code); }
function checked<T>(code: ConsultationCallErrorCode, action: () => T): T {
  try { return action(); } catch (e) { if (e instanceof DomainValidationError) deny(code); throw e; }
}
function history(c: CallContext) {
  return checked('permission-denied', () => {
    safeId(c.uid);
    const a = validateAppointment(c.appointment);
    const projection = { appointmentId: a.appointmentId, patientId: a.patientId, doctorId: a.doctorId, startAt: a.startAt, endAt: a.endAt, status: a.status };
    if (authorizeHistory(projection, c.actors.caller) !== c.uid) fail();
    const original = bindConsultation(c.consultation, projection), now = schedulingTimestamp(c.now);
    const closure = a.status === 'scheduled' ? {} : { terminalDecisionAt: a.status === 'cancelled' ? a.cancellation.cancelledAt : a.outcome.recordedAt };
    const consultation = reconcileConsultation(original, projection, now, closure);
    return { a, projection, original, consultation, now };
  });
}
type History = ReturnType<typeof history>;
function live(c: CallContext, h: History) {
  checked('permission-denied', () => {
    authorizeNew(h.projection, c.actors);
    validateApprovedDoctorBinding(h.a.doctorId, c.approval.profile, c.approval.projection, c.approval.source);
  });
  if (h.consultation.state !== 'active') deny('failed-precondition');
  checked('failed-precondition', () => assertSendWindow(h.projection, h.now));
}
function bound(value: unknown, h: History): ConsultationCall {
  return checked('permission-denied', () => {
    const call = validateCall(value), room = h.original;
    if (call.consultationId !== room.consultationId || call.appointmentId !== room.appointmentId
      || call.patientId !== room.patientId || call.doctorId !== room.doctorId
      || compareTimes(call.createdAt, room.createdAt) < 0 || compareTimes(call.createdAt, h.now) > 0
      || (call.acceptedAt && compareTimes(call.acceptedAt, h.now) > 0) || (call.endedAt && compareTimes(call.endedAt, h.now) > 0)
      || compareTimes(call.expiresAt, plusSeconds(h.a.endAt, POST_END_GRACE_MS / 1000)) !== 0
      || (h.consultation.closedAt && compareTimes(call.createdAt, h.consultation.closedAt) > 0)) fail();
    return call;
  });
}
function reconcile(call: ConsultationCall, h: History): ConsultationCall {
  if (call.state === 'ended') return call;
  // Earliest terminal event wins. At equal times: consultation closure, expiry, ring timeout.
  const events: { at: DomainTimestamp; reason: 'consultation_closed' | 'expired' | 'ring_timeout' }[] = [];
  if (h.consultation.closedAt) events.push({ at: h.consultation.closedAt, reason: compareTimes(h.consultation.closedAt, call.expiresAt) === 0 ? 'expired' : 'consultation_closed' });
  events.push({ at: call.expiresAt, reason: 'expired' });
  if (call.state === 'ringing') events.push({ at: call.ringExpiresAt, reason: 'ring_timeout' });
  events.sort((a, b) => compareTimes(a.at, b.at));
  const event = events[0];
  if (compareTimes(h.now, event.at) < 0) return call;
  return checked('permission-denied', () => validateCall({ ...call, state: 'ended', endedAt: event.at, endReason: event.reason }));
}
export interface CallPlan {
  readonly call: ConsultationCall; readonly consultation: Consultation;
  readonly writeCall: boolean; readonly writeConsultation: boolean;
  readonly replayed: boolean; readonly error: ConsultationCallErrorCode | null;
}
function plan(original: ConsultationCall, call: ConsultationCall, h: History, replayed = false, error: ConsultationCallErrorCode | null = null): CallPlan {
  return Object.freeze({ call, consultation: h.consultation, writeCall: original !== call,
    writeConsultation: h.original.state !== h.consultation.state, replayed, error });
}
/** Private receipt schema; transaction adapter must read by operation+authenticated UID+request UUID.
 * Receipt is created atomically with the successful operation; rejected plans never create receipts. */
export interface CallReceipt { operation: 'start' | 'respond' | 'end'; uid: string; requestId: string; callId: string; fingerprint: string }
export function makeReceipt(operation: CallReceipt['operation'], uid: string, value: unknown): Readonly<CallReceipt> {
  const input = checked('invalid-argument', () => operation === 'start' ? validateStartInput(value) : operation === 'respond' ? validateRespondInput(value) : validateEndInput(value));
  const id = 'callId' in input ? input.callId : callId(input.consultationId, uid, input.requestId);
  return Object.freeze({ operation, uid: safeId(uid), requestId: input.requestId, callId: id,
    fingerprint: createHash('sha256').update(JSON.stringify(input), 'utf8').digest('hex') });
}
function replay(stored: unknown | null, expected: CallReceipt): boolean {
  if (stored === null) return false;
  const receipt = checked('permission-denied', () => {
    const d = strictRecord(stored, ['operation', 'uid', 'requestId', 'callId', 'fingerprint'], ['operation', 'uid', 'requestId', 'callId', 'fingerprint']);
    digestId(d.fingerprint); digestId(d.callId);
    if (d.operation !== expected.operation || d.uid !== expected.uid || d.requestId !== expected.requestId || d.callId !== expected.callId) fail();
    return d;
  });
  if (receipt.fingerprint !== expected.fingerprint) deny('already-exists');
  return true;
}
/** Historical metadata and safe reconciliation do not require counterpart/approval eligibility. */
export function planGetCall(c: CallContext, value: unknown): CallPlan {
  const h = history(c), original = bound(value, h);
  return plan(original, reconcile(original, h), h);
}
/** Returned denials retain closure writes. Future adapters commit them before surfacing error. */
export function planCallAction(c: CallContext, value: unknown, operation: 'respond' | 'end', input: unknown, receipt: unknown | null = null): CallPlan {
  const request = checked('invalid-argument', () => operation === 'respond' ? validateRespondInput(input) : validateEndInput(input));
  const h = history(c), original = bound(value, h);
  if (request.consultationId !== original.consultationId || request.callId !== original.callId) deny('permission-denied');
  const current = reconcile(original, h);
  try {
    if (replay(receipt, makeReceipt(operation, c.uid, request))) {
      // A receipt cannot substantiate an operation contradicted by the stored aggregate.
      if (operation === 'respond') {
        if (c.uid !== original.recipientId) deny('permission-denied');
        if ('action' in request && request.action === 'accept' ? original.acceptedAt === null
          : original.state !== 'ended' || original.endReason !== 'rejected') deny('permission-denied');
      } else if (original.state !== 'ended' || !['cancelled', 'hangup'].includes(original.endReason)
        || (original.endReason === 'cancelled' && c.uid !== original.initiatorId)) deny('permission-denied');
      return plan(original, current, h, true);
    }
    if (current.state === 'ended') deny('failed-precondition');
    if (operation === 'respond') {
      if (c.uid !== current.recipientId) deny('permission-denied');
      if (current.state !== 'ringing') deny('failed-precondition');
      if ('action' in request && request.action === 'accept') {
        live(c, h);
        return plan(original, validateCall({ ...current, state: 'accepted', acceptedAt: h.now }), h);
      }
      return plan(original, validateCall({ ...current, state: 'ended', endReason: 'rejected', endedAt: h.now }), h);
    }
    if (current.state === 'ringing' && c.uid !== current.initiatorId) deny('permission-denied');
    return plan(original, validateCall({ ...current, state: 'ended', endReason: current.state === 'ringing' ? 'cancelled' : 'hangup', endedAt: h.now }), h);
  } catch (e) { if (e instanceof CallPolicyError) return plan(original, current, h, false, e.code); throw e; }
}
export interface StartState {
  /** Number of successfully created calls, not request attempts; 0..8. */
  attemptCount: number; activeCallId: string | null; activeCall: unknown | null;
  existingCall: unknown | null; receipt: unknown | null;
}
export interface StartPlan {
  readonly call: ConsultationCall | null; readonly previous: CallPlan | null; readonly consultation: Consultation;
  readonly writeConsultation: boolean; readonly create: boolean; readonly attemptCount: number;
  readonly activeCallId: string | null; readonly replayed: boolean; readonly error: ConsultationCallErrorCode | null;
}
export function planStartCall(c: CallContext, input: unknown, state: StartState): StartPlan {
  const request = checked('invalid-argument', () => validateStartInput(input)), h = history(c);
  if (request.consultationId !== h.original.consultationId) deny('permission-denied');
  if (!Number.isInteger(state.attemptCount) || state.attemptCount < 0 || state.attemptCount > CALL_LIMITS.attemptsPerConsultation
    || (state.activeCallId === null) !== (state.activeCall === null)) deny('permission-denied');
  const previous = state.activeCall === null ? null : planGetCall(c, state.activeCall);
  if (previous && (previous.call.callId !== state.activeCallId || state.attemptCount === 0)) deny('permission-denied');
  const id = callId(request.consultationId, c.uid, request.requestId);
  const existing = state.existingCall === null ? null : bound(state.existingCall, h);
  if (existing && (existing.callId !== id || existing.initiatorId !== c.uid || state.attemptCount === 0)) deny('permission-denied');
  if (existing && state.activeCallId === existing.callId
    && JSON.stringify(existing) !== JSON.stringify(bound(state.activeCall, h))) deny('permission-denied');
  const result = (call: ConsultationCall | null, create: boolean, replayed: boolean, error: ConsultationCallErrorCode | null): StartPlan => Object.freeze({
    call, previous, consultation: h.consultation, writeConsultation: h.original.state !== h.consultation.state,
    create, attemptCount: state.attemptCount + (create ? 1 : 0), activeCallId: create ? id : previous?.call.state !== 'ended' ? state.activeCallId : null, replayed, error });
  try {
    if (replay(state.receipt, makeReceipt('start', c.uid, request))) {
      if (!existing || existing.mode !== request.mode) deny('permission-denied');
      if (existing.state !== 'ended' && state.activeCallId !== existing.callId) deny('permission-denied');
      return result(reconcile(existing, h), false, true, null);
    }
    if (existing) deny('permission-denied'); // A created call without its atomic receipt is corrupt.
    live(c, h);
    if (previous && previous.call.state !== 'ended') deny('failed-precondition');
    if (state.attemptCount === CALL_LIMITS.attemptsPerConsultation) deny('resource-exhausted');
    const expiresAt = plusSeconds(h.a.endAt, POST_END_GRACE_MS / 1000);
    const left = expiresAt.seconds - h.now.seconds;
    const capped = left < CALL_LIMITS.ringSeconds || (left === CALL_LIMITS.ringSeconds && expiresAt.nanoseconds <= h.now.nanoseconds);
    const call = validateCall({ callId: id, consultationId: request.consultationId, appointmentId: request.consultationId,
      patientId: h.a.patientId, doctorId: h.a.doctorId, initiatorId: c.uid, recipientId: c.uid === h.a.patientId ? h.a.doctorId : h.a.patientId,
      mode: request.mode, state: 'ringing', createdAt: h.now, ringExpiresAt: capped ? expiresAt : plusSeconds(h.now, CALL_LIMITS.ringSeconds),
      expiresAt, acceptedAt: null, endedAt: null, endReason: null, schemaVersion: 1 });
    return result(call, true, false, null);
  } catch (e) { if (e instanceof CallPolicyError) return result(null, false, false, e.code); throw e; }
}
/** C6E foundation only: no candidate writes, receipts, counters or rate decisions here. */
export function planIceEligibility(c: CallContext, value: unknown, input: unknown): CallPlan & { readonly senderId: string } {
  const request = checked('invalid-argument', () => validatePublishInput(input)), h = history(c), original = bound(value, h);
  if (request.callId !== original.callId || request.consultationId !== original.consultationId) deny('permission-denied');
  const current = reconcile(original, h);
  try {
    if (current.state !== 'accepted') deny('failed-precondition');
    live(c, h);
    return Object.freeze({ ...plan(original, current, h), senderId: c.uid });
  } catch (e) { if (e instanceof CallPolicyError) return Object.freeze({ ...plan(original, current, h, false, e.code), senderId: c.uid }); throw e; }
}
