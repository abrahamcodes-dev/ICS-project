# Doctor credential lifecycle (Checkpoint 3E)

## API and metadata

`prepareDoctorCredential({ category, contentType, sizeBytes })` accepts only the
3B upload input. Allowed categories: `medical_license`, `professional_certificate`,
`identity_document`, `other_supporting_document`. Allowed MIME values:
`application/pdf`, `image/jpeg`, `image/png`. Size is an integer from 1 through
5,242,880 bytes, inclusive. No original filename is retained.

The backend generates a random UUID with Node's cryptographic `randomUUID()`.
It creates `doctorCredentials/{credentialId}` and derives the immutable object
path `doctorCredentials/{doctorUid}/{credentialId}/document`.

The existing 3B metadata schema is unchanged: credentialId, doctorUid, storagePath,
category, contentType, sizeBytes, state, generation, checksum, requestId,
schemaVersion, createdAt, updatedAt, expiresAt. Timestamps are real Admin SDK
Firestore Timestamps. New slots have state `prepared`, null generation/checksum/
requestId, schema version 1, and expire 15 minutes after creation.

`finalizeDoctorCredential({ credentialId })` accepts only the backend-issued ID as
a lookup reference. It cannot be used to choose a new ID, owner or path. Both
operations return credentialId, storagePath, state, expiresAt (seconds/nanoseconds),
generation, checksum, sizeBytes and contentType. No public/download URLs are
created, returned or stored by these operations.

## Authorization

Both callables reuse canonical Checkpoint 2 authorization. Every transaction
attempt reads `users/{uid}`, requires active doctor status and pending/rejected
verification state, and checks the current doctor draft. A submitted/approved
draft is locked. A pending doctor may prepare before creating a draft; a rejected
doctor must retain an eligible existing draft. No administrator impersonation,
custom-claim role authorization or client-selected target UID is accepted.

Storage Rules independently read only two distinct Firestore documents: canonical
identity and the credential slot. Their identity/schema validator bodies mirror
Firestore Rules and an ordinary unit test checks parity. Upload requires the
authenticated path owner, eligible doctor identity, valid prepared unexpired
slot, matching path/owner/MIME/declared size and permitted bounds. Client custom
metadata is rejected. A binary can only be created once; overwrite, metadata
update, delete, rename/move and listing are denied. Other paths are closed.

Storage gets require a valid active doctor owner and matching valid prepared or
ready metadata. Ready reads also bind the stored generation. Other doctors,
patients, guests and administrators have no access. Prepared binary reads remain
available after upload expiry, but an expired prepared slot cannot be finalized.
Approved doctors can read their own existing evidence but cannot start/finalize
an ordinary new flow. Invalid/attached binary access awaits later workflow rules.

Firestore allows only active doctor owner gets of valid credential metadata.
Client creates, updates, deletes and listing are denied. No administrator review
exception is introduced. Existing identity/patient/doctor-profile rules remain.

Storage Rules' cross-service setup uses the default Firestore database and needs
the documented service permission when deliberately deployed later. No production
permissions or resources are configured here. See the [Firebase cross-service
rules documentation](https://firebase.google.com/docs/storage/security/rules-conditions#enhance_with_firestore).

## Finalization and immutability

The first read-only transaction authorizes and validates ownership, path, slot
state and expiry. The trusted Storage adapter gets actual object metadata, bounds
the size, checks MIME, rejects encoded content, and preserves generation as a
decimal string without unsafe Number conversion. Missing objects fail closed.

The adapter streams the exact observed generation with decompression disabled,
caps bytes at 5 MiB, computes SHA-256 over those bytes and verifies observed length.
It then rereads live object metadata. A second Firestore transaction rereads all
authorization/workflow/credential state and rechecks the current Storage facts
before transitioning `prepared` to `ready`. Generation, SHA-256, actual size/MIME
and trusted `updatedAt` are persisted atomically. In 3B, updatedAt records this
finalization time; no extra finalizedAt field is introduced. Creation/expiry,
owner, category and path are preserved. Request association remains null.

MIME checking verifies stored object metadata against the permitted declaration;
it does not establish file authenticity, inspect document contents or scan malware.
The evidence categories are an academic prototype policy, not proof of legal
sufficiency for medical practice in any jurisdiction.

## Retries and cross-service limits

Preparation uses one backend ID throughout transaction retries and a create
precondition. A new callable invocation creates another slot; a lost response can
leave an unused expiring slot. It never overwrites existing evidence. Replacement
requires a new slot. No automatic cleanup is implemented.

Concurrent finalizations serialize through Firestore. If another attempt already
made the record ready, the same unchanged object's generation/checksum returns
the existing result without changing timestamps. Ready retries may occur after
upload expiry, but still require current eligible identity/draft state and a
matching actual object. Failed inspection, changed declarations, changed objects,
expired prepared slots and failed commits cannot create partial ready metadata.

Firestore and Storage do not share a transaction. Client immutability protects the
interval between the last object check and Firestore commit; privileged IAM/Admin
operations can bypass rules and can still race that interval. Detected changes
fail closed. Later submission must independently revalidate immutable generation
and checksum. Do not present this as protection against arbitrary privileged
bucket mutation or a completed verification workflow.

Standard Firebase SDK token-based download URLs are bearer capabilities if a
caller separately requests one. This implementation neither uses nor persists
them. Future clients should use authenticated SDK reads and must not distribute
download tokens. Bucket IAM and token lifecycle need explicit deployment review.

## Tests and operation

- `npm test -- --runInBand`: pure/mocked lifecycle and rule-validator parity tests.
- `npm run test:rules`: complete Firestore Rules regression suite on the existing
  demo configuration (port 8085).
- `npm run test:storage`: real Firestore + Storage emulators for
  `demo-calladoc-credentials`, ports 8095/9195, with isolated hub/logging ports.
  It exercises actual cross-service rules and the actual Admin adapters from
  preparation through SDK upload, SHA-256 finalization and concurrent retries.

Use Node 22. Emulator binaries may be downloaded to the local Firebase cache.
All emulator projects use `demo-` IDs. These tests do not deploy callables or test
production IAM, mobile UI, Auth-token transport or the future 3F workflow.

Exactly four Functions are exported: completeRegistration, saveDoctorProfileDraft,
prepareDoctorCredential, finalizeDoctorCredential. Legacy handlers stay inactive.

Submission/review, administrator evidence access, public publication,
re-verification, UI, automated cleanup, retention and deployment remain deferred.
3F must decide how live prepared slots and attached-object reads behave during
submission/review; Storage currently authorizes through identity and slot only.

## Checkpoint 3F integration note

The subsequent [verification workflow](VERIFICATION_WORKFLOW.md) implements
attachment and adds canonical administrator reads of attached evidence and owner
reads of attached objects. Its six-callable export surface supersedes the 3E
surface above. Retention and full end-to-end verification remain deferred.
