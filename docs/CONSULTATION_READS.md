# Consultation history and realtime reads — Checkpoint 5E

## Authorization
Consultation history is client-readable only by an authenticated, active canonical patient or doctor who is bound to the authoritative appointment. Historical access is deliberately independent of the current send window, appointment terminal status, counterpart status, and current doctor approval. A disabled caller, administrator, claim-only identity, unrelated user, or corrupt consultation/appointment binding fails closed.

Consultation collection listing remains denied. Message reads are scoped beneath a known authorized consultation. All consultation/message client writes remain denied, and `senderState` is never client-readable or writable.

## Query contract
The mobile data layer requests messages newest-first using `createdAt DESC`, then document ID `DESC`, with a default page size of 30 and a hard maximum of 50. Older history uses a `startAfter(createdAt, messageId)` cursor. Offsets and unbounded history reads are rejected by Rules. No collection-group message query is authorized.

Rules enforce the security-relevant page bound (`1..50`) and zero offset. Exact ordering is an application data contract rather than an authorization condition; changing order cannot expand which consultation a caller is authorized to read.

No new composite index is required for the approved query shape.

## Mobile data layer
`mobile/src/services/consultationService.ts` provides:
- trusted callable wrappers for `openConsultation` and `sendConsultationMessage`;
- bounded `onSnapshot` subscription for the newest page;
- cursor-based older-page loading;
- message-ID deduplication;
- a stateful session adapter that clears its cache and emits an empty message list
  on teardown or identity refresh/logout.

The caller must retain the same `messageRequestId` when retrying one logical send. The data layer does not log consultation text.

## Session and timestamp guarantees
The session owns pagination through loadOlder(cursor), replacing untagged
mergeOlder(page). It captures the active room and generation before awaiting
network work. Clear, logout, room switch and disposal invalidate that generation;
stale pages/errors and old listener callbacks cannot restore state. Stale loads
return null. Clear permits a later start; disposal is permanent. Cleanup from an
older start cannot tear down a newer subscription.

MessageCursor.createdAt holds the original Firestore Timestamp, passed directly
to startAfter with the message ID. Message views retain createdAtTimestamp for
exact seconds/nanoseconds ordering; numeric createdAt is only for display.
No precision is truncated, including at equal-millisecond pagination boundaries.

Callable responses are TypeScript-typed, not runtime-parsed. Message parsing checks
basic fields and Timestamp type, not the complete backend validator. Backend writes
remain authoritative; list Rules validate the parent aggregate, not every message.

## Boundaries
Checkpoint 5E does not add chat UI, WebRTC/media, notifications, prescriptions, ratings, chatbot behavior, payments, or production deployment. C5G passed before remediation. Focused remediation tests cover the three C5H blockers; full regression must be rerun before release.
