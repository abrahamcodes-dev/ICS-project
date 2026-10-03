# CallADoc data contracts

## Authorization identity (Checkpoint 2)

users/{uid} contains only the canonical identity contract in shared/types/identity.d.ts.
Roles are patient/doctor/administrator. Account status is active/disabled; doctor
verification is pending/approved/rejected. Identity timestamps remain ISO UTC strings.
Clients cannot write identities. completeRegistration creates identities;
operator provisioning is local only. Profile, review and rating fields do not belong
in users. Legacy Patient/Doctor interfaces are UI scaffolds, not persistence schemas.

## Domain collections (3B contracts, 3C–3F persistence)

| Path | Contract |
| --- | --- |
| patientProfiles/{uid} | PatientProfile |
| patientHealthProfiles/{uid} | PatientHealthProfile |
| doctorProfiles/{uid} | DoctorProfile |
| doctorPublicProfiles/{uid} | DoctorPublicProfile |
| doctorCredentials/{credentialId} | DoctorCredentialRecord |
| verificationRequests/{requestId} | VerificationRequest |
| verificationAudit/{eventId} | VerificationAudit |

See shared/types/profiles.d.ts and verification.d.ts for exact field types.
DomainTimestamp is the readonly structural seconds/nanoseconds shape of a Firestore
Timestamp. Persistence adapters use real trusted/server timestamp values; this shape
does not authorize plain-map persistence or client clocks. Domain documents have
schemaVersion 1. No change is made to identity timestamp storage.

PatientProfile: uid; optional displayName, phoneNumber; schemaVersion, createdAt,
updatedAt. PatientHealthProfile: uid; optional dateOfBirth, gender, knownConditions,
allergies, currentMedications; schemaVersion, createdAt, updatedAt. All health values
are optional; omission means not supplied. Empty lists mean supplied empty lists,
not a clinical assertion. No global doctor/admin health access is implied.

DoctorProfile: uid; optional professionalName, specialty, registrationNumber,
issuingAuthority and private phoneNumber; revision (positive integer), activeRequestId
and approvedRequestId (explicit string or null); schemaVersion, createdAt, updatedAt.
Professional fields become required at submission. New draft revision is 1.
Expected revision 0 is only for absent initial drafts. Professional draft saves
increment the revision; allowed post-approval contact edits retain that revision.

DoctorPublicProfile: uid, professionalName, specialty, approvedRevision,
approvedRequestId, schemaVersion, publishedAt, updatedAt. It is built only from
approved reviewed data. No phone/email/license identifiers/credential references
or rejection reason is included.

## Credentials

Categories: medical_license, professional_certificate, identity_document,
other_supporting_document. Declared MIME: application/pdf, image/jpeg, image/png.
Size: 1 through 5,242,880 bytes inclusive. One request accepts 1 through 5 distinct
ready credentials, including at least one medical_license.

Metadata: credentialId, doctorUid, storagePath, category, contentType, sizeBytes,
state (prepared/ready/attached/invalid), generation, checksum, requestId, expiresAt,
schemaVersion, createdAt, updatedAt. Prepared generation/checksum/requestId are null.
Ready generation is a bounded decimal string, checksum is SHA-256 lowercase hex,
requestId is null. Attached records bind a requestId. Finalized values must eventually
come from a trusted finalizer, not a caller's assertion; pure validation cannot prove
file existence, content type, authenticity or successful upload.
expiresAt governs the prepared upload slot, not the lifetime of finalized evidence.
Invalid records cannot be submitted.

Path: doctorCredentials/{doctorUid}/{credentialId}/document. IDs reject separators,
dot traversal, encoded separators, control characters, empty/oversized values.
No download URL is part of the contract. Binary files will belong in Storage.

## Submission, review and history

A VerificationRequest stores requestId, doctorUid, profileRevision, immutable
professional snapshot (professionalName/specialty/registrationNumber/issuingAuthority),
1-5 credential references (credentialId/category/generation/checksum),
previousRequestId, state, submittedAt, reviewedAt, reviewerUid, schemaVersion, createdAt, updatedAt.
Snapshot objects, references and timestamps returned at submission are copied/frozen.
Changing the source draft or metadata cannot change the submitted snapshot.

States: submitted, approved, rejected, invalidated. submitted has reviewedAt=null
and reviewerUid=null. Completed requests store the trusted reviewer UID (3F).
Approval has no rejectionReason. Rejection requires a nonempty reason of at most
1000 characters. invalidated includes invalidatedAt and retains reviewedAt; execution
of integrity invalidation is deferred, not implemented in this step.
The pure review policy accepts only explicit approved/rejected input, not exception
objects. Future handlers must never derive a visible reason from caught exceptions.

Draft edits are blocked while activeRequestId is set. Approved professional fields
are locked; private phone updates/removal are allowed without changing the approved
professional revision. Full editable-field replacement is used: omission clears an
optional field; explicit null/undefined or empty strings are rejected.
Submitted snapshots are not edited or replaced. A rejected doctor must save a new
draft revision and use a fresh request ID referencing the previous rejected request.
This version requires newly finalized, unattached credential records for resubmission;
it does not rebind old attached evidence or alter old requests.
A resubmission returns identityVerificationStatus=pending from the pure policy;
the 3F handler applies it in the submission transaction.

Pure review rejects self-review, stale revisions, changed snapshots, duplicate review,
wrong doctor/request bindings and invalid state. Approval returns a planned public
projection; rejection returns null. Audit output: eventId, requestId, doctorUid,
actorUid, action, occurredAt, schemaVersion. The 3F handler resolves and authorizes
the actor; pure policy does not establish administrator identity.

## Validation limits

Names/authority: 200 characters; specialty/registrationNumber: 120; phone: 32,
at least 3 digits with optional leading plus and spaces/parentheses/hyphens.
Phone formatting is not ownership verification. Gender: optional free text, 50.
Each health list: 20 entries, 200 characters each. Rejection reason: 1000.
Text is trimmed; blank/control-character input is rejected. Limits count JS UTF-16
code units. DOB is a valid YYYY-MM-DD calendar date no later than an explicitly
supplied trusted today value. No inferred age minimum or clinical fields are added.

## Later implementation boundaries

The 3B contracts themselves perform no persistence. The 3C–3F adapters and rules
now implement authorized persistence; see VERIFICATION_WORKFLOW.md for the current
callables, transaction checks and cross-service evidence boundary. Full integration
verification belongs to 3G. Retention and deletion policies remain unresolved.
