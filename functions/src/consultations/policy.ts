import type { Consultation, ConsultationAppointment, ConsultationClosureContext } from '../../../shared/types/consultationContracts';
import type { DomainTimestamp } from '../../../shared/types/profiles';
import { validIdentity } from '../auth/registrationPolicy';
import { fail, safeId, strictRecord } from '../profiles/domainValidation';
import { compareTimes, schedulingTimestamp } from '../scheduling/primitives';
import { bindConsultation, consultationId, messageId, MESSAGE_INTERVAL_MS, plusSeconds, POST_END_GRACE_MS,
  validateAppointmentProjection, validateConsultation, validateMessage, validateOpenInput, validateSendInput, validateSendState } from './domain';

/** These identities must be resolved by trusted handlers, never from callable payloads. */
export interface ConsultationActors { readonly caller: unknown; readonly patient: unknown; readonly doctor: unknown }
export function authorizeHistory(appointment: ConsultationAppointment, caller: unknown): string {
  const a = validateAppointmentProjection(appointment);
  if (!validIdentity(caller) || caller.status !== 'active') return fail('consultation-access-denied');
  const uid = safeId(caller.uid);
  if (!((caller.role === 'patient' && uid === a.patientId) || (caller.role === 'doctor' && uid === a.doctorId))) fail('consultation-access-denied');
  return uid;
}
export function authorizeNew(appointment: ConsultationAppointment, actors: ConsultationActors): string {
  const uid = authorizeHistory(appointment, actors.caller);
  const { patient, doctor } = actors;
  if (!validIdentity(patient) || patient.uid !== appointment.patientId || patient.role !== 'patient' || patient.status !== 'active'
    || !validIdentity(doctor) || doctor.uid !== appointment.doctorId || doctor.role !== 'doctor' || doctor.status !== 'active'
    || doctor.verificationStatus !== 'approved') fail('consultation-send-denied');
  // A caller and its participant identity must be the same canonical snapshot.
  const participant = uid === appointment.patientId ? patient : doctor;
  if (Object.keys(participant).some(k => (participant as any)[k] !== (actors.caller as any)[k])) fail('inconsistent-caller-identity');
  // Pure policy cannot establish profile/projection binding: later transaction MUST enforce it.
  return uid;
}
export function assertSendWindow(appointment: ConsultationAppointment, trustedNow: DomainTimestamp): void {
  const a = validateAppointmentProjection(appointment), now = schedulingTimestamp(trustedNow);
  if (a.status !== 'scheduled' || compareTimes(now, a.startAt) < 0
    || compareTimes(now, plusSeconds(a.endAt, POST_END_GRACE_MS / 1000)) >= 0) fail('consultation-window-closed');
}
/** Terminal metadata is a separate trusted adapter input, not copied appointment status. */
export function reconcileConsultation(value: unknown, appointment: ConsultationAppointment, trustedNow: DomainTimestamp,
  closure: ConsultationClosureContext = {}): Consultation {
  const a = validateAppointmentProjection(appointment), c = bindConsultation(value, a), now = schedulingTimestamp(trustedNow);
  const metadata = strictRecord(closure, ['terminalDecisionAt']);
  if (compareTimes(now, c.createdAt) < 0 || (c.closedAt && compareTimes(now, c.closedAt) < 0)) fail('consultation-clock-regression');
  let terminalAt: DomainTimestamp | null = null;
  if (Object.hasOwnProperty.call(metadata, 'terminalDecisionAt')) {
    terminalAt = schedulingTimestamp(metadata.terminalDecisionAt);
    if (a.status === 'scheduled' || compareTimes(terminalAt, now) > 0 || compareTimes(terminalAt, c.createdAt) < 0
      || (a.status === 'cancelled' ? compareTimes(terminalAt, a.startAt) >= 0 : compareTimes(terminalAt, a.endAt) < 0)) fail('invalid-terminal-time');
  }
  if (c.state === 'closed') return c; // Never reopen or rewrite the first persisted closure.
  const deadline = plusSeconds(a.endAt, POST_END_GRACE_MS / 1000);
  if (a.status === 'scheduled' && compareTimes(now, deadline) < 0) return c;
  // Missing terminal metadata: first trusted observation, capped by earlier expiry.
  const observed = a.status === 'scheduled' ? deadline : terminalAt ?? now;
  const closedAt = compareTimes(observed, deadline) < 0 ? observed : deadline;
  return validateConsultation({ ...c, state: 'closed', closedAt });
}
export function planOpen(input: unknown, appointment: ConsultationAppointment, existing: unknown | null,
  actors: ConsultationActors, trustedNow: DomainTimestamp, closure: ConsultationClosureContext = {}) {
  const request = validateOpenInput(input), a = validateAppointmentProjection(appointment), now = schedulingTimestamp(trustedNow);
  if (request.appointmentId !== a.appointmentId) fail('appointment-binding');
  authorizeHistory(a, actors.caller);
  if (existing !== null) {
    const before = bindConsultation(existing, a), consultation = reconcileConsultation(before, a, now, closure);
    return Object.freeze({ action: before.state === consultation.state ? 'return' as const : 'close' as const, consultation });
  }
  authorizeNew(a, actors); assertSendWindow(a, now);
  if (Reflect.ownKeys(strictRecord(closure, ['terminalDecisionAt'])).length) fail('invalid-terminal-time');
  const consultation = validateConsultation({ consultationId: a.appointmentId, appointmentId: a.appointmentId,
    patientId: a.patientId, doctorId: a.doctorId, appointmentStartAt: a.startAt, appointmentEndAt: a.endAt,
    state: 'active', createdAt: now, closedAt: null, schemaVersion: 1 });
  return Object.freeze({ action: 'create' as const, consultation });
}
export function planRate(room: string, sender: string, existing: unknown | null, trustedNow: DomainTimestamp) {
  const id = consultationId(room), uid = safeId(sender), now = schedulingTimestamp(trustedNow);
  if (existing !== null) {
    const state = validateSendState(existing);
    if (state.consultationId !== id || state.senderId !== uid) fail('rate-state-binding');
    if (compareTimes(now, plusSeconds(state.lastAcceptedAt, MESSAGE_INTERVAL_MS / 1000)) < 0) fail('message-rate-limited');
  }
  return validateSendState({ consultationId: id, senderId: uid, lastAcceptedAt: now, schemaVersion: 1 });
}
/** Pure plan: future transaction reads all dependencies then atomically creates message + updates rate state. */
export function planSend(input: unknown, appointment: ConsultationAppointment, room: unknown, existingMessage: unknown | null,
  existingRate: unknown | null, actors: ConsultationActors, trustedNow: DomainTimestamp, closure: ConsultationClosureContext = {}) {
  const request = validateSendInput(input), a = validateAppointmentProjection(appointment), c = bindConsultation(room, a);
  if (request.consultationId !== c.consultationId) fail('consultation-binding');
  const uid = authorizeHistory(a, actors.caller), id = messageId(c.consultationId, uid, request.messageRequestId);
  const now = schedulingTimestamp(trustedNow);
  const effective = reconcileConsultation(c, a, now, closure);
  if (existingMessage !== null) {
    const message = validateMessage(existingMessage);
    if (message.messageId !== id || message.senderId !== uid || message.text !== request.text) fail('conflicting-message-retry');
    if (compareTimes(message.createdAt, c.createdAt) < 0 || compareTimes(message.createdAt, now) > 0
      || compareTimes(message.createdAt, plusSeconds(a.endAt, POST_END_GRACE_MS / 1000)) >= 0
      || (effective.closedAt && compareTimes(message.createdAt, effective.closedAt) > 0)) fail('invalid-message-time');
    return Object.freeze({ action: 'replay' as const, message, rateState: null });
  }
  authorizeNew(a, actors); assertSendWindow(a, now);
  if (effective.state !== 'active') fail('consultation-closed');
  const rateState = planRate(c.consultationId, uid, existingRate, now);
  const message = validateMessage({ messageId: id, senderId: uid, type: 'text', text: request.text, createdAt: now, schemaVersion: 1 });
  return Object.freeze({ action: 'create' as const, message, rateState });
}
