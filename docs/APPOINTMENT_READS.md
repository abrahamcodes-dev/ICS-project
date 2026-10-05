# Appointment reads and scheduling security (Checkpoint 4F)

4F enables direct participant reads and adds four local index definitions. All
scheduling mutations remain callable-only. No mobile workflow, deployment,
payment integration or consultation authorization is introduced.

## Reader policy

The authenticated caller must have a valid active canonical `users/{uid}` record.
A patient reads only appointments whose `patientId` equals their UID; a doctor
reads only appointments whose `doctorId` equals their UID. Custom claims,
presentation fields and counterpart profiles never confer authority.
Administrators, `admin`, guests, malformed identities and unrelated users cannot
read an appointment. A bounded own-history query with no matching records is
legitimate and returns an empty result.

The caller's own disabled status denies both get and list. A counterpart becoming
disabled, pending, rejected or unpublished does not hide existing appointments.
An active doctor participant also retains history after losing approval. This
matches the existing lifecycle policy; **new booking and availability still
require current doctor approval and its source binding**. Reads never mutate
history or release reservations.

Scheduled, cancelled, completed and no_show documents retain their immutable
participant IDs and times. Cancellation/outcome metadata is visible to the two
participants. No health, credential, verification evidence or payment data belongs
in an appointment snapshot.

## Exact supported client queries

These are contracts for a future UI, not new mobile implementation. Use the
modular Firestore SDK. Select `ownerField = 'patientId'` for a patient or
`ownerField = 'doctorId'` for a doctor, and use the authenticated caller's UID.

```ts
// First upcoming page: use one fixed boundary for this pagination session.
query(collection(db, 'appointments'),
  where(ownerField, '==', uid),
  where('status', '==', 'scheduled'),
  where('startAt', '>=', boundaryTimestamp),
  orderBy('startAt', 'asc'), orderBy(documentId(), 'asc'), limit(pageSize));

// First history/all-bookings page (includes scheduled as well as terminal rows).
query(collection(db, 'appointments'),
  where(ownerField, '==', uid),
  orderBy('startAt', 'desc'), orderBy(documentId(), 'desc'), limit(pageSize));
```

`pageSize` must be an integer from 1 through 50. The limit is centralized in
`maxAppointmentPageSize()` in Firestore Rules. Subsequent pages use the **same
filters, boundary and ordering**, adding `startAfter(lastDocumentSnapshot)` before
`limit(pageSize)`. Stop on an empty/short page; never use an offset. Both order
directions are tested with seven equal-time rows over four pages and an empty
final page. Document ID resolves equal start times without skips or duplicates.

The Rules security contract requires canonical active identity, the role-correct
caller-bound participant constraint, a limit of 1–50 and no offset. Status,
ordering and the client-supplied future boundary are presentation semantics, not
additional authority. Rules deliberately do not enforce `request.time` as an
upcoming boundary: doing so can invalidate a fixed cursor as time advances.
Other bounded own-participant query variants may be authorized, but only the two
shapes above are supported and indexed here. Broad lists, missing-owner queries,
cross-owner filters, owner `in` queries including another user, unbounded and
oversized requests, and collection-group enumeration fail.

Pagination is not a frozen multi-page snapshot. Immutable start time/document ID
prevent equal-time ambiguity, but concurrent inserts or lifecycle changes can
change membership between requests. Refresh from the first page to see new
bookings; do not promise snapshot isolation across UI pages.

## Index configuration

`functions/firestore.indexes.json` preserves the verificationRequests
`doctorUid ASC, profileRevision DESC` composite and adds exactly:

| Collection | Fields |
| --- | --- |
| appointments | patientId ASC, status ASC, startAt ASC |
| appointments | doctorId ASC, status ASC, startAt ASC |
| appointments | patientId ASC, startAt DESC |
| appointments | doctorId ASC, startAt DESC |

Firestore implicitly appends `__name__` in the last field's direction, matching
the explicit document-ID ordering above; no extra tie-break field/index is needed.
The ordinary index test checks all five definitions and no speculative additions.
**These indexes have not been deployed.** The emulator does not prove production
index availability or readiness.

References: [queries are not filters and query limits](https://firebase.google.com/docs/firestore/security/rules-query),
[implicit document-name index ordering](https://firebase.google.com/docs/firestore/query-data/index-overview),
[snapshot pagination cursors](https://firebase.google.com/docs/firestore/query-data/query-cursors).

## Schema and Rules cost

Individual gets check exact required top-level keys, schema version, known status,
document-ID binding, safe/distinct participant IDs, Timestamp interval/audit
fields, the 30-minute UTC grid/duration, availability reference/revision, minimal
doctor display and terminal metadata/actor/time consistency. Unknown fields
(including health/payment fields) fail. Authorization uses participant IDs only.

Lists cannot use Rules as a schema filter: Firestore must prove authorization for
every potential query result. List Rules therefore prove ownership and bounds;
the strictly validating trusted backend is responsible for the full stored schema.
A privileged Admin SDK write of a corrupt own-participant document could appear
in a list even when individual get rejects its schema. Ordinary clients cannot
create that state, and a malformed document cannot relax the caller-bound query
constraint. Server credentials and privileged data repair remain trusted boundaries.

Appointment authorization looks up only one unique document path, the caller's
canonical identity. Repeated helper calls use the same path; there are no
counterpart, profile, verification, lock or availability lookups. Full 50-row
pages for both roles and both shapes exercise query expression/access-call limits.
Get validation is local to the appointment after caller authorization; it does
not repeat deterministic hashing or cross-document backend consistency checks.
Existing C3 public-profile/credential rules are unchanged. Expected denial logs
must be distinguished from an authorization-success test hitting a limit.

## Cross-collection privacy

Tests first prove appointment access, then verify the relationship grants no
counterpart user, patient profile/health, private doctor profile, credential,
verification request/audit or administrator provisioning audit access. Existing
owner reads remain available. A legitimate public doctor projection remains
readable with exactly its minimal fields; private data cannot be appended by a
client. Collection enumeration remains closed. Booking locks, doctorAvailability
and retired availabilitySlots deny every client get/list/create/update/delete.
Direct appointment mutations also remain denied.

## Audit of the eleven active callables

| Callable | Reviewed authorization, integrity and retry boundary |
| --- | --- |
| completeRegistration | Auth UID and verified Auth user data; patient/doctor-only registration; canonical identity transaction and exact retry; no client administrator provisioning. |
| saveDoctorProfileDraft | Active canonical doctor; owner-bound draft; revision and approved-field policy; no client identity mutation. |
| prepareDoctorCredential | Active eligible canonical doctor; profile/credential ownership; strict metadata and expiring private slot; replay/state checks. |
| finalizeDoctorCredential | Same canonical ownership; actual generation, byte count and checksum inspection; transaction rechecks metadata/state after Storage inspection. |
| submitDoctorVerification | Canonical active doctor; bound profile revision and ready evidence; transaction rechecks after inspection; immutable submitted snapshot and retry policy. |
| reviewDoctorVerification | Canonical active administrator; immutable request/evidence binding; no self-review; transactional identity/projection/audit decision and exact retry. |
| replaceDoctorAvailabilityDay | Current approved doctor with private/public/approved-source binding; expected revision; all 48 doctor lock positions checked; appointment/companion-lock coverage before writing. |
| getAvailableAppointmentTimes | Active canonical patient and currently approved target; bounded dates; validates occupancy and companion reservations; sanitized response and post-read time filtering. |
| bookAppointment | Canonical active patient/current approved doctor; deterministic intent key; strict availability and both resource locks; atomic create; scheduled retry validates reservations, terminal retry does not touch reused locks. |
| cancelAppointment | Canonical active participant; strict appointment binding; before-start boundary; validates both owned locks before atomic terminal update/release; exact terminal replay skips locks. |
| recordAppointmentOutcome | Canonical active doctor participant; at/after-end boundary; same reservation validation/atomic release; exact decision replay, conflicting terminal decisions rejected. |

No concrete C4 handler defect was found in this pass; no callable implementation
was changed. Scheduling transactions perform reads before writes and reauthorize
on retries. Unexpected SDK failures are sanitized; transient transaction failures
are not translated into permission errors inside C4 authorization. Missing,
malformed and inaccessible lifecycle appointments share a generic denial.
Private occupancy is reported as a generic conflict. Stored Timestamp decoding,
full validators and deterministic owner/time bindings remain enforced.

No legacy handler is added to the export path. `src/index.ts` still exposes exactly
the eleven callables above; export-surface tests protect that boundary. No client
direct-write path or automatic repair of corrupt locks was introduced. The
pre-existing Firestore/Storage cross-service atomicity limitation is unchanged.

## Concurrency and remaining boundaries

The dedicated availability/booking/lifecycle emulator suites run with the complete
Rules gate. They cover doctor and patient double booking, booking versus coverage
removal, cancellation versus rebooking, terminal conflicts, removal after
cancellation, exact duplicate requests, transaction reauthorization, rollback and
replacement-lock preservation. Reads add no writes or transaction side effects.

Future M-Pesa records belong in an independently authorized payments collection
referencing immutable `appointmentId`. No payment status, amount, phone, receipt,
transaction ID, STK fields, payment locks or callbacks are added to appointments.
Payment policy must not silently alter the established scheduling lifecycle.

C5 may consume appointment ID, participants, interval and current status, but
must independently authorize consultations, rooms, messages and health access.
Appointment participation currently grants none of those privileges.

The [4G integration gate](SCHEDULING_INTEGRATION_GATE.md) now exercises scheduling
transport, runtime wiring and supported client read contracts together. 4F does
not implement appointment UI, rescheduling, payments or production rollout. Index
deployment/readiness and real-device scheduling validation remain future work.

## Local regression evidence

The 4F gate used cached Node 22.23.3 for Functions, with no dependency changes:

| Check | Result |
| --- | --- |
| Functions TypeScript build | Passed |
| Ordinary Functions Jest | 843 tests, 15 suites passed |
| Complete Firestore Rules gate | 478 tests, 9 suites passed |
| Dedicated scheduling emulator suites, included above | Availability 17, booking 25, lifecycle 27 passed |
| Storage gate | 56 tests, 1 suite passed |
| Mobile typecheck | Passed |
| Mobile Jest | 50 tests, 4 suites passed |
| Expo Doctor | 21/21 checks passed |

4F adds 75 appointment-read Rules tests and one ordinary index test. Existing
booking denial tests now assert the newly authorized participant gets while
retaining denied writes, unrestricted lists and lock access. The Storage emulator
continues to log its known 1000-expression/null-value errors during denial cases,
Java Unsafe deprecation warnings and a shutdown NullPointerException; its command
exits successfully. These are separate from the new appointment success paths.
No appointment authorization-success test hit an expression/access-call limit.
