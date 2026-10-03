# Doctor professional drafts (Checkpoint 3D)

## API and trust boundary

`saveDoctorProfileDraft` is an authenticated callable. Its input is an object with
only these optional strings: `professionalName`, `specialty`, `phoneNumber`,
`registrationNumber`, `issuingAuthority`. It uses the 3B validator, normalization
and limits. Unknown fields, including UID, revision, workflow references and
timestamps, are rejected. The result is `{ revision, changed }`.

The authenticated UID selects both `users/{uid}` and `doctorProfiles/{uid}`.
Inside each Firestore transaction attempt, the existing canonical Checkpoint 2
`createAuthorization().requireActive()` validates the stored identity. The handler
then requires role `doctor`; token role claims and public input never authorize it.
Missing, malformed, mismatched, disabled and non-doctor identities fail closed.

The profile is separate from identity. The transaction validates the entire stored
profile with 3B validation, checks actual SDK Timestamp instances at the storage
boundary, and applies `planDoctorDraft`. No identity document or verification,
credential, history or public-profile document is written.

## Replacement, revisions and locking

- Pending, no active request: create an incomplete first draft at revision 1;
  replace editable fields on subsequent saves. Omitted optional fields are cleared.
- Rejected, eligible existing profile, no active request: replace the draft and
  increment revision. The existing 3B policy rejects a missing rejected profile:
  a prior rejected workflow without its draft is inconsistent and is not repaired
  by this operation.
- Any non-null `activeRequestId`: all ordinary saves are locked, including contact
  changes and identical retries. No submitted data is overwritten.
- Approved: professional fields stay unchanged. Input may contain only private
  phone, or also contain identical professional values. Omitted professional fields
  are supplied from the transaction's current profile before applying 3B policy;
  supplied changes are rejected. Omitted phone removes it. Revision and
  `approvedRequestId` stay unchanged. An approved identity without a matching
  approved profile state fails closed.
- Non-approved saves that actually change editable fields increment once, including
  private phone changes, following 3B's existing draft policy. Identical normalized
  saves are no-ops with unchanged revision and timestamps, after authorization,
  stored-state and locking checks. Creation/update timestamps are backend generated
  Firestore Timestamps; creation time is preserved, and time cannot move backward.

Both request-reference fields are backend owned. Inconsistent references are
rejected; approved references survive phone saves. Existing rejection history is
not stored in these fields by 3B, and this operation never edits history documents.

## Transactions, retries and concurrency

Each transaction attempt rereads the identity and profile before staging a single
full-document write. These are the only documents whose state determines this
operation. An active request is locked by its reference alone; this checkpoint
neither reads nor creates request/credential persistence. State changes during an
attempt cause Firestore to retry and reevaluate authorization and locking.

Firestore retries discard aborted attempts; they do not cumulatively increment
the revision. Concurrent identical saves converge on one revision. Distinct saves
serialize, with each changed replacement incrementing from the current revision.
Exceptions and failed commits produce no partial write and no success response.

There is no public revision precondition or idempotency token in the approved input.
Consequently, this is state-based retry deduplication, not permanent request-ID
deduplication: replaying an old, different payload after another save is a new
replacement and can overwrite that intervening draft. Clients must serialize saves
and refetch after uncertain outcomes. Future offline editing/conflict resolution
would need an explicitly approved API extension. Internal errors are sanitized.

## Rules and exports

Only an active canonical doctor owner may directly get an existing valid private
profile. Missing/malformed documents do not pass the read rule. Rules reproduce
identity calendar, Unicode trim/length and role/status checks, plus the private
profile schema and bounded fields. All list/create/update/delete operations are
denied. Patients, other doctors, administrators and guests have no direct access.
Other collection permissions, including patient profile rules, remain unchanged.

Exactly two Cloud Functions are exported: `completeRegistration` and
`saveDoctorProfileDraft`. Legacy verification handlers remain inactive.

## Tests and deferred work

`doctorDraft.test.ts` exercises validation, canonical authorization, replacement,
revision ownership, locking, retry state changes and sanitized failures.
`rules/doctorProfiles.rules.test.ts` checks private reads/write denial and later
collection isolation, and runs the actual Admin SDK transaction adapter against
the loopback `demo-calladoc-rules` emulator. It verifies concurrent saves, real
Timestamp persistence and rollback. No test connects to production.

Credential uploads, verification submission/review, public publication,
re-verification, Storage changes, UI and deployment remain outside 3D.
