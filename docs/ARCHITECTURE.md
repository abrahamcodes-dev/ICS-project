# Architecture notes

## Implemented foundation (Checkpoint 2)

Firebase Authentication -> authenticated completeRegistration callable -> pure
registration policy -> Firestore transaction -> backend-controlled users/{uid}
identity -> authorization/rules -> mobile identity consumption.

Public registration permits patient/doctor only. New doctors are pending.
Administrator provisioning is an operator-only local tool. Checkpoint 2 exported only
completeRegistration; unfinished privileged workflow implementations remain inactive.

Firestore client identity writes are denied. Checkpoint 3E replaces the old
Storage claim model with canonical Firestore identity and credential-slot checks.

## Domain contracts (Checkpoint 3B)

shared/types/profiles.d.ts and verification.d.ts define separate profile, credential,
request and audit documents. functions/src/profiles/domainValidation.ts and
verificationPolicy.ts provide pure validation and planning. They import no Firebase
runtime and perform no storage operations. See ERD.md for exact fields and limits.

Patient inputs contain only editable nonclinical/optional health fields.
Doctor draft input cannot set identity, revision, request references or approval.
Submission copies/freeze-protects a complete professional snapshot and finalized
credential references. Review returns a plan for request/profile/identity status,
public projection and audit; it does not execute any of those writes.

Pure policy accepts trusted context arguments supplied by future authorized handlers.
It is not a replacement for backend authorization or Firestore/Storage rules.
Future transactions must re-read roles, account status, doctor/request state and
revisions to prevent races. Storage finalization must check actual immutable objects.
Client input validators cannot verify licensing authenticity or identify arbitrary
internal exception text: handlers must supply human review reasons deliberately.

## Patient persistence (Checkpoint 3C)

Direct Firestore access now protects patientProfiles/{uid} and
patientHealthProfiles/{uid}. Only their active patient owner with a valid users
identity may get/create/update them. List and delete are denied. Other patients,
doctors and administrators have no access. No callable or mobile adapter was added.
See [PATIENT_PROFILES.md](PATIENT_PROFILES.md) for timestamps, replacement writes,
validation and emulator coverage. Identity and other collection permissions remain
unchanged; the additional calendar checks apply only to patient-profile access.

## Doctor draft persistence (Checkpoint 3D)

The authenticated saveDoctorProfileDraft callable now persists private doctor
drafts in a transaction. It rereads canonical identity and profile state on every
attempt, applies the 3B transition policy, and owns revisions and timestamps.
Direct client writes remain denied; only the active doctor owner can get a valid
private profile. Approved professional fields are locked, with an explicit private
phone exception that preserves the approved revision. See
[DOCTOR_DRAFTS.md](DOCTOR_DRAFTS.md) for replacement and retry semantics.

The current export surface is completeRegistration and saveDoctorProfileDraft.
Legacy verification handlers remain inactive.

## Credential persistence (Checkpoint 3E)

prepareDoctorCredential creates an expiring private slot; direct SDK upload is
authorized by Storage Rules; finalizeDoctorCredential verifies the actual stored
generation/bytes and persists SHA-256 in ready metadata. Client overwrites,
deletion and metadata mutation are denied. See
[CREDENTIAL_STORAGE.md](CREDENTIAL_STORAGE.md) for API, expiry, cross-service
limitations, emulator coverage and deferred token/retention considerations.

The current export surface adds prepareDoctorCredential and
finalizeDoctorCredential to completeRegistration and saveDoctorProfileDraft.

## Verification workflow (Checkpoint 3F)

submitDoctorVerification and reviewDoctorVerification now execute the pure policy
through trusted Firestore transactions and generation-bound Storage inspection.
They maintain immutable requests, attached evidence, administrator decisions,
minimal public projections and append-only verificationAudit events. Canonical
identity authorizes each transaction; custom claims do not authorize review.
See [VERIFICATION_WORKFLOW.md](VERIFICATION_WORKFLOW.md) for contracts, retry
semantics, client access, evidence checks and the cross-service atomicity boundary.
The current export surface is the four 3E callables plus these two callables.

## Deferred checkpoints

The local four-service release gate is documented in
[PROFILES_INTEGRATION_GATE.md](PROFILES_INTEGRATION_GATE.md). It exercises Auth
tokens and callable transport in addition to the existing unit and Rules suites.

Production verification, invalidation execution and
retention policy remain future work. No profile screens, upload UI, notifications,
appointments, consultations, prescriptions or ratings are part of 3B.
