# Checkpoint 15 — account deletion and unresolved clinical retention

Checkpoint 16 integration: unresolved payments/refunds now block deletion in the
same acceptance transaction. Payment, pricing-history and provider/audit records
remain protected under unresolved retention; eligible-profile cleanup does not
erase them. See [Checkpoint 16](CHECKPOINT_16.md) for locations, safeguards and
the demo-only reconciliation procedure. This addition does not change the CP15
historical validation results recorded below.

Status: **PARTIAL — development implementation; not approved for production.**
No legal retention periods, lawful retention bases, erasure-request service or
support contacts have been approved. The development privacy documents from
Checkpoint 13 are not legal approval. No production Firebase access or deployment
was performed. Existing emulator accounts and clinical records were not deleted;
the tests create only new `cp15-…@example.test` fixtures.

## Architecture and authorization

- `requestOwnAccountDeletion` accepts only a UUID request ID and the literal
  confirmation `delete-account`. The authenticated UID is the sole target.
  Administrator accounts cannot use the patient/doctor operation.
- For a new request, the verified token's **auth_time**, not its refresh/issue time,
  must be within five minutes (30 seconds of future clock tolerance). The UI
  reauthenticates the current email/password account and forces token refresh.
  Passwords are neither written to a database nor logged or persisted locally.
- A Firestore transaction checks the canonical active identity and scheduled care
  commitments, creates `accountDeletionJobs/{uid}`, disables the canonical account,
  replaces its name/email with a minimal tombstone and removes public doctor
  discovery. Existing strict identity schemas remain unchanged. No custom claims
  can override canonical status. The UID and role remain **pseudonymous, not
  anonymous**, for shared-record binding and denial of old access.
- Any scheduled future appointment, active appointment or remaining 15-minute
  consultation grace period blocks a new request. The existing 30-minute duration
  and grace rules are reused. Resolve future bookings through existing cancellation
  actions, finish active care normally, and retry after the access window ends.
  Expired scheduled appointments are retained without fabricating an outcome.
- Existing booking/mutation transactions read canonical identities, so conflicting
  transactions serialize with deletion. A late new booking cannot bypass the
  deletion transaction. Other historical participants keep their existing access.
- `getOwnAccountDeletion` exposes only the caller's safe progress DTO, including
  after canonical disablement while the current Auth token is still usable. It
  cannot read another user's job or any retained data. A replay of an accepted job
  acknowledges that prior intent; it never reactivates the account, changes the
  target or restarts completed phases. A retryable job can be requeued.
- Deletion-job and retention-manifest collections inherit the existing default
  Firestore denial. The archive Storage prefix inherits default denial, including
  for administrator client SDKs. No security rules were weakened or changed for
  this checkpoint. Trusted Admin SDK processing is server/operator controlled.

## Durable state machine and cleanup

`requested → processing → completed`, with `retryable → requested` recovery.
`completed` means **eligible technical cleanup**, never full legal erasure.
Every DTO and durable job retains `legalErasure: retention_pending`.

An internal worker claims a 10-minute transaction lease; progress/error updates
compare the lease token and phase. Another invocation cannot claim a live lease.
Expired leases are recoverable. A worker crash repeats only its persisted phase;
operations are idempotent. Bounded pages/cursors avoid a single unbounded batch.
Errors retain the phase, disable access and schedule exponential retry (up to an
hour between attempts). Active upload capabilities defer processing until expiry
plus a safety minute. No private raw errors are returned to clients.

Order:

1. Disable Auth sign-in and revoke refresh tokens. Already-issued tokens cannot
   bypass canonical status checks in Firestore, Storage or protected callables.
2. Remove notification devices/tokens and personal inbox entries in bounded batches.
3. Remove all avatar objects under the owner prefix, waiting for any pending upload
   slot to expire before reopening a create-only path by deleting its object.
4. Remove personal patient/contact profile, private avatar state and public doctor
   projection/avatar. Remove private phone number from the retained doctor profile.
5. Remove nonfinalized attachment bytes and draft filenames. Keep minimal discarded
   upload tombstones for the existing CP14 sweep to remove late in-flight writes.
   Finalized shared attachment metadata/bytes are preserved.
6. For doctors, archive credential bytes privately **before** deleting the old
   Storage object. Verify owner/path, original generation/checksum when finalized,
   MIME/size, byte-identical archive checksum, and absence of download tokens.
   A durable `accountRetentions/{uid}/objects/{credentialId}` manifest records
   provenance before original deletion. Missing/corrupt required evidence fails
   closed and blocks further cleanup/Auth deletion; it is not silently discarded.
   Expired prepared slots with no object have no bytes to archive. Credential,
   submission and verification audit documents remain unchanged.
7. Delete Firebase Authentication last. A crash after Auth deletion is safe:
   `user-not-found` is idempotent and remaining completion checkpointing continues.
8. Record technical completion, retaining unresolved-retention categories.

The scheduled worker `resumeAccountDeletions` scans due jobs every five minutes.
This schedule is code only until separately deployed/operated; nothing was
deployed here. **Cloud Scheduler does not tick in the local Firebase emulators.**
Use the trusted local operator script below for an already-confirmed synthetic job.
The app does not call a privileged arbitrary-UID endpoint or perform bulk erasure.

## Data inventory and retention matrix

“Retain” below is a conservative **unresolved policy hold**, not a claimed legal
requirement or authorization for indefinite retention. “Existing participant”
means an active canonical account passing existing appointment/consultation
authorization. Deleted accounts lose those permissions even with stale JWTs.

| Category / location | Owner, personal/clinical content and related users | Immediate erasure / possible retention | Access and cleanup; shared-record handling |
|---|---|---|---|
| Firebase Auth UID/email/password credentials/provider metadata/refresh sessions | Account owner; identifiers and authentication secrets | Erase after accepted durable cleanup; operational timing only | Disable/revoke first, delete Auth last. A same-email registration gets a new UID and no old privileges. |
| `users/{uid}` | Owner; name, email, role, verification state | Name/email minimized at acceptance; retain UID/status/schema/provenance | Owner can read only the minimal disabled tombstone. No client writes. Keep disabled UID binding; preserve historical doctor verification value without granting privileges. |
| `patientProfiles/{uid}` | Patient; editable name/contact | Eligible personal profile erased | Existing active-owner rules; remove full personal contact document. No other user's records affected. |
| `patientHealthProfiles/{uid}` | Patient; onboarding medical history, allergies, conditions, medications, DOB/gender | Retain pending legal/clinical decision | Disabled patient cannot read/write; no new doctor access path. Do not treat clinical onboarding as an ordinary contact profile. |
| `doctorProfiles/{uid}` | Doctor; professional name, specialty, registration authority/number, revisions and submission bindings | Erase phone; retain professional verification evidence pending policy | Existing owner/reviewer controls. Disabled owner denied; approved public projection removed. Retained profile not published. |
| `doctorPublicProfiles/{uid}`, `/avatar/current` | Doctor; intentionally public-to-authorized-directory professional projection | Erase immediately / during cleanup | Remove root projection in acceptance transaction; repeat cleanup and remove avatar subdocument. Retained appointments preserve their original doctor display snapshots. |
| `users/{uid}/avatar/state`; Storage `avatars/{uid}/{uploadId}/image.jpg` | Owner; optional personal photo, pending/retired refs | Eligible erasure | Private backend-read images, owner-slot upload rules; delete all prefix objects, then state. Wait pending upload expiry to avoid late recreation. Other avatars unaffected. |
| `doctorCredentials/{id}`; `verificationRequests/{id}`; `verificationAudit/{id}` | Doctor plus authorized reviewers; professional evidence and decision provenance | Retain unresolved; no invented periods | Existing private workflow rules; keep immutable metadata and verification snapshots. Inactive owner cannot upload, submit or regain clinical privileges. |
| Storage `doctorCredentials/{uid}/{id}/document` | Doctor; uploaded private credential evidence; referenced by verification records | Preserve bytes; remove old delivery object after archive integrity confirmation | Existing rules deny inactive owner. Token-free copy at `retainedAccountData/{uid}/credentials/{id}/{sha256}`; private provenance manifest maps the old generation/path. Do not alter verification history. |
| `accountRetentions/{uid}/objects/{credentialId}` and retained Storage prefix | Service-controlled unresolved evidence hold; UID/provenance remains personal | No irreversible destruction until approved retention/disposition decision | Default deny all client access, including admin clients. Trusted backend SDK inspection only. Existing credential viewer does not resolve this archive; an audited authorized retention-review workflow remains future work. |
| `availabilitySlots/{partition}`, `bookingLocks/{id}` | Doctor/patient scheduling revisions and reservations | Retain unresolved scheduling/audit relationships | No longer publicly discoverable/bookable without active approved doctor. Keep locks and partitions to avoid corrupting shared booking history. Do not free or recreate booked slots. |
| `appointments/{id}` | Patient and assigned doctor; timestamps, status, cancellation/outcome and doctor snapshot | Retain shared clinical/scheduling history | Existing active-participant reads and trusted writes. Block deletion during outstanding care; do not rewrite history to remove counterpart identity or falsify outcomes. |
| `consultations/{id}` | Both participants; lifecycle and appointment binding | Retain shared clinical history | Existing active-participant authorization. Deleted actor denied, remaining legitimate actor retains historical access. |
| `/messages/{id}`, `/senderState/{uid}` under consultation | Both participants; clinical chat and dedup/rate-limit metadata | Retain unresolved clinical/audit chain | Backend immutable messages and existing participant rules; no text rewriting or deletion of another participant's conversation. |
| `/calls/{id}`, nested `/descriptions`, `/candidates`, `/iceSenderState`; `/callControl`, `/callReceipts` | Both participants; signaling, network metadata, lifecycle/idempotency records (no recorded media implementation) | Retain unresolved operational/clinical provenance | Existing lifecycle and participant rules; control/state private. No new media-storage assumption. Policy must separately decide signaling retention. |
| `prescriptions/{consultationId}` | Patient and issuing doctor; structured medications and signature provenance | Retain shared immutable clinical record | Existing authorized history service; test confirms active counterpart retrieval after patient deletion. No duplicate issue, rewrite or direct client writes. |
| `consultationAttachments/{id}` plus Storage `consultationAttachments/{cid}/{id}/document` and attachment messages | Sender plus consultation counterpart; potentially sensitive uploaded medical documents | Finalized retain; unfinished bytes/filename erase | Reuse CP14 authorization and token-free backend delivery. Nonfinalized slot minimized to discarded cleanup tombstone; existing sweeper handles late writes. Published bytes/history untouched. Patient sharing remains disabled per CP13/14 policy restrictions. |
| `ratings/{consultationId}`, `doctorRatingSummaries/{uid}` | Patient author, doctor subject; feedback/provenance and aggregate | Retain unresolved review/audit policy | Existing authorization. No directory publication for deleted doctor. Do not claim numeric aggregate alone anonymizes retained reviews/UID links. |
| `patientConsents/{uid}`, `/history/{requestId}` | Patient; versioned acknowledgement and optional sharing decisions | Retain unresolved evidence hold | Immutable history preserved exactly; disabled actor loses current consent RPC access. Acknowledgement is not blanket consent. Deletion does not fabricate withdrawal or overwrite prior choices. |
| `notificationDevices/{tokenHash}`, `notificationInboxes/{uid}/items` and inbox root | Owner; device tokens, event references and read metadata | Eligible erasure | Server-owned cleanup; existing active-identity checks stop further registration/listing. Other participants' inboxes unchanged. Remote push is already disabled by existing implementation. |
| `accountDeletionJobs/{uid}` | Owner; request UUID, UID/role, state, cursor, lease, phase, dates, generic error code | Minimal retained lifecycle/audit record; retention unresolved | Private Firestore; safe own-status callable only. No password/email/name/clinical contents in job. Technical completion is not full erasure. |
| Legacy `chatbotInteractions` reference / unknown legacy uploads | Potential prior personal queries; no current exported persistent writer observed | Unresolved schema/retention; do not guess or bulk-delete unknown data | Default rules denial; active assistant currently local component state. Inventory of any real legacy dataset is a production release blocker. |
| Device Auth persistence / component state / private attachment cache | Device owner; session credentials and temporary downloaded/selected documents | Sign-out clears Firebase session; existing account-bound teardown clears UI and CP14 files | Deletion-safe logout bypasses the now-unauthorized notification-revoke RPC, clears local device registration and signs out. CP14 startup/background/dispose cleanup remains. No assertion of remote deletion of other devices' offline caches or previously exported copies. |
| Runtime logs, emulator debug logs/exports, backups, monitoring and platform Auth audit | Operator-controlled; may include identifiers and operational metadata | Retention/disposition unresolved, outside app-record cleanup | No raw password/clinical logging added. No backups/logs/whole emulator resets erased. Operator policy, inventory and storage-access review required before production. |

## User experience and recovery

Patient Profile, Doctor Profile and the pending-doctor verification screen expose
the same themed deletion sheet. Disabled-account recovery exposes own job status.
The sheet explains retained categories before the password and final destructive
confirmation; it never asks for a UID. It supports scrolling, safe areas, keyboard
avoidance and light/dark semantic colors. It shows pending, retryable and technical
completion states, manual refresh, retry and local sign-out. Duplicate submissions
are locked locally and idempotent on the server. A lost response is recovered by
reading the caller's durable job before attempting any new intent.

An accepted operation continues without the device. Once Auth is deleted or a
revoked token is rejected, the status callable may no longer be reachable. The UI
does not interpret that network/auth failure as cancellation or promise rollback.
The request UUID is available to copy while signed in; an administrator can inspect
the private job. There is **no configured assistance/erasure-request service**;
the information action says so and does not invent contacts. A functioning,
authenticated assistance/review channel is a production blocker.

## Local operation and verification

From the repository root, build Functions, then execute the following only for a
dedicated synthetic account whose deletion was already explicitly confirmed:

```powershell
node functions/node_modules/typescript/bin/tsc -p functions/tsconfig.json
$env:GCLOUD_PROJECT='demo-calladoc'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
$env:FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9199'
node functions/scripts/resumeAccountDeletion.cjs <synthetic-uid>
```

The script refuses absent/mismatched emulator variables and a UID without an
accepted job. It cannot create a request, approve a doctor or edit care records.
For bounded-page jobs run again; for upload-expiry waits, wait for the recorded
deadline. For retryable errors inspect the private job with trusted tools, repair
the underlying operational cause, then retry the recorded phase. Never alter the
canonical account back to active. Do not use established checkpoint test accounts.

Automated evidence (2026-11-03, local only):

- Mobile TypeScript `--noEmit` and Functions TypeScript build passed.
- Backend focused Jest: **292 passed / 8 suites** (deletion policy/export surface,
  authorization, booking, consultation eligibility, prescriptions, consent,
  attachment validation).
- Mobile focused Jest: **116 passed / 10 suites** across the final targeted runs
  (deletion service/UI, doctor/patient profile integration, auth service/navigation,
  registration, consent and attachment regressions). Initial AuthContext restoration
  checks also passed; not added to this final-run count.
- Firestore security rules: **108 passed / 3 suites**, isolated
  `demo-calladoc-rules` on port 8085. Existing identity, consultation history and
  message schema/authorization tests. No reset of the main demo project.
- Storage security: **68 passed / 2 suites**, isolated
  `demo-calladoc-credentials` on ports 8095/9195. Existing avatar and credential
  ownership/disabled-identity/metadata/listing tests.
- CP15 live emulator integration: **8 distinct cases passed** across the initial
  and focused corrective runs, including both roles, arbitrary-target/admin/anon
  denial, actual callable auth-time enforcement, care blockers, concurrent
  requests/workers, session revocation, stale-token rules denial, private file/token
  cleanup, finalized attachment preservation, consent/audit preservation,
  counterpart prescription/history access, failed phase/retry/expired lease,
  approved-doctor private evidence archive and same-email new-UID isolation.
  Malformed synthetic room/prescription fixtures in the first runs were corrected;
  their affected test passed on rerun. No production security weakening was needed.
  **Latest targeted retry rerun did not pass:** after adding the replay/requeue
  assertion, one run passed that assertion but hit `ECONNRESET` creating the
  synthetic Storage fixture; the next run failed at Auth account creation
  (`auth/network-request-failed`). Auth 9099, Functions 5001 and Storage 9199 then
  returned `ECONNREFUSED`, while Firestore 8080 remained available. Thus the eight
  earlier distinct successes are not a claim that the latest integration run was
  green. No emulator reset/restart or data recovery was attempted. Restore the
  operator's existing emulator setup without dropping/import-overwriting data,
  rebuild Functions and rerun the affected check from `functions/`:

  ```powershell
  $env:CHECKPOINT15_EMULATOR='demo-calladoc'
  # Also set the four explicit local variables shown in Local operation above.
  node node_modules/jest/bin/jest.js --config jest.deletion-emulator.config.js --runInBand -t 'partial failure'
  ```

- `git diff --check`: passed; additional untracked CP15 whitespace check passed.

Pixel 7 native verification is **pending**: Metro status at `127.0.0.1:8081`
returned `ECONNREFUSED`. No Expo/Metro/Android configuration was changed. Samsung
is intentionally disconnected and is not required. No Android rebuild is needed.
When Metro is available, reload the existing development client, use new synthetic
patient/doctor accounts, open Profile → Delete account, inspect both themes and
keyboard, cancel confirmation, then confirm only the dedicated disposable account.
Check progress/retry/sign-out and authoritative server records using the local
operator command. Verify existing shared history as the other active participant.
Do not delete established test accounts to obtain screenshots.

## Remaining production gates and limits

1. Legal/clinical approval of each retained category, lawful basis, retention
   deadline, restriction/review procedure, verified erasure assistance channel and
   authoritative policy documents. Until then, irreversible clinical/evidence
   destruction is deliberately absent. The archive format/provenance and access
   process also require approval; it is not an existing admin-viewer feature.
2. Existing credential uploads may have Firebase bearer download tokens. Canonical
   rules stop SDK access immediately, but a previously copied bearer URL is not
   revoked by rules. The worker's verified token-free archival then deletion of
   the original object removes that old delivery capability. This is eventual,
   not instantaneous: schedule/backlog, upload-expiry waits or failures can delay
   it. No claim of immediate revocation of previously exported copies is made.
   Production needs an audited token-free credential delivery design/legacy
   remediation and operational monitoring; no existing credential security was
   weakened here.
3. Operated Scheduler/IAM, alerts for retries/stuck leases, archive/log/backup
   governance, bounded job throughput and production failure/load verification.
   Local operator execution is explicit because Scheduler is not emulated.
4. Unknown historical collections/orphaned uploads must be inventoried before a
   production erasure claim. This worker deliberately does not delete arbitrary
   prefixes/unknown schemas. Shared retained files have provenance; no new duplicate
   avatar system or public image/document URLs were added.
5. Pixel 7 interaction and device-resident cache/sign-out verification remain
   untested for this checkpoint. Already-distributed messages/files and third-party
   copies cannot be remotely erased by this workflow.
6. Restore the local Auth/Functions/Storage processes and complete the final
   targeted retry rerun; their late unavailability is an additional verification
   limitation. Preserve existing emulator records/imports when restoring them.

## Files belonging to this checkpoint

New: `shared/types/accountDeletion.d.ts`; `functions/src/accounts/{deletionPolicy,
deletionCallables,deletionWorker}.ts`; `functions/scripts/resumeAccountDeletion.cjs`;
`functions/__tests__/deletionPolicy.test.ts`; `functions/emulator-checks/deletion.test.ts`;
`functions/jest.deletion-emulator.config.js`; `mobile/src/services/accountDeletion.ts`;
`mobile/src/components/AccountDeletion.tsx`; `mobile/__tests__/accountDeletion{UI,
Service}.test.js`; this document.

Small integrations: `functions/src/index.ts`, export-surface test and scheduling
integration export-name list; mobile auth/notification services, PatientExperience,
DoctorWorkspace, SubmitVerificationScreen, AccountStatusScreen and auth-service
test. All unrelated pre-existing working-tree changes are preserved. No dependencies,
Firebase configuration, security rules, native configuration or production data
were changed for CP15. No staging, commits, pushes or deployment.
