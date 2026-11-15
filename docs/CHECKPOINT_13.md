# Checkpoint 13 � development-only patient privacy and consent

## Approved implementation boundary

No legally approved CallADoc policy exists. The in-app version
`development-2026-11-03-v1` is a synthetic-testing draft, not legal approval.
Acknowledgement means the notice was presented, not consent to every processing
activity. Patients explicitly choose Allow or Decline for optional medical-record
sharing; neither choice enables sharing in this checkpoint.

Existing appointments, chat, prescriptions and appointment-bound patient identity
continue under their existing authorization rules. Their lawful bases still need
review. No medical-record sharing endpoint, private download link or new doctor
profile access was introduced. Existing Firestore owner-only health-profile rules
and Storage deny-all paths keep future record sharing closed, including after a
recorded grant and following withdrawal.

## Architecture and changed files

- `functions/src/auth/completeRegistration.ts`: canonical patient registration and
  initial acknowledgement/sharing decision commit in the same transaction.
  Existing registration policy still validates roles, Auth email and identity.
- `functions/src/privacy/{consentPolicy,consentCallables}.ts`: validation, active
  patient authorization, current-state reads, revision checks and append-only audit.
- `shared/types/consent.d.ts`: narrow patient decision contract.
- `mobile/src/services/{authService,patientConsent}.ts`: explicit registration
  decisions, callable-only persistence and account-bound response checks.
- `mobile/src/components/{PatientConsentControls,PatientPrivacy}.tsx`: accessible
  unchecked choices, complete draft notices, current status, confirmed withdrawal,
  reload and retry. UI-12 semantic colors are reused, including native modal content.
- `mobile/src/screens/auth/AuthForm.tsx`: patient-only registration/recovery controls.
- `mobile/src/screens/patient/PatientExperience.tsx`: Privacy & Consent within Profile,
  keyed by patient UID to clear sensitive state on account changes.
- Functions export declarations and related unit/integration fixture assertions.

No rules, backend clinical authorization, dependencies, native/network configuration
or production resources were changed by Checkpoint 13.

## Data model and retries

`patientConsents/{patientUid}` contains the authoritative current state:
patientUid, revision, documentVersion, privacyAcknowledged, sharingDecision
(granted/declined/withdrawn), source, server-generated recordedAt and privacyAcknowledgedAt (ISO UTC), scope
(`medical-records-for-treatment`) and developmentOnly=true.

`patientConsents/{patientUid}/history/{requestId}` stores the validated input,
resulting state and a server-generated Firestore Timestamp. Each event records
both notice acknowledgement and the distinct sharing decision. The source is
registration only through completeRegistration, otherwise profile. No UID or
client timestamp is accepted. Client reads/writes of both paths are denied by the
existing catch-all rules; authorized patients retrieve their own current state
through getOwnPatientConsent. Doctors cannot change these records.

Profile writes compare all expected revisions in a transaction, create a receipt,
and update current state atomically. Exact retries return current state without
writing; conflicting request reuse fails. A stale revision fails. A registration
retry never restores an earlier grant over a subsequent withdrawal. The privacy
form retains the exact request after uncertain responses until retry or reload.
Only a current grant can transition to withdrawn. Withdrawal preserves the original notice acknowledgement time and version; it does not fabricate a renewed acknowledgement. No clinical records are deleted.

## Existing patients

Absence means unrecorded, never consented. Existing sessions and clinical access
are unchanged. Profile shows the unrecorded state and asks for explicit choices.
No migration, backfill or automatic opt-in occurs.

## Validation and reproduction

- Mobile TypeScript and Functions build pass.
- Focused mobile privacy/authentication/navigation/avatar/theme tests pass.
- Backend registration, authorization, policy and export tests: 129 passed.
- Live demo-calladoc emulator checks: registration atomicity, missing choices,
  decline, authorization/isolation, withdrawal/replay, concurrency, direct rules
  denial and legacy compatibility. Tests create uniquely named synthetic accounts;
  they never reset emulator databases or touch existing patient records.

Run the emulator checks only with the existing local emulator ports:

```powershell
$env:CHECKPOINT13_EMULATOR='demo-calladoc'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
node functions/node_modules/jest/bin/jest.js --config functions/jest.consent-emulator.config.js --runInBand
```

The separate config avoids adding live-demo tests to the isolated integration
runner, which uses different ports and resets its own disposable project.
The older isolated registration fixtures now include explicit decisions; that
entire cross-service suite was not rerun for this checkpoint.

## Mandatory release blockers

Legal review must approve the privacy notice and consent scope for Kenya, identify
controller/contact details, establish each lawful processing ground, recipients,
retention and transfers, rights/complaints procedures and guardian requirements.
Replace development documents with an approved version and retain these historical
texts. Do not relabel development grants as approved-policy consent.

New medical-record sharing remains disabled. Enabling it later requires an explicit
approved scope, current consent checked server-side on every disclosure, verified
assigned-doctor/consultation authorization, private object retrieval, and tests for
withdrawal/concurrency/caches. Client-side UI checks alone are insufficient.

Device verification is recorded separately in the task report; automated tests do
not prove Android rendering, screen-reader behavior or native keyboard behavior.

## Executed Pixel 7 checks

On November 3, 2026, the existing signed-in synthetic patient Profile displayed a
saved grant, document version, timestamp, development-only notice and unchecked
change controls. Light and live-switched dark appearances were visually inspected.
A duplicated section heading was corrected in source and the seven focused privacy
UI tests, mobile TypeScript and diff check passed afterward.

The development client could not finish a subsequent reload; Metro's local status
endpoint was unavailable. Therefore the final heading correction, notice-sheet
interaction, registration layout and withdrawal confirmation were not fully
verified on-device. No patient privacy decision was changed during visual checking.
The emulator was restored to light appearance; screenshots stayed in temporary
storage. Restart the existing emulator-mode Metro session, reload the Pixel 7, and
check Profile > Privacy & Consent, both document links/Android Back, and the
withdrawal confirmation (cancel it to preserve the patient's decision).
