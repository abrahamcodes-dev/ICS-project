# Doctor availability and discovery (Checkpoint 4C)

4C adds `replaceDoctorAvailabilityDay` and `getAvailableAppointmentTimes` using
the [4B contracts](SCHEDULING_CONTRACTS.md). Booking and appointment persistence
were deferred in 4C and are now implemented by 4D.

4D now closes the reservation-coverage and occupancy boundaries described below.
See [APPOINTMENT_BOOKING.md](APPOINTMENT_BOOKING.md) for current booking behavior.
The original 4C contracts, authorization and revision semantics remain unchanged.

## Persistence and transport

`doctorAvailability/{availabilityId}` stores exactly doctorId, utcDate, timeZone,
windows, revision, schemaVersion, createdAt and updatedAt. IDs use the 4B SHA-256
JSON tuple. Window boundaries and audit times are actual Firestore Timestamps.
The adapter rejects structural timestamp maps in persisted data and converts
verified SDK Timestamps into plain domain timestamps for pure policy.

Replacement input:

```ts
{ utcDate: string, timeZone: string,
  windows: { startAt: number, endAt: number }[], expectedRevision: number }
```

Window transport instants are integer epoch milliseconds on the 30-minute UTC
grid. The date is a UTC partition, not a doctor-local date. All 4B limits apply.
Doctor ID comes only from authentication. Unknown/backend-owned fields fail.
The result is exactly `{ availabilityId, revision, changed }`.

**Zero is the sole create sentinel**, preserving 4B. Null, omitted, string or
negative expectations are not accepted. Create starts revision 1. Existing days
require their current positive revision, even for identical input. Normalized
no-ops preserve timestamps/revision; meaningful replacements increment once and
preserve createdAt. Empty windows keep the document. A replay with an old expected
revision fails: after a successful create, an identical no-op uses revision 1.
This avoids silently accepting stale replacements. No raw-read callable is added
in 4C; a future management UI needs a separately authorized read contract.

Timezones use Node ICU normalization and remain immutable for an existing day.
Changing a display preference cannot reinterpret persisted instants. New future
day documents can use a different zone. Recurring schedules are not supported.

## Authorization and transactions

Every mutation transaction rereads `users/{uid}` and requires canonical active
doctor/approved status. Claims grant no authority. It also reads the private
doctor profile, public projection and bound approved verification request.
Validation ties their owner, revision, approved request, professional fields and
publication timestamp to the approval source. Missing/malformed/stale state fails
closed. Private profile and request data are used only internally for validation.
No credential binary or patient health data is read.

The callable transport, handlers, pure 4B policy and Firestore store are separate.
Reads finish before writes. Trusted time is refreshed on every transaction attempt.
Firestore retries rerun canonical authorization and state validation. Concurrent
meaningful replacements from one revision have one winner; create/create races
also have one winner. A losing stale request changes nothing. Identical no-ops at
the current revision can both succeed without writes.

Past UTC days cannot change. Windows whose start is at or before trusted now must
remain logically identical, even after ending. Future windows can change, and new
future windows can be appended to a partially elapsed day. Audit time cannot move
backwards. The allowed availability partitions are today through today +90.

## Patient discovery

Input is exactly `{ doctorId, fromDate, days }`; fromDate is canonical YYYY-MM-DD
in UTC and days is an integer 1 through 7. The entire range must fit today through
today +90. The caller must be a canonical active patient. Guests, administrators,
doctors (including self-discovery), disabled/malformed identities and claim-only
callers are denied. The target doctor passes the same approval binding checks as
mutation. Discovery uses a read-only transaction for a consistent state snapshot.

The result is exactly:

```ts
{ times: [{ doctorId, startAt, endAt, availabilityId, availabilityRevision }] }
```

Times are integer epoch milliseconds, ordered by UTC day then start. Missing and
empty days contribute no candidates. Deterministic document reads replace broad
queries, so no new index is required. Candidates are derived on demand and filtered
using trusted now: start must be at least five minutes ahead and at most 90 rolling
days ahead. On the final allowed UTC partition, only starts within that rolling
horizon survive. Boundary comparisons preserve backend nanosecond precision.

No raw documents, private fields, verification references, credentials, patient
data or Firestore Timestamp objects appear in the response.

## Rules and legacy code

`doctorAvailability` denies all direct client get/list/create/update/delete,
including doctor owners. There is no current raw-reader requirement. Patients use
sanitized discovery. `availabilitySlots` is explicitly retired and denies every
read/write operation for every role. Appointment access remains closed; other
C2/C3 Rules are unchanged. Admin SDK access is authorized independently by handlers.
Legacy `setAvailability` and `bookAppointment` source remains inactive.

The eight 4C callable exports are completeRegistration, saveDoctorProfileDraft,
prepareDoctorCredential, finalizeDoctorCredential, submitDoctorVerification,
reviewDoctorVerification, replaceDoctorAvailabilityDay and getAvailableAppointmentTimes.
4D adds bookAppointment through the new bookingCallable module.

## Reservation boundary closed in 4D

Replacement now reads all 48 deterministic doctor/time positions transactionally,
validates existing reservations and their appointments/companion locks, and
requires continuing coverage. Discovery filters doctor occupancy; booking
authoritatively revalidates both resources. Discovery still cannot guarantee that
a time will remain free until booking. See the 4D document for contention and
failure behavior. 4B's terminal lock-release policy remains authoritative for 4E.

## Tests and operations

Handler tests cover authorization, binding, input, revisions, historical windows,
UTC/horizon/lead boundaries, output privacy and retries. Firestore emulator tests
cover deny-all Rules, real Timestamp storage, malformed persisted timestamps,
concurrent create/replacement, no-ops and rollback/re-authorization on retry.
Existing C2/C3 Firestore and Storage suites remain in the regression gate.
All persistence tests use local demo emulators. No production operation, package
change, deployment, commit or push is part of 4C.
