import { createHash } from 'crypto';
import type { CallIceCandidate, ConsultationCall, PublishConsultationIceInput } from '../../../../shared/types/consultationCallContracts';
import type { DomainTimestamp } from '../../../../shared/types/profiles';
import { fail, safeId, strictRecord } from '../../profiles/domainValidation';
import { digestId } from '../../scheduling/ids';
import { bookingRequestId, compareTimes, schedulingTimestamp } from '../../scheduling/primitives';
import { CALL_LIMITS, validatePublishInput } from './domain';

export interface IceSenderState { senderId: string; count: number; lastBatchAt: DomainTimestamp; schemaVersion: 1 }
export interface IceReceipt { senderId: string; requestId: string; callId: string; fingerprint: string; candidateIds: readonly string[]; schemaVersion: 1 }
export interface CandidateEntry { id: string; value: CallIceCandidate }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
export const iceRequestKey = (uid: string, request: string) => hash(['ice', safeId(uid), bookingRequestId(request)]);
export const iceFingerprint = (input: PublishConsultationIceInput) => hash(validatePublishInput(input));
export const iceCandidateId = (input: PublishConsultationIceInput, uid: string, index: number) =>
  hash([input.consultationId, input.callId, safeId(uid), input.requestId, index]);
export function iceStateValue(value: unknown, uid: string): IceSenderState {
  const fields = ['senderId', 'count', 'lastBatchAt', 'schemaVersion'], d = strictRecord(value, fields, fields);
  if (d.senderId !== safeId(uid) || d.schemaVersion !== 1 || !Number.isInteger(d.count)
    || (d.count as number) < 1 || (d.count as number) > CALL_LIMITS.candidatesPerSender) fail();
  return { senderId: uid, count: d.count as number, lastBatchAt: schedulingTimestamp(d.lastBatchAt), schemaVersion: 1 };
}
export function iceReceiptValue(value: unknown, uid: string, requestId: string): IceReceipt {
  const fields = ['senderId', 'requestId', 'callId', 'fingerprint', 'candidateIds', 'schemaVersion'], d = strictRecord(value, fields, fields);
  if (d.senderId !== safeId(uid) || d.requestId !== bookingRequestId(requestId) || d.schemaVersion !== 1
    || !Array.isArray(d.candidateIds) || d.candidateIds.length < 1 || d.candidateIds.length > CALL_LIMITS.candidatesPerBatch) fail();
  const ids = Array.from(d.candidateIds as unknown[], digestId);
  if (new Set(ids).size !== ids.length) fail();
  return { senderId: uid, requestId, callId: digestId(d.callId), fingerprint: digestId(d.fingerprint), candidateIds: ids, schemaVersion: 1 };
}
/** Bounded inventory prevents deleted/reset counters from restoring quota or sequence space. */
export function checkIceInventory(entries: readonly CandidateEntry[], state: IceSenderState | null,
  call: ConsultationCall, uid: string, now: DomainTimestamp) {
  for (const { value: c } of entries) {
    if (![call.initiatorId, call.recipientId].includes(c.senderId) || !call.acceptedAt
      || compareTimes(c.createdAt, call.acceptedAt) < 0 || compareTimes(c.createdAt, call.expiresAt) >= 0
      || compareTimes(c.createdAt, now) > 0 || (call.endedAt && compareTimes(c.createdAt, call.endedAt) > 0)) fail();
  }
  for (const sender of [call.initiatorId, call.recipientId]) {
    const group = entries.filter(c => c.value.senderId === sender).sort((a, b) => a.value.sequence - b.value.sequence);
    if (group.length > CALL_LIMITS.candidatesPerSender) fail();
    group.forEach((c, i) => {
      if (c.value.sequence !== i + 1 || (i && compareTimes(group[i - 1].value.createdAt, c.value.createdAt) > 0)) fail();
    });
  }
  const own = entries.filter(c => c.value.senderId === uid).sort((a, b) => a.value.sequence - b.value.sequence);
  if (own.length !== (state?.count ?? 0)) fail();
  if (state && compareTimes(state.lastBatchAt, own[own.length - 1].value.createdAt) !== 0) fail();
}
/** Verify the immutable batch against its receipt, rather than trusting the fingerprint alone. */
export function checkIceReceipt(receipt: IceReceipt, entries: readonly CandidateEntry[], room: string) {
  const batch = receipt.candidateIds.map(id => { const c = entries.find(e => e.id === id); if (!c) return fail(); return c.value; });
  batch.forEach((c, i) => {
    if (c.senderId !== receipt.senderId || c.sequence !== batch[0].sequence + i
      || compareTimes(c.createdAt, batch[0].createdAt) !== 0) fail();
  });
  const input = validatePublishInput({ consultationId: room, callId: receipt.callId, requestId: receipt.requestId,
    candidates: batch.map(({ senderId, sequence, createdAt, schemaVersion, ...c }) => c) });
  if (iceFingerprint(input) !== receipt.fingerprint
    || receipt.candidateIds.some((id, i) => id !== iceCandidateId(input, receipt.senderId, i))) fail();
}
