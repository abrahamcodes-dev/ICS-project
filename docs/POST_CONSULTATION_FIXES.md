# Post-consultation fixes — 17 November 2026

## Verified baseline and scope

The owner confirmed hosted bidirectional messaging, consultation document sharing/private viewing, prescription issuance/retrieval and completion after the scheduled end. Booking, simulated payment, notifications and normal doctor approval were already confirmed. These are owner-observed hosted results, not results of the local tests below.

The local implementation was committed before release approval. The owner subsequently approved a controlled Rules-only release, replacement APK and in-place installation; pushing remains unapproved. The existing issued prescription and authored clinical content are unchanged. **Consent correction:** the actual hosted preference is **granted, revision 5**, recorded through the profile on 17 November 2026 at 09:09:41 EAT. Its hash matches the earlier preservation baseline; earlier descriptions of the current state as declined were incorrect. The owner explicitly approved preserving revision 5 without modification. No consent is inferred from entering a consultation.

## A. Message history and feedback

The history request is the direct Firestore query `consultations/{appointmentId}/messages`, ordered by `createdAt` and document ID descending, with bounded pages of 30 (maximum 50). Sending uses the separate protected `sendConsultationMessage` callable. A successful send acknowledgement does not establish that a subsequent history listener synchronized.

The published Rules baseline was compared with the generated academic source. Isolated academic-admission tests reproduced Firestore's explicit **maximum of 1000 expressions** failure for patient and doctor history. This demonstrates a Rules defect; it does not prove every intermittent owner-observed error had the same cause. The available Android buffer did not contain a contemporaneous CallADoc SDK failure. No evidence established a missing index or a failed send.

The local Rules optimization retains strict identity/admission, participant binding, complete appointment/room schema validation, terminal audit binding, timestamps, bounded queries, private sender state and denied client writes. Required-field checks are retained through direct field access or exact map equality; missing fields fail closed. Tests also cover closed/completed history, malformed identities and unrelated/revoked access.

The mobile view now classifies access, Rules budget, index, quota, connectivity and malformed-data failures independently. A confirmed send uses neutral live-region feedback. A history failure is shown separately and does not invite a duplicate send. Retry recovery clears old history errors. Uncertain sends retain the existing stable request ID and unchanged retry behavior.

The synchronous session-cache reset is no longer presented as a synchronized empty history. Loading remains visible until the SDK listener supplies its first page or failure.

**Additional limitation:** a direct single-message `get` for completed consultations exceeded the hosted expression budget during the additional investigation. The current app reads messages through bounded list queries; attachments use the existing protected viewer service. Per-document validation was preserved, rather than relaxed. A named academic test TODO tracks completed direct-get coverage; it is **not a pass**. Active direct reads are separately covered by positive and negative server-read tests.

### Focused direct-read assessment and deferral decision

1. **Reachability:** `mobile/src/services/consultationService.ts` is the sole mobile data source for the message collection. Latest history uses a bounded `onSnapshot(query(...))`; pagination uses `getDocs(query(...))`. `ConsultationChat` and `ConsultationDocuments` consume that session. Neither uses a single-message `getDoc`. Native call signaling reads `calls/.../descriptions`, a different Rules path. Attachment viewing calls `getConsultationAttachment`; its message lookup uses the server Admin SDK behind independent admission and consultation authorization, not client Firestore Rules.
2. **Security:** expression exhaustion rejects the request. It creates an availability limitation for that operation, not an authorization grant or a consent bypass. The existing complete parent/message validation and denied client writes stay in place. Already downloaded client data cannot be retroactively erased by Rules; tests of current server authorization therefore explicitly use `getDocFromServer` and expiry well before the test request, checking both existing and fresh contexts.
3. **Minimal optimization attempted:** sharing one room snapshot between parent authorization and message validation retained every predicate, but valid completed direct reads still failed with the explicit 1,000-expression error. That experiment was reverted. The retained Rules match the previously verified 305-test source; no new Rules relaxation or speculative restructuring is included.
4. **Deferral impact:** no required current CallADoc patient/doctor workflow is incomplete because of this unused direct-get operation. Completed history remains available through the tested bounded query, and protected document viewing remains through the existing callable. Revisit the TODO before adding any message-ID deep link, direct-message lookup or other feature that requires a completed single-message client read. Do not replace validation with broader participant-only access simply to satisfy the budget.

New security cases cover patient/doctor active text and attachment reads, guests, unverified users, admitted nonparticipants and admitted administrators, corrupt sender/attachment bindings, expiry with an existing and fresh client, and revocation. They use isolated synthetic fixtures only. An initial near-boundary expiry check used default `getDoc`, which is unsuitable as proof of a fresh server denial; final tests force server reads with an unambiguous expired timestamp. No hosted account, consent or membership was changed.

## B. Consultation Options and clinical boundaries

- **Patient summary:** reuses `getProfileAvatar`'s existing appointment-bound read through `createAvatarSession.readAppointmentPatient`. Only the authorized patient's display name and avatar are returned. The backend independently requires the assigned, currently approved doctor and valid appointment/approval source. No patient-profile, medical-history or consent document is requested by this view.
- **Documents:** bounded existing consultation history plus the existing protected attachment viewer. Only finalized, consultation-bound doctor attachment messages are displayed. Earlier pages can be loaded; the empty state refers only to loaded messages. No Storage listing or optional patient-record read is introduced.
- **Consent:** medical history and optional records remain explicitly restricted. The feature gate disables that access for every preference, including the patient's actual granted revision 5. A grant records a preference within `medical-records-for-treatment`; it does not activate an unimplemented medical-record reader or authorize unrelated doctors. The new summary reads only appointment-bound name/avatar, and the document view lists existing consultation attachments. Prescriptions and consultation attachments retain their separate participant authorization. The UI does not falsely label the stored preference as declined or disclose the private consent document to the doctor.
- **Prescriptions:** active issuance remains intentionally unavailable. The server requires a recorded completed appointment and one immutable record per consultation, not merely elapsed time. No new active-draft persistence is introduced; safely retaining a draft across navigation/session changes is separate work. The completed-only option explains this restriction.
- **Completion:** the scheduled-end-time check, explicit confirmation, idempotent completion and authoritative closed-room verification remain unchanged.

Private view state and attachment selections are cleared on identity changes; reads and viewers are disposed on exit. They do not grant authorization themselves.

## C. Presentation

Patient-facing prescriptions use the validated verified professional-name snapshot from the participant-authorized appointment, matched to the prescription's doctor UID. Missing/mismatched display metadata produces a neutral unavailable-name label, never a guessed name. Internal prescription IDs and immutable audit fields are preserved.

The hosted academic-demo environment displays a bilingual synthetic/non-valid-prescription warning, including existing issued records. This is a display annotation only, not an alteration of stored prescription text. Medication fields, messages, filenames and documents remain in their original language.

The doctor navigation title is localized **Consultation**, replacing `ConsultationRoom`. The call heading uses the same label with grouped participant status and consistent spacing. New summary/document panels scroll within safe areas with accessible controls. Existing status-bar handling is preserved.

## Acceptance and limitations

No new hosted/device pass is claimed. After approval, deploy the reviewed Rules alone with a saved prior ruleset, then repeat bounded participant history and negative access checks. A separately approved replacement APK is required for the mobile changes. Preserve the currently installed APK and rollback artifact; update in place without clearing data.

Device checks still needed: doctor history refresh in completed consultation; neutral successful-send feedback during a newly authorized future consultation; both option panels and attachment pagination/viewer; patient prescription professional name/synthetic warning; English/Kiswahili expansion, TalkBack, Android header/safe area. Do not create duplicate records in the existing completed appointment to test sending. Kiswahili medical and legal wording still requires owner/native-speaker review.

Approved commit boundaries: (1) Rules expression-budget correction and academic security regression tests; (2) consultation feedback/options/prescription presentation, validated appointment display contract, bilingual keys and mobile tests; (3) evidence/documentation. Keep unrelated consultation-service tests and prior APK acceptance notes separate.

## Verification evidence

Intended changed files (20; unrelated pre-existing edits excluded):

| Purpose | Files |
| --- | --- |
| Rules and hosted security regression | `functions/firestore.rules`, `functions/__tests__/academic-emulator/admission.test.ts` |
| Consultation feedback and read-only options | `mobile/src/services/consultationFeedback.ts`, `mobile/src/screens/shared/ConsultationChat.tsx`, `mobile/src/screens/doctor/ConsultationOptions.tsx`, `mobile/src/screens/doctor/ConsultationInformation.tsx` |
| Prescription/name/layout/localization | `mobile/src/services/appointmentReads.ts`, `mobile/src/components/AppointmentPatient.tsx`, `mobile/src/screens/shared/PrescriptionWorkspace.tsx`, `mobile/src/screens/shared/ConsultationCallScreen.tsx`, `mobile/src/navigation/DoctorNavigator.tsx`, `mobile/src/i18n/messages.ts` |
| Focused mobile regression | `mobile/__tests__/consultationFeedback.test.js`, `mobile/__tests__/consultationChat.test.js`, `mobile/__tests__/consultationInformation.test.js`, `mobile/__tests__/consultationOptions.test.js`, `mobile/__tests__/prescriptionUI.test.js`, `mobile/__tests__/appointmentReads.test.js`, `mobile/__tests__/appointmentPatients.test.js` |
| Evidence | `docs/POST_CONSULTATION_FIXES.md` |

Node **22.23.3**, existing locked dependencies and Java 25 emulator runtime were used. Checks ran in disposable TEMP source copies, without private environments. Domain Rules used `demo-calladoc-rules` / Firestore 8085; academic checks used `demo-calladoc-academic-tests` / Auth 9111, Firestore 8111, Storage 9211. These differ from the preserved interactive project and ports. No full application regression suite was repeated.

| Check | Final distinct results |
| --- | --- |
| Mobile focused Jest | 9 suites, 87 tests passed |
| Existing avatar/prescription authorization policy Jest | 2 suites, 70 tests passed |
| Affected domain Firestore Rules | 7 suites, 305 tests passed after the dependent rerun |
| Hosted academic admission emulator suite | 1 suite, 45 passed, 1 explicit completed-direct-read TODO, no skipped tests |
| Mobile TypeScript | `tsc --noEmit` passed |
| Localization audit | 988 matching catalogue keys, 61 TSX files, zero static JSX findings |
| Git whitespace | `git diff --check` passed |

Counts exclude successful reruns and preliminary/aborted executions. The initial expression-budget reproductions failed as expected. The expanded checks found the completed-history limit too. An interim tuple-based participant predicate failed 12 appointment-query tests because Rules could not infer the unconstrained counterpart field; it was replaced by a canonical-role conditional, retaining all tests. All 128 appointment/consultation/message tests then passed. The other four affected Rules suites retained their successful results because that final predicate is not used by their authorization paths. An initial avatar test invocation lacked the required academic local-environment guard variables; after correcting only the test process environment, all 47 avatar tests passed. No assertions, admission checks or clinical issuance restrictions were weakened.

The follow-up adds two direct-read security cases to the acknowledged 505-pass baseline: **507 distinct passed, one TODO, across 19 suites**. The complete affected academic suite was freshly run: 45 passed, zero failed/skipped, one TODO. The initial minimal-optimization probe had three failures/one pass (completed positive reads still exceeded the budget and a near-boundary/default-cache expiry assertion was unsuitable). It is excluded from final pass counts. Final forced-server expiry/revocation checks deny both existing and fresh clients; an admitted administrator is also denied clinical messages. Since the attempted Rules change was reverted and mobile source did not change, unchanged successful domain/backend/mobile suites were not repeated for this follow-up.

Reproduce from a dependency-equipped disposable source copy (use `scripts/Sync-AcademicChecks.cjs` first; do not execute emulator suites against the interactive project):

```powershell
# $Node22 is the installed Node 22.23.3 executable; $checks is the disposable copy.
& $Node22 scripts/Sync-AcademicChecks.cjs $checks
Push-Location "$checks/mobile"
& $Node22 node_modules/typescript/bin/tsc --noEmit
& $Node22 node_modules/jest/bin/jest.js --runInBand --testTimeout=30000 --runTestsByPath __tests__/consultationFeedback.test.js __tests__/consultationChat.test.js __tests__/consultationInformation.test.js __tests__/consultationOptions.test.js __tests__/prescriptionUI.test.js __tests__/appointmentReads.test.js __tests__/appointmentPatients.test.js __tests__/callUI.test.js __tests__/localization.test.js
Pop-Location
Push-Location $checks
& $Node22 functions/scripts/academicEmulatorGate.cjs
Pop-Location
Push-Location "$checks/functions"
# Start with process-only cloud/environment overrides cleared, Java 25 on PATH,
# Node 22 first on PATH, and no interactive emulator overrides inherited.
& $Node22 node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only firestore --project demo-calladoc-rules --config firebase.rules-test.json 'node node_modules/jest/bin/jest.js --config jest.rules.config.js --runInBand --runTestsByPath __tests__/rules/appointmentReads.rules.test.ts __tests__/rules/consultations.rules.test.ts __tests__/rules/consultationMessages.rules.test.ts __tests__/rules/consultationCalls.rules.test.ts __tests__/rules/doctorProfiles.rules.test.ts __tests__/rules/credentials.rules.test.ts __tests__/rules/verification.rules.test.ts'
Pop-Location
```

The two existing backend policy suites were run with `GCLOUD_PROJECT=demo-calladoc-academic-tests`, `FUNCTIONS_EMULATOR=true`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8111`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9111` in the test process only:
`node node_modules/jest/bin/jest.js --runInBand --runTestsByPath __tests__/avatars.test.ts __tests__/prescriptions.test.ts` (from disposable `functions`). No environment files were edited.

Read-only hosted before/after hashes matched for the appointment, consultation, simulated payment, issued prescription, consent and all five messages. Original interactive emulator processes retained their 14 November start times. Accounts, objects, snapshots, APKs, native configuration and deployments were not changed. Subsequent local commits include only the 20 intended files above; unrelated consultation-service test edits and earlier APK acceptance notes remain separate. No commits are pushed in this checkpoint.

Final consistency check: 403 implementation/test/contract files matched the verified disposable copy; the domain Rules source also matched the final dependent Rules-test copy exactly. Documentation-only evidence updates followed those checks.

## Local commits and next approval gates

- `48976d1` — `fix(firestore): keep consultation history within Rules budget` (Rules and security tests).
- `d429438` — `fix(consultations): add consent-safe views and clearer feedback` (17 mobile implementation/test files matching the tested source).
- The documentation/evidence commit contains this file alone. Its hash is reported after creation rather than embedded in its own contents.

Staged inventories, sensitive-content exclusions and `git diff --cached --check` are reviewed before each commit. The two unrelated working-tree files are neither staged nor committed. Commits remain local.

Separate owner approval is required for the following actions; none is performed here:

1. **Rules-only deployment:** save the currently published ruleset ID/source/hash as a rollback artifact. Prepare and inventory-verify a clean release with the existing Node 22 tooling and approved private release settings, explicitly for `calladoc-academic-demo`. From that verified release directory run the existing Firebase CLI with `deploy --only firestore:rules --project calladoc-academic-demo --config firebase.json`, retaining its predeploy guard. This publishes only generated Firestore Rules derived from `functions/firestore.rules`; do not deploy indexes, Storage Rules, Functions or Hosting. Compare the published source/hash and repeat participant and negative-access checks using existing accounts and read-only requests.
2. **Replacement APK build:** use a fresh disposable hosted Android build copy, Node 22.23.3, Java 17, existing dependencies/signing certificate, `CALLADOC_APP_VARIANT=academic-demo`, emulator mode false and the approved academic project configuration. Reuse the established Expo prebuild procedure (`--platform android --no-install`) without changing the original native tree. Run `gradlew.bat assembleRelease -PreactNativeArchitectures=x86_64,arm64-v8a --max-workers=2 --console=plain`. Keep package `com.calladoc.app.demo`; preserve the previous immutable APK, record the new checksum/version/certificate and validate its embedded project settings.
3. **Installation/device acceptance:** after build review and explicit installation approval, use `adb -s emulator-5554 install -r <verified-apk>` as an in-place update. Never uninstall, clear storage or alter the application ID. Check the consent-safe summary/documents, completed history, professional name and synthetic prescription warning, bilingual layouts and safe areas. Sending feedback requires a separately approved future consultation; do not create duplicate records in the completed appointment.

No push is authorized. No new backend services, paid infrastructure, dependency changes or hosted-record edits are required by this plan. The unused completed direct-read TODO does not block these current list-based workflows, but it must not be represented as fixed or accepted for a future direct-message feature.

## Final checkpoint evidence — 17 November 2026

The earlier approval gates above describe historical preparation. The approved release and subsequent mobile-only history update are now installed. **Patient and Doctor completed-history device acceptance PASSED; hosted authorization 28/28 PASSED. All nine tracked record hashes and five message hashes unchanged; granted consent revision 5 preserved.** Doctor Kiswahili device checks, fresh direct-SDK negative checks and active-appointment device testing remain **PENDING, not failed**. See [final release evidence](POST_CONSULTATION_RELEASE.md) and [history implementation evidence](CONSULTATION_HISTORY_ENTRY.md). No further deployment, rebuild, hosted-record change, staging, commit or push is performed by this documentation update. The Doctor session, both rollback APKs and unrelated edits remain untouched.
