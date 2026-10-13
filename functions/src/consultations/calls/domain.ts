import { createHash } from 'crypto';
import type { CallMode, CallDescriptionInput, CallDescription, CallIceInput, CallIceCandidate, ConsultationCall,
  StartConsultationCallInput, RespondToConsultationCallInput, EndConsultationCallInput,
  PublishConsultationIceInput, GetConsultationCallInput, CallMutationResult, PublishConsultationIceResult,
  GetConsultationCallResult } from '../../../../shared/types/consultationCallContracts';
import { fail, safeId, strictRecord } from '../../profiles/domainValidation';
import { bookingRequestId, compareTimes, schedulingTimestamp } from '../../scheduling/primitives';
import { digestId } from '../../scheduling/ids';
import { plusSeconds } from '../domain';

export const CALL_LIMITS = Object.freeze({ ringSeconds: 60, sdpBytes: 64 * 1024, candidateBytes: 2 * 1024,
  candidatesPerBatch: 32, candidatesPerSender: 128, batchIntervalSeconds: 1, attemptsPerConsultation: 8 });
const exact = (v: unknown, fields: readonly string[]) => strictRecord(v, fields, fields);
function mode(v: unknown): CallMode { if (v !== 'audio' && v !== 'video') return fail('invalid-call-mode'); return v; }
function integer(v: unknown, min: number, max: number): number {
  if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max) return fail('invalid-call-integer');
  return v as number;
}
/** Byte-bounded, unchanged Unicode. Reject lone surrogates rather than hash replacement characters. */
function bounded(v: unknown, max: number, multiline = false): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max || Buffer.byteLength(v, 'utf8') > max
    || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(v)) return fail('invalid-signaling-text');
  for (let i = 0; i < v.length; i++) {
    const n = v.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) { const next = v.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) fail('invalid-signaling-text'); }
    else if (n >= 0xdc00 && n <= 0xdfff) fail('invalid-signaling-text');
  }
  return v;
}
export function callId(consultation: unknown, initiator: unknown, request: unknown): string {
  return createHash('sha256').update(JSON.stringify([digestId(consultation), safeId(initiator), bookingRequestId(request)]), 'utf8').digest('hex');
}
/** Boundary validation, not a full SDP parser or proof of media capabilities. No normalization. */
export function validateDescriptionInput<T extends 'offer' | 'answer'>(value: unknown, type: T): CallDescriptionInput<T> {
  const d = exact(value, ['type', 'sdp']);
  if (d.type !== type) fail('invalid-description-type');
  const sdp = bounded(d.sdp, CALL_LIMITS.sdpBytes, true);
  if (!/^v=0\r?\n/.test(sdp)) fail('invalid-sdp');
  return Object.freeze({ type, sdp });
}
export function validateIceInput(value: unknown): CallIceInput {
  const d = strictRecord(value, ['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment'], ['candidate', 'sdpMid', 'sdpMLineIndex']);
  const candidate = bounded(d.candidate, CALL_LIMITS.candidateBytes);
  if (!candidate.startsWith('candidate:')) fail('invalid-ice-candidate');
  const sdpMid = d.sdpMid === null ? null : bounded(d.sdpMid, 256);
  const sdpMLineIndex = d.sdpMLineIndex === null ? null : integer(d.sdpMLineIndex, 0, 65535);
  if (sdpMid === null && sdpMLineIndex === null) fail('missing-ice-target');
  return Object.freeze({ candidate, sdpMid, sdpMLineIndex,
    ...(Object.hasOwnProperty.call(d, 'usernameFragment') ? { usernameFragment: bounded(d.usernameFragment, 256) } : {}) });
}
const mutationFields = ['consultationId', 'callId', 'requestId'];
function mutation(d: Record<string, unknown>): EndConsultationCallInput {
  return { consultationId: digestId(d.consultationId), callId: digestId(d.callId), requestId: bookingRequestId(d.requestId) };
}
export function validateStartInput(v: unknown): StartConsultationCallInput {
  const d = exact(v, ['consultationId', 'requestId', 'mode', 'offer']);
  return Object.freeze({ consultationId: digestId(d.consultationId), requestId: bookingRequestId(d.requestId), mode: mode(d.mode), offer: validateDescriptionInput(d.offer, 'offer') });
}
export function validateRespondInput(v: unknown): RespondToConsultationCallInput {
  const d = strictRecord(v, [...mutationFields, 'action', 'answer'], [...mutationFields, 'action']);
  if (d.action === 'accept') return Object.freeze({ ...mutation(d), action: 'accept', answer: validateDescriptionInput(d.answer, 'answer') });
  if (d.action !== 'reject' || Object.hasOwnProperty.call(d, 'answer')) fail('invalid-call-response');
  return Object.freeze({ ...mutation(d), action: 'reject' });
}
export function validateEndInput(v: unknown): EndConsultationCallInput { return Object.freeze(mutation(exact(v, mutationFields))); }
export function validateGetInput(v: unknown): GetConsultationCallInput {
  const d = strictRecord(v, ['consultationId', 'callId'], ['consultationId']);
  return Object.freeze({ consultationId: digestId(d.consultationId), ...(Object.hasOwnProperty.call(d, 'callId') ? { callId: digestId(d.callId) } : {}) });
}
export function validatePublishInput(v: unknown): PublishConsultationIceInput {
  const d = exact(v, [...mutationFields, 'candidates']);
  if (!Array.isArray(d.candidates) || d.candidates.length < 1 || d.candidates.length > CALL_LIMITS.candidatesPerBatch) fail('invalid-ice-batch');
  // Array.from visits holes too; sparse arrays cannot bypass element validation.
  const candidates = Object.freeze(Array.from(d.candidates as unknown[], validateIceInput));
  return Object.freeze({ ...mutation(d), candidates });
}
export function validateStoredDescription<T extends 'offer' | 'answer'>(v: unknown, type: T): CallDescription<T> {
  const d = exact(v, ['type', 'sdp', 'senderId', 'createdAt', 'schemaVersion']);
  if (d.schemaVersion !== 1) fail('invalid-call-schema');
  return Object.freeze({ ...validateDescriptionInput({ type: d.type, sdp: d.sdp }, type), senderId: safeId(d.senderId), createdAt: schedulingTimestamp(d.createdAt), schemaVersion: 1 });
}
export function validateStoredCandidate(v: unknown): CallIceCandidate {
  const d = strictRecord(v, ['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment', 'senderId', 'sequence', 'createdAt', 'schemaVersion'],
    ['candidate', 'sdpMid', 'sdpMLineIndex', 'senderId', 'sequence', 'createdAt', 'schemaVersion']);
  if (d.schemaVersion !== 1) fail('invalid-call-schema');
  const { senderId, sequence, createdAt, schemaVersion, ...input } = d;
  return Object.freeze({ ...validateIceInput(input), senderId: safeId(senderId), sequence: integer(sequence, 1, CALL_LIMITS.candidatesPerSender),
    createdAt: schedulingTimestamp(createdAt), schemaVersion: 1 });
}
/** Structural integrity only. C6B must bind this to authoritative appointment/consultation and actors. */
export function validateCall(v: unknown): ConsultationCall {
  const d = exact(v, ['callId', 'consultationId', 'appointmentId', 'patientId', 'doctorId', 'initiatorId', 'recipientId', 'mode',
    'state', 'createdAt', 'ringExpiresAt', 'expiresAt', 'acceptedAt', 'endedAt', 'endReason', 'schemaVersion']);
  const patientId = safeId(d.patientId), doctorId = safeId(d.doctorId), initiatorId = safeId(d.initiatorId), recipientId = safeId(d.recipientId);
  if (patientId === doctorId || initiatorId === recipientId || ![patientId, doctorId].includes(initiatorId)
    || ![patientId, doctorId].includes(recipientId) || d.schemaVersion !== 1) fail('invalid-call-binding');
  const consultationId = digestId(d.consultationId);
  if (d.appointmentId !== consultationId) fail('invalid-call-binding');
  const createdAt = schedulingTimestamp(d.createdAt), expiresAt = schedulingTimestamp(d.expiresAt), ringExpiresAt = schedulingTimestamp(d.ringExpiresAt);
  if (compareTimes(createdAt, expiresAt) >= 0) fail('invalid-call-time');
  // Avoid overflowing Timestamp at its upper bound for a capped ring deadline.
  const secondsToExpiry = expiresAt.seconds - createdAt.seconds;
  const capped = secondsToExpiry < CALL_LIMITS.ringSeconds
    || (secondsToExpiry === CALL_LIMITS.ringSeconds && expiresAt.nanoseconds <= createdAt.nanoseconds);
  const expectedRing = capped ? expiresAt : plusSeconds(createdAt, CALL_LIMITS.ringSeconds);
  if (compareTimes(ringExpiresAt, expectedRing) !== 0) fail('invalid-ring-deadline');
  const base = { callId: digestId(d.callId), consultationId, appointmentId: consultationId, patientId, doctorId, initiatorId, recipientId,
    mode: mode(d.mode), createdAt, ringExpiresAt, expiresAt, schemaVersion: 1 as const };
  const acceptedAt = d.acceptedAt === null ? null : schedulingTimestamp(d.acceptedAt);
  if (acceptedAt && (compareTimes(acceptedAt, createdAt) < 0 || compareTimes(acceptedAt, ringExpiresAt) >= 0)) fail('invalid-accept-time');
  if (d.state === 'ringing' && acceptedAt === null && d.endedAt === null && d.endReason === null) return Object.freeze({ ...base, state: 'ringing', acceptedAt: null, endedAt: null, endReason: null });
  if (d.state === 'accepted' && acceptedAt && d.endedAt === null && d.endReason === null) return Object.freeze({ ...base, state: 'accepted', acceptedAt, endedAt: null, endReason: null });
  if (d.state !== 'ended') return fail('invalid-call-state');
  const endedAt = schedulingTimestamp(d.endedAt);
  if (compareTimes(endedAt, acceptedAt ?? createdAt) < 0 || compareTimes(endedAt, expiresAt) > 0) fail('invalid-end-time');
  const endReason = d.endReason as ConsultationCall['endReason'];
  if (!endReason || !['rejected', 'cancelled', 'hangup', 'ring_timeout', 'consultation_closed', 'expired'].includes(endReason)) fail('invalid-end-reason');
  if ((['rejected', 'cancelled', 'ring_timeout'].includes(endReason) && acceptedAt !== null)
    || (endReason === 'hangup' && acceptedAt === null)
    || (endReason === 'ring_timeout' && compareTimes(endedAt, ringExpiresAt) !== 0)
    || (endReason === 'expired' && compareTimes(endedAt, expiresAt) !== 0)) fail('invalid-end-reason');
  return Object.freeze({ ...base, state: 'ended', acceptedAt, endedAt, endReason });
}

export function validateMutationResult(v: unknown): CallMutationResult {
  const d = exact(v, ['call', 'replayed']);
  if (typeof d.replayed !== 'boolean') fail('invalid-call-result');
  return Object.freeze({ call: validateCall(d.call), replayed: d.replayed });
}
export function validatePublishResult(v: unknown): PublishConsultationIceResult {
  const d = exact(v, ['call', 'replayed', 'candidateIds']);
  if (!Array.isArray(d.candidateIds) || d.candidateIds.length < 1 || d.candidateIds.length > CALL_LIMITS.candidatesPerBatch) fail('invalid-call-result');
  const candidateIds = Object.freeze(Array.from(d.candidateIds as unknown[], digestId));
  if (new Set(candidateIds).size !== candidateIds.length) fail('invalid-call-result');
  return Object.freeze({ ...validateMutationResult({ call: d.call, replayed: d.replayed }), candidateIds });
}
export function validateGetResult(v: unknown): GetConsultationCallResult {
  const d = exact(v, ['call']);
  return Object.freeze({ call: d.call === null ? null : validateCall(d.call) });
}
