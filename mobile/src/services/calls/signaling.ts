import { collection, doc, getDoc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { ConsultationCall, CallDescriptionInput, CallIceInput, CallMutationResult,
  StartConsultationCallInput, RespondToConsultationCallInput, EndConsultationCallInput,
  PublishConsultationIceInput, PublishConsultationIceResult, GetConsultationCallInput,
  GetConsultationCallResult } from '@shared/types/consultationCallContracts';
import { app, db } from '../firebaseConfig';

export type RemoteIce = CallIceInput & { id: string; sequence: number };
export interface Signaling {
  start(input: StartConsultationCallInput): Promise<CallMutationResult>;
  respond(input: RespondToConsultationCallInput): Promise<CallMutationResult>;
  end(input: EndConsultationCallInput): Promise<CallMutationResult>;
  publish(input: PublishConsultationIceInput): Promise<PublishConsultationIceResult>;
  get(input: GetConsultationCallInput): Promise<GetConsultationCallResult>;
  description(call: ConsultationCall, kind: 'offer' | 'answer'): Promise<CallDescriptionInput<'offer' | 'answer'>>;
  watch(call: ConsultationCall, next: (call: ConsultationCall) => void, error: (error: unknown) => void): () => void;
  ice(call: ConsultationCall, sender: string, next: (items: RemoteIce[]) => void, error: (error: unknown) => void): () => void;
}
const invalid = () => new Error('Invalid call signaling data.');
function id(value: string) { if (!/^[a-f0-9]{64}$/.test(value)) throw invalid(); return value; }
function timestamp(value: any) {
  if (!value || !Number.isSafeInteger(value.seconds) || !Number.isInteger(value.nanoseconds)
    || value.nanoseconds < 0 || value.nanoseconds >= 1e9) throw invalid();
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
/** Decode only public metadata; never pass unknown response fields to consumers. */
export function parseCall(value: any, room: string, callId?: string): ConsultationCall {
  if (!value || value.consultationId !== room || value.appointmentId !== room || value.schemaVersion !== 1
    || (callId && value.callId !== callId) || !['audio', 'video'].includes(value.mode)
    || !['ringing', 'accepted', 'ended'].includes(value.state)) throw invalid();
  const { patientId, doctorId, initiatorId, recipientId } = value;
  if (![patientId, doctorId, initiatorId, recipientId].every(v => typeof v === 'string' && v.length > 0)
    || patientId === doctorId || initiatorId === recipientId
    || ![patientId, doctorId].includes(initiatorId) || ![patientId, doctorId].includes(recipientId)) throw invalid();
  const acceptedAt = value.acceptedAt === null ? null : timestamp(value.acceptedAt);
  const endedAt = value.endedAt === null ? null : timestamp(value.endedAt);
  if ((value.state === 'ringing' && acceptedAt !== null) || (value.state === 'accepted' && !acceptedAt)
    || (value.state !== 'ended' && (endedAt !== null || value.endReason !== null))
    || (value.state === 'ended' && (!endedAt || !['rejected','cancelled','hangup','ring_timeout','consultation_closed','expired'].includes(value.endReason)))) throw invalid();
  return { callId: id(value.callId), consultationId: id(room), appointmentId: room, patientId, doctorId,
    initiatorId, recipientId, mode: value.mode, state: value.state, schemaVersion: 1,
    createdAt: timestamp(value.createdAt), ringExpiresAt: timestamp(value.ringExpiresAt), expiresAt: timestamp(value.expiresAt),
    acceptedAt, endedAt, endReason: value.endReason } as ConsultationCall;
}
const path = (c: ConsultationCall) => ['consultations', id(c.consultationId), 'calls', id(c.callId)] as const;
async function mutation<I extends { consultationId: string; callId?: string }>(name: string, input: I) {
  const data = (await httpsCallable<I, any>(getFunctions(app), name)(input)).data;
  if (typeof data?.replayed !== 'boolean') throw invalid();
  return { call: parseCall(data.call, input.consultationId, input.callId), replayed: data.replayed };
}
export const callSignaling: Signaling = {
  start: input => mutation('startConsultationCall', input),
  respond: input => mutation('respondToConsultationCall', input),
  end: input => mutation('endConsultationCall', input),
  async publish(input) {
    const data = (await httpsCallable<PublishConsultationIceInput, any>(getFunctions(app), 'publishConsultationIce')(input)).data;
    if (typeof data?.replayed !== 'boolean' || !Array.isArray(data.candidateIds)
      || data.candidateIds.length !== input.candidates.length) throw invalid();
    return { call: parseCall(data.call, input.consultationId, input.callId), replayed: data.replayed,
      candidateIds: data.candidateIds.map(id) };
  },
  async get(input) {
    const data = (await httpsCallable<GetConsultationCallInput, any>(getFunctions(app), 'getConsultationCall')(input)).data;
    return { call: data?.call === null ? null : parseCall(data?.call, input.consultationId, input.callId) };
  },
  async description(call, kind) {
    const snapshot = await getDoc(doc(db, ...path(call), 'descriptions', kind));
    const d = snapshot.data();
    if (!snapshot.exists() || d?.schemaVersion !== 1 || d.type !== kind || typeof d.sdp !== 'string'
      || !/^v=0\r?\n/.test(d.sdp) || d.sdp.length > 65536
      || d.senderId !== (kind === 'offer' ? call.initiatorId : call.recipientId)) throw invalid();
    return { type: kind, sdp: d.sdp };
  },
  watch(call, next, error) {
    return onSnapshot(doc(db, ...path(call)), { includeMetadataChanges: true }, snapshot => {
      // Cached lifecycle state cannot authorize starting media. Reconnect confirms with the server.
      if (snapshot.metadata.fromCache) return;
      try { next(parseCall(snapshot.data(), call.consultationId, call.callId)); } catch (e) { error(e); }
    }, error);
  },
  ice(call, sender, next, error) {
    if (![call.initiatorId, call.recipientId].includes(sender)) throw invalid();
    // Equality plus limit uses the automatic single-field index; includes all 128 possible remote candidates.
    return onSnapshot(query(collection(db, ...path(call), 'candidates'), where('senderId', '==', sender), limit(128)), snapshot => {
      try {
        const items = snapshot.docs.map(s => {
          const d = s.data();
          if (d.schemaVersion !== 1 || d.senderId !== sender || !Number.isInteger(d.sequence)
            || d.sequence < 1 || d.sequence > 128 || typeof d.candidate !== 'string'
            || !d.candidate.startsWith('candidate:') || d.candidate.length > 2048
            || !(d.sdpMid === null || typeof d.sdpMid === 'string')
            || !(d.sdpMLineIndex === null || Number.isInteger(d.sdpMLineIndex))) throw invalid();
          return { id: id(s.id), sequence: d.sequence, candidate: d.candidate, sdpMid: d.sdpMid,
            sdpMLineIndex: d.sdpMLineIndex, ...(typeof d.usernameFragment === 'string' ? { usernameFragment: d.usernameFragment } : {}) };
        });
        next(items.sort((a, b) => a.sequence - b.sequence));
      } catch (e) { error(e); }
    }, error);
  },
};
