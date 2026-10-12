# Secure text messages through C5F

## Implemented boundary

C5D introduced sendConsultationMessage (13 production callables total). The prior
12 remain intact; legacy startConsultation remains inactive. C5E adds participant
read Rules and mobile listeners/pagination. UI, media, notifications and payments
remain outside C5.
The approved 5B pure policy is unchanged. The 5C transaction adapter now exposes
its existing readers for reuse in the same message transaction; opening semantics
are unchanged.

## Request and response

Input is exactly {consultationId,messageRequestId,text}. Unknown fields, including
senderId/senderRole/timestamps/status/canSend, fail. UUID and normalization follow
CONSULTATION_CONTRACTS.md: strict lowercase RFC variant UUID versions 1-8,
16000 UTF-16 raw ceiling, 1-4000 normalized units, multiline/Unicode preserved,
forbidden controls and unpaired surrogates rejected. Text is rendered as plain text
by future clients, not interpreted or transformed as HTML.

Response is exactly consultationId,messageId,senderId,type='text',text,createdAt,
replayed. Transport createdAt is integer epoch milliseconds, truncating submillisecond
precision for display only. Stored timestamps and policy comparisons preserve it.
No private rate state or approval/profile metadata is returned.

## Message and sender-state persistence

consultations/{consultationId}/messages/{messageId} stores exactly:
messageId,senderId,type='text',text,createdAt,schemaVersion=1.
createdAt is an actual Firestore Timestamp, from the trusted backend decision clock.
The parent supplies consultation identity; no senderRole/names/email/phone/profile,
appointment snapshot, prescription, payment or media metadata is copied.

messageId = SHA256(JSON.stringify([consultationId,authenticatedSenderUid,
normalizedMessageRequestId])). No random server IDs; caller retains request UUID
across retries. Stored document ID, schema, sender and timestamp bindings are checked.
Structural timestamp maps/strings are rejected by the persistence decoder.
Messages are immutable: tx.create only, no edit/delete API.

consultations/{consultationId}/senderState/{senderId} stores exactly:
consultationId,senderId,lastAcceptedAt,schemaVersion=1.
lastAcceptedAt is an actual trusted Timestamp. Both path bindings are validated.
All direct client get/list/create/update/delete remain denied by existing Rules.

## Security-sensitive operation order

1. Authenticate, validate the strict request and safe caller ID.
2. Within a transaction, read active canonical users/{uid} identity and the full
   validated C4 appointment, including path binding. Require participant history
   authority; custom claims and administrator role confer no authority.
3. Read/validate the existing consultation and all immutable appointment bindings.
   Sending never creates or repairs a missing/corrupt consultation.
4. Read the deterministic message path. For exact replay, these are all required
   reads: sample trusted time once, validate replay and reconcile/persist closure.
   Replay does not read counterpart, approval or rate-state documents.
5. For a new message, read participants, verify active roles and the complete C4
   approval binding, then read private rate state. Retain domain/permission denials
   until closure is evaluated; infrastructure failures still abort the transaction.
6. Sample trusted time once after these reads. Reconcile using this time: if closed,
   commit closure and return failed-precondition after the transaction, without
   message/rate writes. Otherwise propagate any retained send denial, or use the
   same time for final window/rate/send planning and atomic message/rate writes.
   All reads precede writes; responses follow commit.

C5H regression tests cross expiry during the final rate read and verify persisted
closure without a new message. Replay crossing expiry still returns the original
message and preserves rate state. No preliminary, inconsistent send clock is used.

New sends require scheduled and startAt <= now < endAt+15 minutes, plus valid
nonclosed consultation and authority. Terminal status overrides grace. The canSend
response from opening is not accepted or trusted. All approval/identity dependencies
are read transactionally, so changes force serialization/revalidation.

## Exact retries and conflicts

An existing canonical message with the expected deterministic ID, authenticated
sender and identical normalized text returns replayed=true and its original time.
No rate-state read/write or allowance consumption occurs. Replay can succeed after
expiry, closure, terminal outcome, approval loss, missing projection or counterpart
disablement when current caller history authority and record integrity still hold.
Disabled/unrelated callers fail. Changed normalized text for the same request ID
fails without overwriting the message. Malformed existing data fails closed.

Replay is acknowledgment of a committed record, never permission to create a new
message. The existing-message branch never accesses new-send authority documents.

## Rate limit and atomicity

New messages require now >= lastAcceptedAt+1000ms, preserving nanosecond precision.
Exactly 1000ms is allowed; less is denied. First use reads absent state. Different
senders/consultations use independent state documents. Rate update and message
creation commit in one transaction; failure rolls both back. Rejected attempts
never advance state. Concurrent distinct UUIDs from one sender contend on the
same sender-state document; retries reread it. There is no process-local counter.
Privileged deletion/corruption of state is outside ordinary-client guarantees;
malformed state is rejected, not silently overwritten.

## Closure and scheduling independence

Sending reads consultation and appointment and evaluates effective closure even
when the stored room is still active. Opening, sending and exact replay can persist
lazy closure. For a valid authorized new send, closure commits before a
failed-precondition response; no message or rate state is created. Replay preserves
the original message/time and rate state, but may persist closure. Closure/terminal/
identity/approval writes serialize against the read set. A retry after eligibility
ends cannot commit a new message. Exact committed replay remains history-governed.
Trusted decision-time authorization applies; a decision just before expiry may
commit shortly afterward. No exact wall-clock commit fence is claimed.

Message operations never mutate appointments, booking locks, availability,
verification records or patient health profiles. No clinical completion is inferred.

## Errors and privacy

Unauthenticated -> unauthenticated; malformed request -> invalid-argument.
Missing/inaccessible/corrupt authority or room -> generic permission-denied.
Window/closure -> failed-precondition; conflicting retry -> already-exists;
rate interval -> resource-exhausted; unexpected storage error -> sanitized internal.
No message contents or raw storage errors in logs, thrown errors or analytics.
Only an authorized caller receives text in the successful response. Test strings
are synthetic and neutral. There is no administrator conversation authority.

## Tests and deferred work

Ordinary tests cover authority, boundaries, missing/corrupt data, input strictness,
replay ordering, normalization, isolation and closure-only mutation on an eligible
post-window rejection. Other rejected inputs do not create messages or advance rate state.
Real emulator tests coordinate competing first attempts after reading rate state,
proving same-ID convergence/conflict, one-second contention and sender independence.
They also cover rollback after each staged write, actual C4 outcome/lazy closure
races, forced ABORTED retries after changing authority/time/state, Timestamp checks,
unrelated-record preservation, participant reads, denied direct writes and private state.
Concurrent requests test valid invariant outcomes, not every server interleaving.
Admin SDK is fixture/inspection tooling, not evidence of client authorization.

C5E implements participant reads/listeners; C5F adds closure-on-send/replay and
10 callable integration cases. C5G passed all 59 integration tests across three
suites before remediation. Focused C5H tests now cover the clock finding; the full
C5G regression must be rerun after remediation.
No production operations, retention/deletion, prescriptions, WebRTC, FCM or M-Pesa.
