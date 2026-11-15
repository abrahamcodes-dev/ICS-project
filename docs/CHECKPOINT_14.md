# Checkpoint 14 — private consultation documents

## Status and approved scope

Doctor-originated PDF, JPEG and PNG attachments are implemented for authenticated,
verified, assigned doctors in active consultations. Authorized participants can
open finalized documents from the existing chronological chat history.

**Patient-originated document sharing remains disabled server-side.** Checkpoint
13 records use `development-2026-11-03-v1` and are explicitly development-only.
They cannot establish an approved legal basis for new medical-record disclosure.
Absent, declined, withdrawn and development-granted choices all fail closed.
The patient attachment control explains this boundary and links to Profile's
Privacy & Consent section. Existing text chat, appointments, prescriptions and
appointment-bound identity keep their existing authorization.

Legal review remains mandatory before real-patient use. Doctor attachments use
the existing clinical participant authorization; this is not a representation that
their lawful processing grounds have been approved. Enabling patient uploads
requires an approved policy/version and tested current-consent checks at every
new consent-dependent publication. No client-controlled switch enables it here.

## Existing architecture reused

- `consultationTransaction`, canonical identities, `authorizeHistory`,
  `authorizeNew`, `assertSendWindow`, consultation binding and approved-doctor
  profile/public-source validation remain the authorization foundation.
- Text message sending is unchanged. Attachment messages use the same immutable
  messages subcollection, chronological subscription, pagination and notification
  event transaction. No duplicate document feed or patient-profile lookup exists.
- The existing Expo document picker, Blob Util private cache and native PDF/image
  renderer are reused. No dependency or native/network configuration changed.
- UI-12 semantic palettes style the composer, progress, document cards and viewer.

## Data model

`consultationAttachments/{attachmentId}` is backend-only. Its prepared record binds
the consultation, message ID, authenticated sender, sanitized filename, MIME, exact
size, private object path, original request, creation/expiry time and cleanup time.
The ID is a deterministic SHA-256 of the attachment namespace, consultation, sender
and request UUID. It cannot collide with a text-message request ID.

Before writing bytes, a Firestore transaction binds their SHA-256 to that upload
intent. Different bytes cannot reuse it. Finalization stores content checksum,
observed generation, finalized time and state, and removes pending cleanup fields.
Discarded records are retained as tombstones for delayed upload cleanup.

Only finalization creates `consultations/{cid}/messages/{messageId}`:

```text
messageId, senderId, type="attachment", schemaVersion=1, createdAt
attachment: attachmentId, consultationId, messageId, senderId,
            filename, contentType, sizeBytes, storagePath, status="finalized"
```

Local URIs, document bytes, bearer tokens and public download URLs never enter a
message or notification. Pending/progress/failure state stays with the sender's
local selection; the other participant sees only finalized messages.

## Upload and finalization

1. Select one supported file; the picker copy is transferred into a managed,
   app-private cache path. MIME and size are checked before starting.
2. `prepareConsultationAttachment` checks active canonical participants, approved
   doctor bindings, existing room, scheduled appointment and current send window.
   It returns only a backend-issued staging identifier/path. A retry must match the
   original declaration. Prepared slots expire after 15 minutes. Per-sender limits
   bound preparation to one per two seconds and 50 per consultation.
3. `uploadConsultationAttachment` authenticates the same owner, validates bounded
   canonical base64, exact size and file signature, binds the checksum transactionally,
   then stores bytes using the trusted GCS API with a create-only precondition.
   This operation does not publish a message.
4. `finalizeConsultationAttachment` inspects generation-pinned bytes, validates their
   signature/checksum again, rechecks authorization/lifecycle, then atomically marks
   the slot finalized and creates exactly one message and notification.
5. Exact retries acknowledge the existing publication, including after closure.
   Conflicting request declarations/bytes fail. The sender retains the same intent
   after uncertain responses; an upload retry checks finalization before sending
   bytes again. After process termination, inspect history before selecting again;
   automatic cross-restart resume is not implemented.

The 10 MiB limit is compile-checked through the shared attachment limit contract;
the server enforces it. Base64 adds transport overhead. The second-generation
HTTP request limit is documented by [Firebase](https://firebase.google.com/docs/functions/quotas).
Upload, finalization and viewing use bounded concurrency/memory settings.

### Why direct Firebase uploads are denied

Emulator tests demonstrated that the Firebase upload API automatically issues
bearer download tokens. Clearing custom metadata did not revoke the emulator's
internal tokens. Therefore all direct Storage reads **and writes** for consultation
attachments are denied. Trusted upload callables use the GCS API, which was tested
to create token-free objects. Finalization/viewing reject token-bearing objects.
No live-Firebase access or deployment was used for this finding.

This local emulator also ignores the GCS generation create-only precondition.
The Firestore-bound upload checksum independently rejects conflicting bytes and
normal retries inspect an existing object rather than rewriting it. A late,
already-authorized identical retry can recreate the same bytes in this emulator;
physical reads are generation-pinned and the immutable SHA-256 remains the content
identity. Production retains the GCS precondition as an additional protection.

Cancellation prevents publication by discarding the upload slot. Callable network
transfers cannot be aborted through the current Firebase SDK, so the UI shows
indeterminate progress stages instead of fabricated byte percentages. A write
already in flight may leave private staged bytes for cleanup. A published clinical
message cannot be deleted through cancellation; uncertain outcomes require checking
history. No success state appears before server confirmation.

## File validation and viewing

- Supported MIME types: application/pdf, image/jpeg, image/png; 1 byte–10 MiB.
- Backend checks actual size and bounded PDF/JPEG/PNG signatures. PDFs require
  an EOF marker; obvious JavaScript, launch, embedded-file and active-content
  dictionary names are rejected. Filenames are normalized, basename-only, bounded
  and stripped of control/bidirectional override characters.
- Signature checks are not a complete document parser or malware scanner. Encoded
  or complex active content is not comprehensively analyzed; approved production
  document-handling policy and renderer/security review remain necessary.
- `getConsultationAttachment` accepts identifiers only, verifies participant access,
  published message binding and checksum, reads a specific object generation, then
  rechecks authorization before returning bounded bytes. Patients retain access to
  their own doctor-originated history; doctor access requires current approval.
- The viewer writes an app-private temporary copy and uses the existing native
  PDF renderer (`cache:false`, `trustAllCerts:false`, annotations disabled) or image
  component. Close, backgrounding, selection teardown and account changes dispose
  the viewer and remove its cache copy. A startup sweep removes this feature's
  cache copies left by process death. Previously disclosed bytes cannot be recalled.

## Security rules and cleanup

Firestore clients cannot create/update/delete messages or read/write staging
records. Attachment message gets require the same parent history authorization
as text messages plus immutable attachment/room/sender bindings. Repeating every
file-metadata predicate exceeded the Firestore 1000-expression budget; complete
file/schema validation remains in the backend-only writer. Existing text-message
read validation was retained. Bounded list queries keep their existing policy.

Storage denies all client operations under
`consultationAttachments/{consultationId}/{attachmentId}/document`. No new public
rules, broader patient-profile reads or direct deletion permissions were added.

`discardConsultationAttachment` is owner-only and cannot delete published records.
`cleanupConsultationAttachments` is an hourly scheduled bounded sweep of expired
or discarded staging records. It checks paths, marks tombstones transactionally,
and retries private-object deletion on later sweeps. Finalized records are never
part of that cleanup. Firebase emulators do not establish production scheduling or
retention guarantees; the cleanup handler was invoked explicitly in integration
tests. No records are retroactively deleted on consent withdrawal.

## Lifecycle behavior

| State | New uploads/publication | Finalized history |
|---|---|---|
| Upcoming | Denied | Only an existing authorized, bound historical message can be read |
| Active scheduled room, within existing send window | Assigned approved doctor only | Authorized participants |
| Expired or closed | Denied | Authorized participants; current approval for doctor reads |
| Completed | Denied | Authorized participants; current approval for doctor reads |
| Cancelled | Denied | Existing history follows the established participant policy |
| Unrelated, inactive or unauthorized caller | Denied | Denied |

## Changed files

- `shared/types/consultationAttachments.d.ts`
- `functions/src/consultations/attachmentPolicy.ts`
- `functions/src/consultations/attachmentCallables.ts`
- `functions/src/index.ts`, `functions/firestore.rules`, `functions/storage.rules`
- `mobile/src/services/consultationAttachments.ts`, `consultationService.ts`
- `mobile/src/screens/shared/ConsultationAttachments.tsx`, `ConsultationChat.tsx`
- Focused attachment policy, transport, UI, message parsing and emulator tests;
  existing export-manifest assertions and consultation chat test navigation mock.
- `functions/jest.attachments-emulator.config.js`, this document.

## Executed validation

- Mobile TypeScript and Functions build passed.
- Focused backend attachment policy/export/text-message/consultation tests: 241 passed.
- Existing consultation/message Firestore Rules suites: 53 passed on the separate
  disposable `demo-calladoc-rules` emulator; the running application's data was not reset.
- Focused mobile attachment UI/service/message/chat/call tests passed, including
  light/dark rendering, private-cache cleanup, account changes and retry behavior.
- Live `demo-calladoc` attachment integration/security checks passed for doctor PNG
  and PDF publication/viewing, denied patient consent states, malformed/oversized
  files, signatures, direct rules, isolation, finalization retries, orphan cleanup,
  history, approval loss, missing bytes, immutable upload content and a full 10 MiB
  round trip. Upcoming/cancelled/completed states use isolated synthetic fixtures.
- No real patient documents, production resources or existing clinical records
  were used. The test runner never resets the live demo database.

Run the focused emulator tests with the existing local services:

```powershell
$env:CHECKPOINT14_EMULATOR='demo-calladoc'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9199'
node functions/node_modules/jest/bin/jest.js --config functions/jest.attachments-emulator.config.js --runInBand
```

## Device verification and remaining blockers

Pixel 7 was connected, but displayed the development client's loading surface;
Metro at `127.0.0.1:8081` returned ECONNREFUSED. No networking, Expo, Android or Metro
configuration was changed. Therefore actual picker/cache paths, native PDF/image
rendering, keyboard/layout and upload/cancellation behavior remain device-unverified.
Samsung A14 was intentionally disconnected; the user requested Pixel 7 only and
Samsung testing is not required for this checkpoint's continued work.

After restarting the existing emulator-mode Metro session, open an existing
synthetic active consultation. Inspect both roles' controls and both themes; the
patient action must explain its policy block and link to Privacy & Consent.
Doctor selection/cancellation can be inspected without sending a clinical record.
Use only an explicitly approved synthetic document for a later device upload test.
No clinical records were created/modified solely for screenshots.

Patient PDF-upload success cannot be claimed while the legal path is disabled.
Production legal approval, real-device validation and production cleanup scheduling
remain release blockers. No dependency, native build, commit, push or deployment
was performed.

### Final verification counts

The executed checks comprise 241 focused backend tests, 53 existing consultation
Firestore Rules tests, 13 attachment integration/security tests, and 52 distinct
focused mobile tests. After strengthening concurrent finalization and cancellation
recovery checks, the three affected emulator cases and ten focused mobile cases
were rerun successfully. TypeScript, Functions build and whitespace checks passed.
The broader multi-service release gate was not rerun; this checkpoint used the
focused suites and isolated synthetic fixtures described above.
