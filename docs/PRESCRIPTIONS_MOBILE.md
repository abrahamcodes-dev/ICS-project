# Checkpoint 9E — digital prescription records

## Workflow

Patient Home → My prescriptions; Doctor workspace → Consultation prescriptions.
Both screens page through their existing authorized appointment history (20 at a
time) and display completed appointments. Select one to retrieve its prescription.
The doctor may enter 1–10 medications, each with name, dosage, frequency, duration
and instructions. Review and explicit confirmation precede issuance. No medication
choices or clinical instructions are generated.

In Doctor workspace → Consultations → Appointment history (or the dated Schedule),
the assigned doctor can select Record completed appointment once a scheduled
appointment has ended. Explicit confirmation calls the existing
`recordAppointmentOutcome` with outcome `completed`. Pending requests block
duplicate taps; uncertain results offer the identical idempotent retry. A valid
completed acknowledgment triggers an appointment reload. The prescription selector
only offers appointments returned with completed status; local elapsed time never
changes status. Existing cancellation, no-show and consultation rules are unchanged.
Expiry, call termination, or a closed consultation does not imply clinical
completion. A consultation must have been opened previously. Missing consultation
records are denied, not reconstructed.

## Backend and security

`issuePrescription({consultationId, requestId, medications})` and
`getConsultationPrescription({consultationId})` are production source exports
(23 total), **not deployed**. Both resolve canonical active identity, validate the
authoritative appointment and consultation binding, and enforce participant role.
Only the assigned doctor can issue; new issuance also requires current complete
doctor approval bindings, active patient, and completed appointment outcome.

Reads require the active associated patient or issuing doctor. Administrators,
claim-only identities and unrelated users have no access. Historical reads and
exact issuance replays do not require current counterpart eligibility/approval.
All authorization reads and persistence share a Firestore transaction.

One immutable `prescriptions/{consultationId}` document per consultation:

- `prescriptionId`, `consultationId`, `appointmentId` (same deterministic ID)
- server-derived `doctorId`, `patientId`, `issuedBy`
- `medications`: name/dosage/frequency/duration (1–200 characters each) and
  instructions (1–1000); trimmed strings, no control characters or extra fields
- server `issuedAt` Firestore Timestamp, `schemaVersion: 1`, request UUID

The doctor/creation timestamp/request UUID provide the immutable issuance audit.
The callable DTO excludes `requestId` and `issuedBy`; timestamp milliseconds are
for display, with full precision retained in storage. Reads return one record or
explicit null. No unbounded prescription query or additional index is required.

All reads precede writes; new issuance samples time after approval reads.
Existing consultation reconciliation closes the room on its recorded completed
outcome without altering the appointment. Closure and prescription creation are
atomic. Same UUID and normalized content replay the original record; changed
content or a different UUID conflicts. Transaction `create` and the deterministic
path prevent parallel duplicate records. There is no update/delete/amendment API.

Firestore/Storage Rules are unchanged: direct prescription reads and writes remain
denied by the existing catch-all. Admin SDK calls enforce authorization independently.
The old mobile direct-write service is replaced with callable access. No content is
logged or persisted in mobile local files, and no public URLs are used.

## Retry and session behavior

The mobile session retains an immutable payload and UUID during uncertain retries,
blocks concurrent duplicate requests, and validates response bindings. Unconfirmed
issuance is never shown as successful. Retrieve can reconcile a lost acknowledgment.
Identity changes, blur/unmount and account changes clear or invalidate sensitive
state and ignore late responses. Retry state is memory-only: after leaving, retrieve
the existing record before composing again. The one-record constraint still prevents
duplicates with a new UUID. No offline prescribing or persistent draft queue exists.

## Validation and remaining verification

Focused backend tests exercise authorization, approval loss, completion eligibility,
bindings, validation limits, exact/conflicting retries, simulated concurrent requests,
rollback, privacy and persistence Timestamp handling. Mobile tests cover callable
payloads, response isolation, duplicates, retries, confirmation, errors and cleanup;
existing patient/doctor navigation tests are included.

Automated results: Functions build under Node 22 passed; mobile TypeScript passed;
prescriptions/export tests 24/24, persistence adapter tests 5/5, mobile service/UI
and affected navigation tests 26/26. Whitespace checks passed. Initial validation
caught a shared-type rootDir mismatch and a parameterized test-array error; both
were corrected before these passing results. No full regression was run.

Completion UI follow-up: mobile TypeScript passed; 52/52 tests across scheduling
service, appointment UI, prescription UI and doctor workspace passed. Coverage
includes role/time/status gating, explicit confirmation, duplicate prevention,
uncertain retries, teardown and prescription selection only after a completed
status is returned. No backend source changed in this follow-up, so its passing
build and tests were not repeated. Rules execution remains pending.

The Rules emulator was not running and emulator launch is prohibited for this task.
Existing `functions/__tests__/rules/identity.rules.test.ts` includes prescription
denial; Rules execution and real transaction concurrency remain pending. Unit
transaction serialization is not evidence of real Firestore contention.

Android/device verification is pending. Use synthetic clinician-entered content,
an approved doctor, associated active patient, existing consultation and a backend-
recorded completed appointment in the authorized local environment. Verify issue,
patient retrieval, doctor history, lost-response retry, account switching and denials.
Functions must be available locally; source exports do not deploy them.

Limitations: one immutable prescription per consultation; no amendments, revocation,
dispensing, payments, PDF export or medical decision support. This is a prototype
record workflow, not a verified clinical prescribing or pharmacy integration.
