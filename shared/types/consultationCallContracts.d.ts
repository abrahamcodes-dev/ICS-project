import type { DomainTimestamp } from './profiles';

/** Domain/wire times preserve seconds and nanoseconds. Store adapters must use real Firestore Timestamps. */
export type CallMode = 'audio' | 'video';
export type CallEndReason = 'rejected' | 'cancelled' | 'hangup' | 'ring_timeout' | 'consultation_closed' | 'expired';
interface CallBase {
  readonly callId: string;
  readonly consultationId: string;
  readonly appointmentId: string;
  readonly patientId: string;
  readonly doctorId: string;
  readonly initiatorId: string;
  readonly recipientId: string;
  readonly mode: CallMode;
  readonly createdAt: DomainTimestamp;
  readonly ringExpiresAt: DomainTimestamp;
  readonly expiresAt: DomainTimestamp;
  readonly schemaVersion: 1;
}
/** Accepted means signaling acceptance, not observed media connectivity. Terminal calls never reopen. */
export type ConsultationCall = CallBase & (
  | { readonly state: 'ringing'; readonly acceptedAt: null; readonly endedAt: null; readonly endReason: null }
  | { readonly state: 'accepted'; readonly acceptedAt: DomainTimestamp; readonly endedAt: null; readonly endReason: null }
  | { readonly state: 'ended'; readonly acceptedAt: DomainTimestamp | null; readonly endedAt: DomainTimestamp; readonly endReason: CallEndReason }
);
export interface CallDescriptionInput<T extends 'offer' | 'answer'> {
  readonly type: T;
  readonly sdp: string;
}
/** Parent path supplies consultation/call identity; offer and answer have fixed document IDs. */
export interface CallDescription<T extends 'offer' | 'answer'> extends CallDescriptionInput<T> {
  readonly senderId: string;
  readonly createdAt: DomainTimestamp;
  readonly schemaVersion: 1;
}
/** Nonempty trickled candidate only. End-of-candidates is local; empty/null events are not published. */
export interface CallIceInput {
  readonly candidate: string;
  readonly sdpMid: string | null;
  readonly sdpMLineIndex: number | null;
  readonly usernameFragment?: string;
}
export interface CallIceCandidate extends CallIceInput {
  readonly senderId: string;
  readonly sequence: number;
  readonly createdAt: DomainTimestamp;
  readonly schemaVersion: 1;
}
export interface StartConsultationCallInput {
  readonly consultationId: string;
  readonly requestId: string;
  readonly mode: CallMode;
  readonly offer: CallDescriptionInput<'offer'>;
}
export interface CallMutationInput {
  readonly consultationId: string;
  readonly callId: string;
  readonly requestId: string;
}
export type RespondToConsultationCallInput = CallMutationInput & (
  | { readonly action: 'accept'; readonly answer: CallDescriptionInput<'answer'> }
  | { readonly action: 'reject' }
);
export type EndConsultationCallInput = CallMutationInput;
export interface PublishConsultationIceInput extends CallMutationInput { readonly candidates: readonly CallIceInput[] }
export interface GetConsultationCallInput { readonly consultationId: string; readonly callId?: string }
/** Metadata only: responses never expose SDP/ICE, private state or a reusable authorization grant.
 * Exact mutation replay acknowledges the operation but returns current reconciled metadata. */
export interface CallMutationResult { readonly call: ConsultationCall; readonly replayed: boolean }
export type StartConsultationCallResult = CallMutationResult;
export type RespondToConsultationCallResult = CallMutationResult;
export type EndConsultationCallResult = CallMutationResult;
export interface PublishConsultationIceResult extends CallMutationResult { readonly candidateIds: readonly string[] }
export interface GetConsultationCallResult { readonly call: ConsultationCall | null }
/** Sanitized callable codes. Detailed validation reasons remain internal and contain no payload. */
export type ConsultationCallErrorCode = 'unauthenticated' | 'invalid-argument' | 'permission-denied'
  | 'failed-precondition' | 'already-exists' | 'resource-exhausted' | 'internal';
