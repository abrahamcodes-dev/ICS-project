# Consultation persistence and lifecycle

openConsultation and sendConsultationMessage are the two C5 callables (13 total
production exports). Legacy startConsultation remains inactive. C4 scheduling
writes and semantics are unchanged. CONSULTATION_CONTRACTS.md defines the policy.

## Input and response

Input is exactly {appointmentId}; all unknown fields are rejected. Auth is required.
Output is exactly consultationId, appointmentId, patientId, doctorId,
appointmentStartAt, appointmentEndAt, state, createdAt, closedAt, canSend.
Transport times are integer epoch milliseconds (nanoseconds truncated for display);
closedAt is null for active records. Internal policy and stored Timestamp precision
are retained. canSend is informational at the decision time, never a grant for
future sends. The send handler independently rereads and authorizes the operation.

## Transaction and authorization

A Firestore transaction reads canonical caller identity, the full validated C4
appointment with document-ID binding, deterministic consultation, counterpart
identity, and required approved-doctor profile/projection/request records before
any writes. All authority reads occur inside that transaction. Existing C2 identity
validation and C4 approvedDoctor binding checks are reused. Only the helper's
TypeScript parameter was narrowed to its four actual reader methods; its runtime
implementation and scheduling policy were not changed.

New creation requires active matching participants, current doctor approval and
consistent profile/public projection/approved request binding. Time is read from
Timestamp.now after reads and refreshed on transaction retries. Creation requires
scheduled and startAt <= now < endAt+15 minutes. Deterministic missing-document
reads and tx.create preconditions make simultaneous opens converge on one record.
No appointment, booking lock or availability writes occur.

For an existing valid room, active canonical participant history authorization is
sufficient. Disabled/missing counterpart, approval loss or malformed/missing
approval projection sets canSend=false without erasing history. Infrastructure
errors are not swallowed as approval loss: the transaction retries where supported,
then a generic internal failure is returned. Caller disability, administrator or
unrelated access remains denied. Invalid appointment/room data is never repaired.

## Persisted data and closure

consultations/{appointmentId} stores exactly consultationId, appointmentId,
patientId, doctorId, appointmentStartAt, appointmentEndAt, state, createdAt,
closedAt and schemaVersion=1. Timestamp fields are actual Admin Firestore Timestamp
instances. Structural timestamp maps and strings fail decoding. ID/path,
participants, interval, schema and lifecycle combinations are validated.

Existing rooms are reconciled using 5B planOpen. Expiry closes at end+15 minutes;
terminal closure uses validated C4 cancellation.cancelledAt or outcome.recordedAt,
capped by earlier expiry. Full C4 validation guarantees these metadata exist, so
the pure fallback is not normally needed by this adapter. Inconsistent chronology
fails closed, including a cancelled appointment predating the purported room.
Only state and closedAt are updated; immutable fields and createdAt are preserved.
Repeated retrieval never reopens a closed room or changes its first closure.
C5F also persists closure during send/replay. An authorized, valid new send that
observes closure commits state/closedAt before returning failed-precondition,
without message or rate writes. Exact replay may close the room and return the
original message. Invalid/unauthorized requests do not gain a closure-write path.
Reconciliation is lazy; there is no scheduled closure job.

## Errors and privacy

Unauthenticated input -> unauthenticated. Malformed request -> invalid-argument.
Missing/inaccessible/corrupt records or invalid authority -> generic permission-denied.
Authorized new creation outside the scheduling window -> failed-precondition.
Unexpected storage failures -> sanitized internal. No raw storage errors, health
information, credential evidence, verification metadata or medical text is returned
or logged. Participant direct history reads are allowed as described in
CONSULTATION_READS.md. All consultation/message writes and all senderState access
are denied to clients; no additional private collection access is granted.

## Verification

Ordinary handler tests cover both initiators, authority, timing, history, closure,
corruption, privacy and read-before-write ordering. Emulator tests exercise real
Timestamp storage, both transactions observing absent room state, one persisted
room, ABORTED retries, refreshed clocks/identity, rollback after staged creation
and closure, corruption rejection, and client SDK authorization boundaries.
The integration suite verifies 13 exports; its 10 consultation cases include
concurrent opening/sending and closure persistence on rejection/replay.
Synthetic fixtures are local demo data; no production resources are used.

## Deferred

Full regression must be rerun after C5H clock and mobile-session/cursor remediation;
see the messaging and reads documents. Media, prescriptions, ratings, notifications, payments,
production deployment and final mobile UI remain outside C5.
