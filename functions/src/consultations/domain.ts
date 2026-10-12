import { createHash } from 'crypto';
import type { Consultation, ConsultationAppointment, ConsultationMessage, ConsultationSendState,
  OpenConsultationInput, SendConsultationMessageInput } from '../../../shared/types/consultationContracts';
import type { DomainTimestamp } from '../../../shared/types/profiles';
import { fail, safeId, strictRecord } from '../profiles/domainValidation';
import { bookingRequestId, compareTimes, schedulingTimestamp } from '../scheduling/primitives';
import { digestId } from '../scheduling/ids';
export const PRE_START_GRACE_MS = 0;
export const POST_END_GRACE_MS = 15 * 60 * 1000;
export const MESSAGE_INTERVAL_MS = 1000;
export const RAW_TEXT_MAX = 16000;
export const TEXT_MAX = 4000;
export const consultationId = digestId;
export function plusSeconds(time: DomainTimestamp, seconds: number): DomainTimestamp {
  const t = schedulingTimestamp(time);
  return schedulingTimestamp({ seconds: t.seconds + seconds, nanoseconds: t.nanoseconds });
}
export function normalizeMessageText(value: unknown): string {
  if (typeof value !== 'string' || value.length > RAW_TEXT_MAX) return fail('invalid-message-text');
  const lines = value.replace(/\r\n?/g, '\n');
  // Check before trim, which would otherwise hide forbidden edge controls.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(lines)) fail('invalid-message-text');
  for (let i = 0; i < lines.length; i++) {
    const code = lines.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = lines.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('invalid-message-text');
    } else if (code >= 0xdc00 && code <= 0xdfff) fail('invalid-message-text');
  }
  const text = lines.trim();
  if (!text || text.length > TEXT_MAX) fail('invalid-message-text');
  return text;
}
export function validateOpenInput(value: unknown): OpenConsultationInput {
  const d = strictRecord(value, ['appointmentId'], ['appointmentId']);
  return Object.freeze({ appointmentId: consultationId(d.appointmentId) });
}
export function validateSendInput(value: unknown): SendConsultationMessageInput {
  const fields = ['consultationId', 'messageRequestId', 'text'];
  const d = strictRecord(value, fields, fields);
  return Object.freeze({ consultationId: consultationId(d.consultationId), messageRequestId: bookingRequestId(d.messageRequestId), text: normalizeMessageText(d.text) });
}
export function messageId(room: unknown, sender: unknown, requestId: unknown): string {
  return createHash('sha256').update(JSON.stringify([consultationId(room), safeId(sender), bookingRequestId(requestId)]), 'utf8').digest('hex');
}
export function validateAppointmentProjection(value: unknown): ConsultationAppointment {
  const fields = ['appointmentId', 'patientId', 'doctorId', 'startAt', 'endAt', 'status'];
  const d = strictRecord(value, fields, fields);
  const patientId = safeId(d.patientId), doctorId = safeId(d.doctorId);
  const startAt = schedulingTimestamp(d.startAt), endAt = schedulingTimestamp(d.endAt);
  if (patientId === doctorId || compareTimes(endAt, startAt) <= 0
    || !['scheduled', 'cancelled', 'completed', 'no_show'].includes(d.status as string)) fail('invalid-consultation-appointment');
  plusSeconds(endAt, POST_END_GRACE_MS / 1000);
  return Object.freeze({ appointmentId: consultationId(d.appointmentId), patientId, doctorId, startAt, endAt, status: d.status as ConsultationAppointment['status'] });
}
export function validateConsultation(value: unknown): Consultation {
  const fields = ['consultationId', 'appointmentId', 'patientId', 'doctorId', 'appointmentStartAt', 'appointmentEndAt', 'state', 'createdAt', 'closedAt', 'schemaVersion'];
  const d = strictRecord(value, fields, fields);
  const a = validateAppointmentProjection({ appointmentId: d.appointmentId, patientId: d.patientId, doctorId: d.doctorId,
    startAt: d.appointmentStartAt, endAt: d.appointmentEndAt, status: 'scheduled' });
  const createdAt = schedulingTimestamp(d.createdAt), deadline = plusSeconds(a.endAt, POST_END_GRACE_MS / 1000);
  if (d.consultationId !== a.appointmentId || d.schemaVersion !== 1 || compareTimes(createdAt, a.startAt) < 0 || compareTimes(createdAt, deadline) >= 0) fail('invalid-consultation');
  const base = { consultationId: a.appointmentId, appointmentId: a.appointmentId, patientId: a.patientId, doctorId: a.doctorId,
    appointmentStartAt: a.startAt, appointmentEndAt: a.endAt, createdAt, schemaVersion: 1 as const };
  if (d.state === 'active' && d.closedAt === null) return Object.freeze({ ...base, state: 'active', closedAt: null });
  if (d.state !== 'closed') return fail('invalid-consultation-state');
  const closedAt = schedulingTimestamp(d.closedAt);
  if (compareTimes(closedAt, createdAt) < 0 || compareTimes(closedAt, deadline) > 0) fail('invalid-closure-time');
  return Object.freeze({ ...base, state: 'closed', closedAt });
}
export function bindConsultation(value: unknown, appointment: ConsultationAppointment): Consultation {
  const c = validateConsultation(value), a = validateAppointmentProjection(appointment);
  if (c.appointmentId !== a.appointmentId || c.patientId !== a.patientId || c.doctorId !== a.doctorId
    || compareTimes(c.appointmentStartAt, a.startAt) !== 0 || compareTimes(c.appointmentEndAt, a.endAt) !== 0) fail('consultation-binding');
  return c;
}
export function validateMessage(value: unknown): ConsultationMessage {
  const fields = ['messageId', 'senderId', 'type', 'text', 'createdAt', 'schemaVersion'];
  const d = strictRecord(value, fields, fields), text = normalizeMessageText(d.text);
  if (d.type !== 'text' || d.schemaVersion !== 1 || d.text !== text) fail('invalid-message');
  return Object.freeze({ messageId: digestId(d.messageId), senderId: safeId(d.senderId), type: 'text', text,
    createdAt: schedulingTimestamp(d.createdAt), schemaVersion: 1 });
}
export function validateSendState(value: unknown): ConsultationSendState {
  const fields = ['consultationId', 'senderId', 'lastAcceptedAt', 'schemaVersion'];
  const d = strictRecord(value, fields, fields);
  if (d.schemaVersion !== 1) fail('invalid-send-state');
  return Object.freeze({ consultationId: consultationId(d.consultationId), senderId: safeId(d.senderId),
    lastAcceptedAt: schedulingTimestamp(d.lastAcceptedAt), schemaVersion: 1 });
}
