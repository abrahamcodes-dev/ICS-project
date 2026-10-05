# Appointment lifecycle and reservation release (Checkpoint 4E)

4E persists the approved 4B lifecycle through two callables. It preserves the
[4D booking guarantees](APPOINTMENT_BOOKING.md), appointment history and all
existing scheduling write rules. There is no rescheduling; participant history
access is now provided by [4F](APPOINTMENT_READS.md).

## Contracts

`cancelAppointment` accepts exactly `{ appointmentId, reason? }`. The reason may
be omitted/null; blank text normalizes to null. Other text is trimmed and limited
to 500 UTF-16 code units, following 4B. Control characters and nonstrings fail.

`recordAppointmentOutcome` accepts exactly
`{ appointmentId, outcome: 'completed' | 'no_show' }`.

Both return exactly `{ appointmentId, status, replayed }`, where status is terminal.
IDs must be lowercase 64-character SHA-256 hex. Unknown fields, actor IDs, client
timestamps, participant IDs, lock IDs, medical notes and diagnosis fields fail.
No participant or reservation information is exposed by the response.

## Authorization: explicit 4B policy audit

`planAppointmentTransition` in `scheduling/policy.ts` and `SchedulingActor` in the
shared contract encode participant UID and canonical role. They do **not** encode
verificationStatus, current approval or publication binding for lifecycle decisions.
4E preserves that approved rule rather than importing the stronger booking gate.

Every attempt, including replay, rereads `users/{uid}` and requires a structurally
valid canonical active identity. Cancellation requires the patient participant or
doctor participant. Outcomes require the doctor participant. An active doctor who
is now pending/rejected may cancel or record outcomes for existing appointments;
no private/public profile or verification-source read is needed. A malformed or
disabled doctor identity still fails. Booking continues to require current approval
and the complete 4C/4D profile binding.

Administrators, `admin`, guests, nonparticipants and claim-only callers have no
authority. Patients cannot record outcomes. Missing, malformed and inaccessible
appointments produce the same generic permission denial after caller validation.
Nonparticipants never reach reservation reads.

## State, time and metadata

| Transition | Actor | Trusted backend boundary |
| --- | --- | --- |
| scheduled -> cancelled | Active patient or doctor participant | now < startAt |
| scheduled -> completed | Active doctor participant | now >= endAt |
| scheduled -> no_show | Active doctor participant | now >= endAt |

Cancellation at exactly start fails. Outcomes at exactly end succeed. No transition
between terminal states is allowed. `completed` is a scheduling status, **not
clinical proof that a consultation occurred**.

Cancellation stores `{ cancelledBy, cancelledAt, reason }` and null outcome.
Completion/no-show stores `{ recordedBy, recordedAt }` and null cancellation.
Actor IDs come from authenticated canonical identity; decision time and updatedAt
come from trusted backend time refreshed after reads on each transaction attempt.
createdAt, participants, interval, availability revision and display snapshot remain
unchanged. The adapter persists all decision/audit instants as real Firestore
Timestamps and validates the complete resulting document.

## Atomic reservation release

For a scheduled appointment, the transaction reads canonical caller identity,
the appointment and its two deterministic doctor/time and patient/time locks.
The existing pure 4B policy validates strict lock fields, resource type/owner,
appointment reference, start/end and original creation metadata against the
expected pair. Missing, malformed, rebound or inconsistent reservations fail
closed. No partial update or deletion is permitted.

Only after all reads and policy checks does the transaction update the appointment
and delete both verified lock IDs. All three mutations commit atomically. The
appointment document remains; locks represent current ownership, never history.
No TTL, automatic repair or cleanup of unknown reservations is introduced.

## Idempotency and concurrent replacement safety

An exact terminal retry requires the same actor, status and normalized cancellation
reason (when applicable). It returns `replayed: true` without writes and preserves
the original terminal timestamps. It does not read locks: their absence is expected,
and those deterministic positions may now belong to a new appointment.
Different actor, reason or outcome fails without mutation.

Concurrent conflicting terminal decisions contend on the appointment and locks.
Exactly one can establish terminal state; an exact duplicate becomes a replay.
Cancellation racing with booking either leaves booking conflicted until cancellation
commits, or permits a new booking after retry. A stale cancellation retry sees the
original terminal appointment and cannot delete the replacement booking's locks.
Scheduled state with foreign lock references fails rather than deleting them.

## Booking, availability and discovery interaction

Cancellation makes the time available again only if current availability, approval,
lead time, horizon and both resource reservations permit a new booking. Emulator
tests use a clock more than five minutes before start; no timing exception is added.
After cancellation, discovery may show the slot and another patient may book it.
The doctor may also remove future coverage once no reservation requires it.

Completion/no-show releases both historical locks, but discovery and booking still
exclude the elapsed start because of temporal validation. A released lock does not
make a past appointment bookable. Discovery returns only its unchanged sanitized
candidate fields, never cancellation/outcome metadata or participants.

## Errors, Rules and exports

Errors are unauthenticated, invalid-argument, permission-denied,
failed-precondition (state/time/reservation inconsistency), or internal (sanitized
unexpected failure). Storage errors remain retryable inside Firestore transactions.
No private state appears in error messages.

4E needed no Rules change. 4F now enables participant appointment reads while
appointment writes, bookingLocks, doctorAvailability and legacy availabilitySlots
keep direct client denial. C2/C3 privacy is unchanged.
There are exactly eleven active exports: the nine 4D callables plus
cancelAppointment and recordAppointmentOutcome from lifecycleCallables. Legacy
scheduling/lifecycle sources remain inactive.

## Verification and deferred work

Unit tests cover actor/time boundaries, the explicit no-current-approval lifecycle
rule, strict inputs, normalized reasons, metadata, corrupt reservations, all
terminal conflicts and replay without lock reads. Real Firestore tests cover
atomic Timestamp persistence/release, cancellation/rebooking, availability removal,
conflicting decisions, duplicate completion, replacement-lock safety, rollback and
canonical reauthorization after transaction retry. Existing direct-access Rules
tests remain part of the full regression gate.

4F now documents and tests participant history/get/list contracts separately.
UI, rescheduling, consultation features and production operations remain deferred.
No package changes, deployment, commit or push are part of 4E.
