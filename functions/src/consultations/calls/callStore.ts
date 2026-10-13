import { Timestamp, type Firestore, type DocumentData, type Transaction } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import type { DomainTimestamp } from '../../../../shared/types/profiles';
import { fail, safeId, strictRecord } from '../../profiles/domainValidation';
import { bookingRequestId } from '../../scheduling/primitives';
import { digestId } from '../../scheduling/ids';
import { consultationTransaction } from '../consultationStore';
import { CALL_LIMITS, callId, validateCall, validateStoredDescription, validateStoredCandidate } from './domain';
import { iceRequestKey, iceReceiptValue, iceStateValue } from './iceState';
import type { CallReceipt } from './policy';
import type { CallControl } from './startHandler';
import type { CallLifecycleDependencies, CallLifecycleTransaction } from './lifecycleHandler';

/** Public metadata: consultations/{room}/calls/{id}; immutable SDP: .../descriptions/offer.
 * Private: consultations/{room}/callControl/state and .../callReceipts/start_{callId}.
 * Private state is outside call metadata; current catch-all Rules deny all these C6 paths.
 * Receipt document ID includes operation; callId is already bound to room+initiator+UUID. */
export const callPaths = {
  room: (room: string) => `consultations/${digestId(room)}`,
  call: (room: string, id: string) => `consultations/${digestId(room)}/calls/${digestId(id)}`,
  offer: (room: string, id: string) => `consultations/${digestId(room)}/calls/${digestId(id)}/descriptions/offer`,
  answer: (room: string, id: string) => `consultations/${digestId(room)}/calls/${digestId(id)}/descriptions/answer`,
  candidate: (room: string, id: string, candidateId: string) => `consultations/${digestId(room)}/calls/${digestId(id)}/candidates/${digestId(candidateId)}`,
  iceState: (room: string, id: string, uid: string) => `consultations/${digestId(room)}/calls/${digestId(id)}/iceSenderState/${safeId(uid)}`,
  iceReceipt: (room: string, uid: string, request: string) => `consultations/${digestId(room)}/callReceipts/ice_${iceRequestKey(uid, request)}`,
  control: (room: string) => `consultations/${digestId(room)}/callControl/state`,
  receipt: (room: string, id: string) => `consultations/${digestId(room)}/callReceipts/start_${digestId(id)}`,
  // Immutable copy links the fixed answer document to its successful request receipt.
  answerReceipt: (room: string, id: string) => `consultations/${digestId(room)}/callReceipts/answer_${digestId(id)}`,
  actionReceipt: (room: string, operation: 'respond' | 'end', uid: string, request: string) => {
    if (operation !== 'respond' && operation !== 'end') fail('invalid-call-operation');
    const key = createHash('sha256').update(JSON.stringify([operation, safeId(uid), bookingRequestId(request)]), 'utf8').digest('hex');
    return `consultations/${digestId(room)}/callReceipts/${operation}_${key}`;
  },
};
function decode(value: unknown): DomainTimestamp {
  if (!(value instanceof Timestamp)) return fail('stored-call-timestamp');
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
const encode = (t: DomainTimestamp) => new Timestamp(t.seconds, t.nanoseconds);
function decodeCall(data: DocumentData, room: string, id: string) {
  const call = validateCall({ ...data, createdAt: decode(data.createdAt), ringExpiresAt: decode(data.ringExpiresAt), expiresAt: decode(data.expiresAt),
    acceptedAt: data.acceptedAt === null ? null : decode(data.acceptedAt), endedAt: data.endedAt === null ? null : decode(data.endedAt) });
  if (call.callId !== id || call.consultationId !== room) fail('call-path-binding');
  return call;
}
function controlValue(value: unknown, room: string): CallControl {
  const fields = ['consultationId', 'activeCallId', 'attemptCount', 'schemaVersion'];
  const d = strictRecord(value, fields, fields);
  if (d.consultationId !== digestId(room) || d.schemaVersion !== 1 || !Number.isInteger(d.attemptCount)
    || (d.attemptCount as number) < 1 || (d.attemptCount as number) > CALL_LIMITS.attemptsPerConsultation) fail('invalid-call-control');
  return { consultationId: room, activeCallId: d.activeCallId === null ? null : digestId(d.activeCallId), attemptCount: d.attemptCount as number, schemaVersion: 1 };
}
function receiptValue(value: unknown, room: string, id: string): CallReceipt {
  const fields = ['consultationId', 'schemaVersion', 'operation', 'uid', 'requestId', 'callId', 'fingerprint'];
  const d = strictRecord(value, fields, fields);
  if (d.consultationId !== digestId(room) || d.schemaVersion !== 1 || d.operation !== 'start'
    || d.callId !== digestId(id) || callId(room, d.uid, d.requestId) !== id) fail('invalid-call-receipt');
  return { operation: 'start', uid: safeId(d.uid), requestId: bookingRequestId(d.requestId), callId: id, fingerprint: digestId(d.fingerprint) };
}
/** Injected SDK adapter; importing it does not initialize Firebase. */
export function createCallStore(db: Firestore): CallLifecycleDependencies {
  return { now: () => decode(Timestamp.now()), transact: action => db.runTransaction(tx => action(callTransaction(db, tx))) };
}
function actionReceiptValue(value: unknown, room: string): CallReceipt {
  const fields = ['consultationId', 'schemaVersion', 'operation', 'uid', 'requestId', 'callId', 'fingerprint'];
  const d = strictRecord(value, fields, fields);
  if (d.consultationId !== digestId(room) || d.schemaVersion !== 1 || (d.operation !== 'respond' && d.operation !== 'end')) fail('invalid-call-receipt');
  return { operation: d.operation as 'respond' | 'end', uid: safeId(d.uid), requestId: bookingRequestId(d.requestId), callId: digestId(d.callId), fingerprint: digestId(d.fingerprint) };
}
export function callTransaction(db: Firestore, tx: Transaction): CallLifecycleTransaction {
  const readers = consultationTransaction(db, tx);
  const read = async (path: string) => (await tx.get(db.doc(path))).data() ?? null;
  return {
    identity: readers.identity, appointment: readers.appointment, consultation: readers.consultation, profile: readers.profile,
    publicProfile: readers.publicProfile, verification: readers.verification, close: readers.close,
    control: async room => { const d = await read(callPaths.control(room)); return d === null ? null : controlValue(d, room); },
    calls: async room => {
      // One extra row detects overflow without an unbounded collection read. No SDP is read here.
      const snapshot = await tx.get(db.collection(`${callPaths.room(room)}/calls`).limit(CALL_LIMITS.attemptsPerConsultation + 1));
      if (snapshot.size > CALL_LIMITS.attemptsPerConsultation) fail('invalid-call-inventory');
      return snapshot.docs.map(doc => decodeCall(doc.data(), room, doc.id));
    },
    call: async (room, id) => { const d = await read(callPaths.call(room, id)); return d === null ? null : decodeCall(d, room, id); },
    offer: async (room, id) => {
      const d = await read(callPaths.offer(room, id));
      return d === null ? null : validateStoredDescription({ ...d, createdAt: decode(d.createdAt) }, 'offer');
    },
    receipt: async (room, id) => { const d = await read(callPaths.receipt(room, id)); return d === null ? null : receiptValue(d, room, id); },
    answer: async (room, id) => {
      const d = await read(callPaths.answer(room, id));
      return d === null ? null : validateStoredDescription({ ...d, createdAt: decode(d.createdAt) }, 'answer');
    },
    answerReceipt: async (room, id) => {
      const d = await read(callPaths.answerReceipt(room, id)); if (d === null) return null;
      const r = actionReceiptValue(d, room); if (r.callId !== id || r.operation !== 'respond') fail('invalid-answer-receipt'); return r;
    },
    actionReceipt: async (room, operation, uid, requestId) => {
      const d = await read(callPaths.actionReceipt(room, operation, uid, requestId)); if (d === null) return null;
      const r = actionReceiptValue(d, room);
      if (r.operation !== operation || r.uid !== uid || r.requestId !== requestId) fail('invalid-receipt-path'); return r;
    },
    candidates: async (room, id) => {
      const max = 2 * CALL_LIMITS.candidatesPerSender;
      const snapshot = await tx.get(db.collection(`${callPaths.call(room, id)}/candidates`).limit(max + 1));
      if (snapshot.size > max) fail('invalid-ice-inventory');
      return snapshot.docs.map(doc => { const d = doc.data(); return { id: digestId(doc.id), value: validateStoredCandidate({ ...d, createdAt: decode(d.createdAt) }) }; });
    },
    iceState: async (room, id, uid) => {
      const d = await read(callPaths.iceState(room, id, uid));
      return d === null ? null : iceStateValue({ ...d, lastBatchAt: decode(d.lastBatchAt) }, uid);
    },
    iceReceipt: async (room, uid, requestId) => {
      const d = await read(callPaths.iceReceipt(room, uid, requestId));
      return d === null ? null : iceReceiptValue(d, uid, requestId);
    },
    createCandidate: (room, id, candidateId, value) => {
      const c = validateStoredCandidate(value);
      tx.create(db.doc(callPaths.candidate(room, id, candidateId)), { ...c, createdAt: encode(c.createdAt) });
    },
    saveIceState: (room, id, value) => {
      const s = iceStateValue(value, value.senderId);
      tx.set(db.doc(callPaths.iceState(room, id, s.senderId)), { ...s, lastBatchAt: encode(s.lastBatchAt) });
    },
    createIceReceipt: (room, value) => {
      const r = iceReceiptValue(value, value.senderId, value.requestId);
      tx.create(db.doc(callPaths.iceReceipt(room, r.senderId, r.requestId)), r);
    },
    acceptCall: value => {
      const c = validateCall(value); if (c.state !== 'accepted') fail('invalid-call-acceptance');
      tx.update(db.doc(callPaths.call(c.consultationId, c.callId)), { state: c.state, acceptedAt: encode(c.acceptedAt) });
    },
    createAnswer: (room, id, value) => {
      const answer = validateStoredDescription(value, 'answer');
      tx.create(db.doc(callPaths.answer(room, id)), { ...answer, createdAt: encode(answer.createdAt) });
    },
    createAnswerReceipt: (room, value) => {
      const r = actionReceiptValue({ ...value, consultationId: room, schemaVersion: 1 }, room);
      if (r.operation !== 'respond') fail('invalid-answer-receipt');
      tx.create(db.doc(callPaths.answerReceipt(room, r.callId)), { ...r, consultationId: room, schemaVersion: 1 });
    },
    createActionReceipt: (room, value) => {
      const r = actionReceiptValue({ ...value, consultationId: room, schemaVersion: 1 }, room);
      tx.create(db.doc(callPaths.actionReceipt(room, r.operation as 'respond' | 'end', r.uid, r.requestId)), { ...r, consultationId: room, schemaVersion: 1 });
    },
    createCall: value => {
      const c = validateCall(value); if (c.state !== 'ringing') fail('invalid-call-creation');
      tx.create(db.doc(callPaths.call(c.consultationId, c.callId)), { ...c, createdAt: encode(c.createdAt), ringExpiresAt: encode(c.ringExpiresAt),
        expiresAt: encode(c.expiresAt), acceptedAt: null, endedAt: null });
    },
    createOffer: (room, id, value) => {
      const offer = validateStoredDescription(value, 'offer');
      tx.create(db.doc(callPaths.offer(room, id)), { ...offer, createdAt: encode(offer.createdAt) });
    },
    createReceipt: (room, value) => {
      const d = receiptValue({ ...value, consultationId: room, schemaVersion: 1 }, room, value.callId);
      tx.create(db.doc(callPaths.receipt(room, d.callId)), { ...d, consultationId: room, schemaVersion: 1 });
    },
    saveControl: value => { const c = controlValue(value, value.consultationId); tx.set(db.doc(callPaths.control(c.consultationId)), c); },
    closeCall: value => {
      const c = validateCall(value); if (c.state !== 'ended') fail('invalid-call-closure');
      tx.update(db.doc(callPaths.call(c.consultationId, c.callId)), { state: c.state, endedAt: encode(c.endedAt), endReason: c.endReason });
    },
  };
}
