# Scheduling contracts and policy (Checkpoint 4B)

This checkpoint supplies pure contracts, validators and plans. It does not enable
scheduling endpoints or write Firebase data. The authoritative shared types are
`shared/types/scheduling.d.ts`, re-exported through `appointment.ts` and the shared
barrel. The obsolete `AvailabilitySlot` and `booked` appointment model is retired;
no existing code consumed it. Existing scheduling handlers remain inactive.

## Constants and time

`functions/src/scheduling/constants.ts` owns these values:

| Policy | Value |
| --- | --- |
| Appointment duration / UTC slot grid | 30 minutes / 30 minutes |
| Minimum booking lead | 5 minutes, inclusive |
| Booking start horizon | 90 days from trusted backend now, inclusive |
| Availability horizon | Today through UTC calendar day +90, inclusive |
| Windows per UTC day | At most 8 |
| Discovery range | At most 7 days (enforced by future discovery input) |
| Cancellation reason | At most 500 UTF-16 code units after trimming |
| Schema version | 1 |

Public instants are finite, safe integer epoch milliseconds within Firestore's
year 0001 through 9999 range. Strings and fractional milliseconds are rejected.
Slot boundaries must lie on the absolute 30-minute UTC grid. Start and end must
both fit the Timestamp range. Booking timing takes explicit trusted backend now;
no public request accepts a client clock.

Domain instants follow C3's SDK-independent `{seconds, nanoseconds}` contract.
Audit timestamps retain nanosecond precision; interval boundaries require exact
milliseconds. Pure validators accept exact plain structural maps. Future adapters
must verify real Firestore Timestamp values, project their seconds/nanoseconds
for policy, and persist real Firestore Timestamps, never these structural maps.

UTC dates use canonical YYYY-MM-DD with calendar round-trip validation. Timezones
use Node 22 ICU/Intl validation and alias normalization, not a maintained zone list.
UTC and named IANA zones are accepted; abbreviations, blank strings and numeric
offset identifiers are rejected. Stored timezone names must already be normalized.
Timezone is display/context metadata; all scheduling arithmetic uses UTC instants.
Recurring doctor-local schedules and DST recurrence conversion are deferred.

## Dated availability

`doctorAvailability/{availabilityId}` contains doctorId, utcDate, timeZone,
windows, revision, schemaVersion, createdAt and updatedAt. Windows are sorted,
nonoverlapping half-open intervals `[startAt,endAt)`, each at least 30 minutes,
grid aligned and contained in one UTC day. The final end may equal the following
midnight. Adjacency and an empty list are allowed; sparse arrays are rejected.

Replacement input contains only utcDate, timeZone, windows and expectedRevision.
Create requires expectation 0 and produces revision 1. Meaningful replacement
increments once; normalized identical replacement preserves revision and audit
timestamps. Stale expectations, changed document identity/timezone and backwards
audit clocks fail. A window that has started is immutable and cannot be introduced
retroactively. Revision overflow fails rather than wrapping. Future transactions
must also protect existing booked coverage and recheck authorization.

Candidate derivation walks each validated window on the grid. Results are sorted,
unique and exactly 30 minutes, each fully contained in one window. Slots are never
persisted. Occupancy and lead-time filtering belong to later handlers. Half-open
interval arithmetic permits adjacent appointments without overlap.

## Appointments and requests

`appointments/{appointmentId}` contains appointmentId, patientId, doctorId,
availabilityId, availabilityRevision, startAt, endAt, doctorDisplay, status,
cancellation, outcome, schemaVersion, createdAt and updatedAt. The doctor snapshot
contains only professionalName and specialty. There is no patient health data.
Patient and doctor IDs must differ; availability ID must match the doctor and day.

Public booking input is exactly doctorId, startAt and bookingRequestId. The latter
is a lowercase canonical RFC-variant UUID, versions 1-8, used only for idempotency.
Caller-supplied identity, end time, document ID, status, revision, audit timestamps
and snapshot fields are rejected. Canonical identity authorization remains the
responsibility of future handlers. Validators follow C3 strict-object conventions:
unknown/symbol/prototype keys, malformed IDs, timestamps, revisions, schema values
and snapshots fail closed.

## Deterministic IDs and retries

IDs are lowercase SHA-256 hex over UTF-8 `JSON.stringify` of ordered primitive
tuples, with no whitespace:

- Availability: `[doctorId, utcDate]`.
- Appointment: `[patientUid, bookingRequestId]`.
- Lock: `[resourceType, resourceId, slotStartEpochMilliseconds]`.

JSON quoting and array boundaries prevent concatenation ambiguities. Inputs are
validated before hashing. The booking UUID grants no authority. Matching retries
return the existing appointment, including terminal history; a different patient,
doctor, start or computed ID fails. A terminal appointment is never recreated from
the same key. A new booking requires a new UUID.

## Lifecycle and lock ownership

Only these transitions exist:

| Transition | Actor | Trusted time |
| --- | --- | --- |
| scheduled -> cancelled | Patient or doctor participant | Strictly before start |
| scheduled -> completed | Doctor participant | At or after end |
| scheduled -> no_show | Doctor participant | At or after end |

Administrator has no C4 lifecycle authority. Actor context must come from canonical
backend identity, never public input. Cancellation records cancelledBy, cancelledAt
and reason; missing/null/blank reason normalizes to null, otherwise trimmed text.
Outcomes record only recordedBy and recordedAt. No medical notes are accepted.
Terminal states cannot change. An exact repeat by the same actor with the same
decision/reason returns unchanged history, without touching locks. Conflicts fail.

A scheduled appointment owns exactly two `bookingLocks`: doctor/time and
patient/time. Each stores resourceType, resourceId, appointmentId, startAt, endAt,
schemaVersion and createdAt. These are current reservation ownership, with no TTL
or lease. Appointment documents preserve permanent history.

**Cancellation, completion and no-show all release both locks transactionally.**
This supersedes any 4A suggestion that completed/no-show locks remain indefinitely.
The pure plan validates both expected owners, appointment references, times and
creation metadata before returning deletion IDs. Missing, duplicated or rebound
locks fail closed. Never delete another appointment's lock. A terminal retry
returns zero deletion IDs even if that time has since been reserved again.

Later persistence must read the canonical identity, appointment and both expected
lock documents and apply the state update/deletions atomically. Pure plans alone
do not prove database consistency or eliminate races.

## Verification and deferred work

`functions/__tests__/schedulingPolicy.test.ts` covers strict inputs, UTC/Timestamp
boundaries, IANA zones, IDs, windows/slots, revision/retry behavior, actor/timing
rules and safe reservation release. No scheduling emulator tests are introduced
because this checkpoint has no persistence adapter.

4C-4G will add authorized availability persistence, discovery, transactional
booking/lifecycle operations, scheduling Rules/indexes and integration coverage as
separately approved. Mobile scheduling and production operations remain deferred.
No new callable exports, dependencies, lockfiles or security Rules change in 4B.
