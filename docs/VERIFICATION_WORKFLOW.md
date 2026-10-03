# Verification workflow (Checkpoint 3F)

## Callable contracts

`submitDoctorVerification` accepts exactly `{ credentialIds, expectedRevision }`.
The revision is a positive safe integer; the selection contains 1–5 distinct IDs,
including a medical license. `reviewDoctorVerification` accepts exactly
`{ requestId, expectedRevision, decision, rejectionReason? }`. Decision is
`approved` or `rejected`; rejection requires a trimmed, nonblank reason of at most
1000 UTF-16 code units. Approval rejects the reason field. Unknown fields fail.
Both return `{ requestId, state, profileRevision }`.

Canonical active identities in `users` authorize every transaction attempt.
Submission requires role `doctor`; review requires `administrator`, never `admin`
or a custom claim. Self-review is denied. The target must remain an active doctor.
No professional fields, UID, timestamps, reviewer or evidence facts come from input.

## Submission and immutable evidence

A read-only transaction validates identity, private draft, expected revision,
latest request and selected credential metadata. Storage inspection then reads
the finalized generation and hashes its bytes. A second transaction repeats the
Firestore checks and checks current object metadata against those observations.
It atomically creates the request, attaches credentials, sets `activeRequestId`,
preserves the draft revision, sets identity verification status to pending and
creates a submission audit event. Identity `updatedAt` remains ISO UTC; domain
document timestamps are Firestore Timestamps.

The request stores requestId, doctorUid, profileRevision, previousRequestId,
professional, credentials, state, reviewerUid, submittedAt, reviewedAt,
schemaVersion, createdAt and updatedAt. The professional snapshot contains only
professionalName, specialty, registrationNumber and issuingAuthority. Evidence
references contain only credentialId, category, generation and checksum.
Submitted reviewerUid/reviewedAt are null. Completed reviewerUid comes from the
authenticated administrator. Rejected requests additionally contain rejectionReason.
Private phone information is never copied into the snapshot or public profile.

Evidence must be ready, unattached, owned by the doctor and structurally valid.
Actual generation, SHA-256, MIME and size must match finalized metadata. Attachment
binds the evidence permanently to this request; history is retained.

Firestore cannot atomically commit a Storage observation. A privileged object
change between the final observation and Firestore commit remains possible.
Client replacement/deletion is denied, generation-pinned inspection detects
observed changes, and approval checks evidence again. These checks establish
digital evidence integrity, not authenticity of a medical qualification.

## Retry and resubmission

Request IDs are backend-generated. Within a transaction, the latest request query
orders a doctor's requests by profileRevision descending. The required composite
index is declared in `functions/firestore.indexes.json`; it has not been deployed.
Firestore emulator tests do not prove that this index exists in production.

An identical selection and revision returns the existing submitted request when
the active reference and attached metadata agree. A matching rejected submission
can likewise return its historical result while the same draft remains current.
Concurrent attempts cannot create two active requests. Different/stale selections
fail closed. Approved doctors cannot submit, including a submission retry after
approval. A new submission following rejection requires a newer draft revision,
fresh ready credentials and a link to the latest rejected request. Old evidence
is not rebound. Re-verification is deferred.

## Review and publication

Approval revalidates request/profile/identity consistency, attached metadata and
actual binary evidence. The final transaction rechecks authorization and evidence,
records reviewer/time/decision, sets the doctor's approved status and ISO updatedAt,
clears activeRequestId, sets approvedRequestId, preserves revision, publishes the
projection and creates the decision audit event.

Rejection requires consistent request/profile/identity state but deliberately
does not require healthy credential metadata or binaries: an administrator can
reject a reviewable request with missing evidence. It records reason/reviewer/time,
sets rejected status, clears the active reference and removes any stale public
projection. It retains the request and attached evidence as history.

The public projection is derived from the immutable request, with exactly uid,
professionalName, specialty, approvedRevision, approvedRequestId, schemaVersion,
publishedAt and updatedAt. It excludes contact details, registration identifiers,
credential paths, reviewer and rejection history.

An exact completed decision replay by the same administrator returns the existing
result if the deterministic audit record agrees. Rejection reasons are normalized
before comparison. Conflicting decisions or different reviewers cannot overwrite
a completed decision. Replays still require active canonical identities and a valid
profile; a historical rejection replay does not mutate a newer draft.

## Audit and client access

`verificationAudit` is singular. Events contain eventId, requestId, doctorUid,
actorUid, action, occurredAt and schemaVersion. IDs are SHA-256 of the serialized
request ID and phase (`submitted` or `review`). Transactional create preconditions
make events append-only and prevent duplicate events for a logical decision.

| Collection | Permitted client get | Client list or mutation |
| --- | --- | --- |
| verificationRequests | Canonical active doctor owner or administrator | Denied |
| verificationAudit | None | Denied |
| doctorCredentials | Canonical active doctor owner; administrator only for attached evidence with a request ID | Denied |
| doctorPublicProfiles | Canonical active identities, for an active approved doctor with a matching approved source request | Denied |

Request read rules validate the field envelope, state, reference structure and
caller access. Full normalized text/path validation remains in the backend-only
write path. Repeating every backend content check on reads exceeds Firestore's
1000-expression limit for valid requests; the read boundary does not grant writes.

Storage permits canonical active administrators to get attached evidence with a
request ID, including retained history. Owners retain prepared/ready reads and
gain attached reads. Other doctors, patients, disabled and claim-only administrators
are denied. Storage uses the canonical identity and credential documents within
its two-document lookup budget. Atomic backend attachment establishes request
provenance; Storage does not read a third request document. Generation, size and
MIME checks remain required. No patient-health access is expanded.

## Export surface and verification boundary

Only completeRegistration, saveDoctorProfileDraft, prepareDoctorCredential,
finalizeDoctorCredential, submitDoctorVerification and reviewDoctorVerification
are exported. Legacy verification handlers remain inactive.

Unit tests exercise injected transactions, failures, retries and authorization.
Firestore rules tests exercise real client permissions against a local demo
emulator. Storage tests additionally invoke the actual persistence handlers against
demo Firestore/Storage for concurrent submission/review, publication, rollback,
missing evidence, rejection and resubmission. These supply authenticated caller
context directly; they do not test callable transport or a full Auth-emulator flow.
The complete cross-service release gate belongs to 3G. No production resources,
deployment, UI, re-verification, invalidation execution or automated retention
cleanup are included.
