# Appointment booking and reservation consistency (Checkpoint 4D)

4D activates appointment creation and current reservation ownership. The
[4B contracts](SCHEDULING_CONTRACTS.md) remain authoritative. Cancellation,
completion and no-show persistence were deferred in 4D and are now implemented by
[4E lifecycle callables](APPOINTMENT_LIFECYCLE.md). Appointment UI, rescheduling
and production deployment remain deferred.

## Callable and response

`bookAppointment` is exported from `scheduling/bookingCallable.ts`. The legacy
`scheduling/bookAppointment.ts` remains inactive and is not imported by this path.

Input is exactly `{ doctorId, startAt, bookingRequestId }`. The start is a safe
integer epoch millisecond on the 30-minute UTC grid; the UUID is the canonical
4B idempotency key. Unknown and backend-owned fields are rejected. Patient UID
comes only from authenticated context.

Output is exactly `{ appointmentId, doctorId, startAt, endAt, status, replayed }`.
Times are epoch milliseconds. `replayed: false` means this call created the
appointment; true means existing matching history was returned. Patient ID is
unnecessary in an owner response, so it is omitted. No lock, credential, private
profile or verification-review information appears in the result.

## Authorization and stored schema

Each transaction rereads canonical `users/{uid}` and requires an active patient.
The target must be an active approved doctor. The existing 4C binding validator
checks private profile, public projection and approved verification source together.
Claims never authorize. Guests, administrators (including `admin`), doctors acting
as patients, disabled or malformed identities and stale approval projections fail.

`appointments/{appointmentId}` stores exactly:

- appointmentId, patientId, doctorId;
- availabilityId and availabilityRevision used for creation;
- startAt and endAt;
- doctorDisplay containing only approved professionalName and specialty;
- status (`scheduled` on creation), cancellation (null), outcome (null);
- schemaVersion (1), createdAt and updatedAt.

Domain instants persist as real Firestore Timestamps; the adapter rejects plain
timestamp maps in stored records. End is derived as start +30 minutes. Audit times
come from the backend after transaction reads. The complete generated appointment
and locks are validated before any writes. No patient health data, private phone,
registration details, credentials or reviewer information is copied.

## Reads, writes and deterministic contention

New booking reads, before any write:

1. Patient identity.
2. Doctor identity, private profile, public projection, approved request.
3. Appointment at SHA-256(JSON([patientUid, bookingRequestId])).
4. Current deterministic doctor/UTC-day availability.
5. Doctor/time lock and patient/time lock at the 4B deterministic IDs.

It verifies the five-minute lead, rolling 90-day horizon, current availability
binding and complete containment in one window. Discovery results and revisions
supplied by a client are never trusted. Adjacent windows remain distinct: a slot
must fit in one. With all boundaries on the global 30-minute grid, an off-grid
start cannot be used to straddle adjacent windows.

If either lock exists during new booking, the call fails without writes. Otherwise
one Firestore transaction creates the appointment and exactly two locks using
create preconditions. No overlap query or persisted slot collection is involved.
Locks store resourceType, resourceId, appointmentId, startAt, endAt, schemaVersion
and createdAt. Same-doctor/same-time requests contend on the doctor lock; the same
patient booking different doctors at that time contends on the patient lock.
Fixed duration and grid alignment make overlapping reservations share a lock.

All reads rerun on a transaction retry. Transient SDK errors remain retryable;
unexpected errors are sanitized after the transaction finishes. Atomic commit
prevents partial appointment/lock state.

## Idempotency

Immutable intent comparison is precisely: authenticated patient UID, computed
patient/UUID appointment ID, doctor ID and startAt. End is fixed by policy and the
stored schema is validated in full. Availability revision and display snapshot
are creation-time facts and are not replaced during a retry.

Exact scheduled retries verify the two original locks and continuing availability
coverage, then return unchanged history. They do not reapply new-booking lead-time
checks. Missing/rebound locks fail closed rather than being repaired silently.
Exact cancelled/completed/no_show retries return the terminal appointment without
reading, creating or deleting locks. Conflicting doctor/start/key reuse fails.
All retries still require current caller and target authorization; a disabled
patient or no-longer-approved doctor is not bypassed by a retry key.

## Availability mutation and the booking race

Before replacing a day, the transaction reads all 48 deterministic doctor/time
positions in that UTC day. For every existing reservation it validates the lock,
the referenced scheduled appointment, the matching patient lock, ownership, times
and creation metadata. Both current and proposed availability must cover it.
Missing, malformed, terminal-linked or inconsistent state fails closed. Unrelated
doctor locks are not inspected. These checks also run for availability no-ops.
The original stale-revision, immutable-timezone and historical-window rules remain.

The race has a shared transactional read/write dependency in both directions:
booking reads availability and writes its doctor lock; replacement reads that
doctor lock position and writes availability. Firestore cannot commit both an
uncovered booking and removal. The loser retries against the winner's state and
fails coverage or availability validation. Real emulator tests exercise this race
in addition to doctor and patient double-booking races.

A doctor must use the 4E cancellation workflow before removing reserved coverage.
The booking path never deletes reservations. Lock history/TTL semantics remain
unchanged: 4E terminal transitions atomically release both owned locks while
preserving appointment history.

## Discovery and Rules

Discovery checks deterministic doctor locks and excludes occupied candidates.
Occupied records are validated against their appointment and companion patient
lock; corruption fails closed. Temporal filtering runs again after occupancy
reads. Results retain the exact sanitized 4C fields and deterministic ordering.
Patient-conflict filtering is not added; booking enforces the patient's lock.
Discovery remains advisory because another request may book after it returns.

Appointment mutations and all bookingLocks access remain denied to clients.
Booking confirmation comes from the callable; [4F](APPOINTMENT_READS.md) now adds
participant gets and bounded history/upcoming queries with four local index
definitions. Availability and legacy availabilitySlots retain complete client
denial. C2/C3 access and Storage Rules remain unchanged.

Errors use unauthenticated, permission-denied, invalid-argument,
failed-precondition (state/intent/coverage), already-exists (generic scheduling
conflict), or internal (sanitized unexpected failure). Occupancy never reveals
another patient's identity or appointment.

The 4D export surface is the eight 4C callables plus this `bookAppointment`.
4E adds cancelAppointment and recordAppointmentOutcome.
No legacy scheduling function is exported.

## Verification

`bookingHandler.test.ts` exercises validation, authorization, exact responses,
retries, terminal history, privacy, discovery occupancy and corrupt reservations.
`rules/booking.rules.test.ts` adds real Timestamp/atomicity checks, direct-access
denials, doctor/patient conflicts, concurrent identical retries, booking/removal
races, rollback and transaction retries. Terminal states are seeded through demo
Admin fixtures only; they do not introduce lifecycle persistence.
These run with the complete existing Functions, Rules, Storage and mobile gates.
