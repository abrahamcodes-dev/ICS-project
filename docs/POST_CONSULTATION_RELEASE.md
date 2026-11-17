# Controlled post-consultation release — 17 November 2026

Final checkpoint: **Patient and Doctor completed-history device acceptance PASSED; hosted authorization 28/28 PASSED. All nine tracked record hashes and five message hashes unchanged; granted consent revision 5 preserved.** Doctor Kiswahili device checks, fresh direct-SDK negative checks and active-appointment device testing are **PENDING, not failed**. Earlier stages below are historical; the navigation blocker was resolved by the separately approved mobile-only history update documented in the final section.

## Approved consent and access scope

Preserve hosted patient consent **granted, revision 5**, source `profile`, recorded at **09:09:41 EAT on 17 November 2026**. The owner explicitly confirmed this state. It matches the earlier preservation hash; the release did not change consent. Earlier summaries describing the current decision as declined were incorrect. Historical registration revision 1 was declined and is not the present state.

The implemented optional medical-record reader remains disabled for every consent preference. Granted consent within `medical-records-for-treatment` does not activate that feature or authorize unrelated access. The new doctor summary requests only appointment-bound patient name/avatar; consultation document viewing uses existing participant-authorized attachments. It does not expose private patient profiles, medical history or consent documents. Existing prescriptions retain their separate participant authorization. No access policy was widened.

## Phase 1 — Rules

- Explicit project: `calladoc-academic-demo`.
- Reviewed Rules source: commit `48976d1`; subsequent source state `11d379e` includes the approved mobile/docs checkpoint. Working Rules matched the reviewed commit.
- A fresh clean release passed the existing inventory/predeploy guards with Node 22.23.3. Deployed with `--only firestore:rules --project calladoc-academic-demo --config firebase.json --non-interactive` from the verified release directory.
- Published ruleset: `projects/calladoc-academic-demo/rulesets/82ab8124-ff18-42cc-895b-cbf3b317923e`.
- Published SHA-256: `9617a47cc271fb7f870eaf542ca721d77afe47e6cb77eb9b8597d1b137e0c05c`.
- Published source matched the tested generated academic Rules. Only Firestore Rules were deployed; no Functions, Storage Rules, indexes or Hosting deployment.
- Rollback source/ruleset metadata: `%USERPROFILE%/CallADoc-checkpoints/post-consultation-3M0UUU/firestore-rollback.rules` and adjacent JSON. Prior ruleset `2491e6ab-e4c6-4b34-a37f-b2bb23c58122`, SHA-256 `959696400c5a2901bf58e49045aa6e1b998e45c6a2552100bc0c2bb3dfc90fcd`. The backup source is read-only.
- Nine targeted record hashes and all five message hashes matched after deployment, including the completed appointment, simulated payment, issued prescription, identities, doctor profiles and consent revision 5.
- Unauthenticated bounded consultation-history request: HTTP 403 (denied).
- Patient authenticated positive/negative checks: **13/13 passed**, receipt independently read and confirmed at 17:52:16 EAT. Bounded history returned all five messages; granted consent revision 5, existing prescription and protected attachment reads passed. Unauthorized, private-profile and invalid-page accesses were denied.
- Doctor authenticated checks: **15/15 passed**, separate receipt independently read and confirmed at 17:57:58 EAT. Completed appointment/room and all five messages were readable; appointment-bound summary returned only its three permitted fields. Optional patient profile, medical history and private consent reads were denied even with the granted preference. Existing prescription and protected attachment reads passed. A localhost form kept passwords/tokens in browser memory and sent only whitelisted non-secret result receipts to its local server. Existing accounts only; no clinical/consent writes.
- Preservation recheck at 17:54:55 EAT: all nine record hashes and five message hashes unchanged; granted consent revision 5 retained.

The unused completed single-message direct-read budget TODO remains documented. Current app history is query-based; no scope expansion was introduced to remove that TODO.

## Phase 2 — standalone APK verified

- Artifact: `%USERPROFILE%/CallADoc-checkpoints/post-consultation-3M0UUU/CallADoc-Demo-0.1.0-post-consultation.apk` (read-only).
- SHA-256: `232a749a0e7c39fe06ff7d7e71f1053e8d289cec8cf376d3344318306881ce37`.
- Size: 90,176,540 bytes. Package `com.calladoc.app.demo`, label CallADoc Demo, version 0.1.0 (1), release/non-debuggable, embedded Hermes bundle, arm64-v8a and x86_64.
- Existing signing certificate unchanged: SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`; both old and new APKs verified with apksigner. No signing-key migration.
- Fresh disposable source/native workspace, Node 22.23.3, Java 17, same locked dependencies and existing signing key. Expo prebuild used the academic-demo variant and `--no-install`. Only the disposable package main used the documented equivalent Expo bootstrap to avoid dependency-junction AppEntry resolution.
- `gradlew.bat assembleRelease '-PreactNativeArchitectures=x86_64,arm64-v8a' --max-workers=2 --console=plain`: **BUILD SUCCESSFUL in 30m 20s**, 887 actionable tasks. No dependency declarations changed.
- All 107 bundled application source-map contents matched the verified source. Embedded hosted project/mode, ABIs and absence of unexpected private files passed verification. All 37 original native source/configuration files and both unrelated edits retained their hashes.
- Verification-tool issues were corrected before installation: a transposed copied fingerprint literal and Metro's `/src/` source-map prefix. Actual APK signing was unchanged and matched the immutable rollback throughout; no assertion was relaxed, application source changed or second APK build required.

Previous working APK remains `%USERPROFILE%/CallADoc-checkpoints/checkpoint-1/CallADoc-Demo-0.1.0-checkpoint1-localisation-r2.apk`; SHA-256 reverified as `c1ef9118ed1895336d268e6f9b869cf1177b09b235a2a7faf11f3976e6f0dd3b`, 90,164,168 bytes. It is not overwritten.

## Phase 3 — in-place update and partial device acceptance

Pixel 7 (`emulator-5554`) installation used only `adb install -r`. Package UID **10210** and first-install timestamp **16 November 2026 18:31:48** were preserved. Last-update timestamp became **17 November 2026 18:41:43**. The installed public APK hash matched the new artifact exactly. Activity launch returned `Status: ok`. No uninstall, data clearing or emulator reset occurred.

Observed on the updated device:

- Existing patient session survived installation and a subsequent normal force-stop/cold launch without reauthentication.
- The existing Dr Demo Doctor appointment is visible as Completed in Appointment History.
- The existing immutable prescription opens through Home → My prescriptions → View consultation prescription. It displays **Dr Demo Doctor**, not the raw audit UID.
- English and Kiswahili synthetic/non-valid-prescription warnings render. Language switching updates the mounted view; Kiswahili survives a cold restart. English was restored afterward.
- Authored medication content remains in its original wording. Patient prescription/header safe-area layout was visually inspected; this is not a claim about every Doctor/consultation screen.
- Post-update checks preserved all nine record hashes and all five messages, including granted consent revision 5. The existing finalized attachment's physical Storage generation, size (34,142 bytes) and SHA-256 matched its slot; it has no public download token.
- Original interactive Firebase processes retained their 14 November start times. Original native configuration, local app, unrelated edits and rollback APK remain unchanged. No Functions were deployed, new clinical records created or Git commits pushed.

### Historical device acceptance blocker: completed-history navigation (resolved)

Expanding the completed appointment shows **This appointment is completed** and a disabled **Open consultation** action. This is the pre-existing client status gate in `mobile/src/services/appointmentReads.ts` (`consultationUnavailable` rejects non-scheduled statuses), reused by `mobile/src/screens/shared/SchedulingAppointments.tsx` to disable entry. It is distinct from Firestore permission failures and from the unused direct-single-message TODO. The hosted bounded history query already passed for both roles and returned all five messages.

No disabled control was bypassed and no appointment state was changed. Consequently, refreshed message history, consultation attachment viewing, localized consultation title and Doctor summary/document panels are **not device-accepted through this completed appointment**. Doctor-panel acceptance also needs normal Doctor sign-in. Failed-send/retry recovery was not forced because that would require a separate approved scenario; no messages or network settings were changed.

At this earlier release stage, a separate mobile-only read-only history entry required approval. That approval, implementation, local verification and in-place replacement update are now complete. Active call/send/completion eligibility and backend authorization remain unchanged; no additional Rules or Functions deployment was needed. See the final accepted checkpoint below.

Detailed non-secret release metadata, signatures, checksums and sanitized screenshots are retained beside the APK in `release-result.json`, `device-acceptance.json`, `apk-verification.json`, `installation-verification.json` and preservation receipts. Full device acceptance is not claimed.

Documentation corrections are local working-tree edits. Existing unrelated APK acceptance notes and consultation-service test edits remain preserved.

## Final completed-history acceptance — 17 November 2026

**Patient completed-history device acceptance: PASSED. Doctor completed-history device acceptance: PASSED (all eight recorded checks).**

| Read-only device check | Patient | Doctor |
| --- | --- | --- |
| Existing completed appointment opens through View consultation history | PASSED | PASSED |
| All five existing messages match hosted records | PASSED | PASSED |
| History reload and bounded pagination without previous error | PASSED | PASSED |
| Existing private attachment renders | PASSED | PASSED |
| No sending, uploading, calling, prescribing or completion controls in history | PASSED | PASSED |

The Doctor's authorized summary displayed appointment-linked patient name/avatar and appointment details only. Selecting Patient information showed “Patient medical information is not available through this appointment.” No optional patient medical history was exposed. This records the device UI restriction, not a fresh direct-SDK negative-access probe. The separate Consultation Options summary panel was not exercised through the completed-history route, which deliberately excludes clinical options.

The patient's existing session survived installation and cold restart. The existing prescription remained accessible with the professional doctor name. Patient English/Kiswahili history labels, navigation and header layout were visually checked; language preference persisted across restart. Authored clinical content was preserved. The Doctor remains signed in, in English; no account settings were changed during Doctor verification.

Hosted authorization checks: **28/28 PASSED** (Patient 13/13, Doctor 15/15), using the previously confirmed separate receipts. They are distinct from the new device checks and were not repeated. Final read-only preservation verification at **21:08:56 EAT on 17 November 2026** confirmed all **nine tracked record hashes and five message hashes unchanged**, including **granted consent revision 5**. The appointment, simulated payment, prescription, attachment and accounts were preserved; no new clinical records were created.

**PENDING, not failed:** Doctor Kiswahili device checks; fresh direct-SDK negative authorization checks; active-appointment device testing. Active-path behaviour retains focused local automated coverage, but no new hosted appointment was created. Broad accessibility/layout acceptance and full bilingual acceptance are not claimed. The unused direct-single-message Rules expression-budget TODO remains unchanged; history uses bounded queries.

### Installed artifact and preservation

- APK: `%USERPROFILE%/CallADoc-checkpoints/consultation-history-cTnm3u/CallADoc-Demo-0.1.0-consultation-history.apk`.
- SHA-256: `a3b0536a1341bd23a0f9fc1713596d515072dea74229e572e6f5fbf5ea185715`.
- Package: `com.calladoc.app.demo`; version **0.1.0 (1)**; standalone release; hosted academic-demo configuration and all **109 bundled application sources** verified.
- Existing signing certificate SHA-256: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
- Build: **SUCCESSFUL in 2m 32s**, 887 tasks (18 executed, 869 up-to-date), using Node 22.23.3, Java 17, existing dependencies and disposable native workspace.
- In-place installation: `adb install -r`; UID **10210** and first-install time **16 November 2026 18:31:48** preserved. Last update: **17 November 2026 20:27:36 EAT**. Installed APK bytes matched the approved hash. No uninstall, data clearing or emulator reset.
- The supplemental validator initially included generated `.cxx` outputs as immutable native inputs. Installation stopped before updating the app. With owner approval, those disposable outputs were classified separately, retaining checks on all **551 original working-tree files, 37 original native files and 37 immutable disposable native inputs**. Four generated outputs changed; **zero unauthorized source/native changes**. The same APK was reused without rebuilding.
- Both immutable rollback APKs remain preserved: post-consultation SHA-256 `232a749a0e7c39fe06ff7d7e71f1053e8d289cec8cf376d3344318306881ce37`; checkpoint-1 localisation r2 SHA-256 `c1ef9118ed1895336d268e6f9b869cf1177b09b235a2a7faf11f3976e6f0dd3b`.

Non-secret receipts beside the APK include `apk-verification.json`, `installation-verification.json`, `supplemental-validation.json`, `patient-history-device-verification.json`, `device-acceptance-update.json`, `doctor-device-acceptance-final.json` and `preservation-latest.json`. Screenshots, private identifiers/hash baselines, credentials, tester configuration and APK binaries remain outside Git.

The mobile-only history update required no additional Rules or Functions deployment. Local emulator data/processes, original native configuration and unrelated edits remain preserved. Evidence finalisation did not contact Firebase, change the device/session, rebuild, deploy, stage, commit or push. The owner subsequently approved the two local commits below; pushing remains unapproved. See [history implementation and local test evidence](CONSULTATION_HISTORY_ENTRY.md) for the 124 passing focused tests, TypeScript and localization checks.

### Approved local checkpoint commit inventory

Owner-approved local commits: mobile-only history implementation/tests, followed by final documentation/evidence. Review exact hunks and staged inventories before each commit. No push is authorized.

Mobile implementation/test group — **17 files**:

- `mobile/src/services/consultationHistory.ts` (new).
- `mobile/src/screens/shared/ConsultationHistoryScreen.tsx` (new).
- `mobile/src/screens/shared/ConsultationChat.tsx`.
- `mobile/src/screens/shared/SchedulingAppointments.tsx`.
- `mobile/src/screens/shared/AppointmentsScreen.tsx`.
- `mobile/src/screens/patient/PatientScheduling.tsx`.
- `mobile/src/screens/doctor/DoctorConsultations.tsx`.
- `mobile/src/screens/doctor/DoctorWorkspace.tsx`.
- `mobile/src/navigation/types.ts`.
- `mobile/src/navigation/PatientNavigator.tsx`.
- `mobile/src/navigation/DoctorNavigator.tsx`.
- `mobile/src/i18n/messages.ts`.
- `mobile/__tests__/consultationHistory.test.js` (new).
- `mobile/__tests__/consultationHistoryScreen.test.js` (new).
- `mobile/__tests__/consultationChat.test.js`.
- `mobile/__tests__/schedulingAppointments.test.js`.
- `mobile/__tests__/patientExperience.test.js`.

Evidence/consent-correction group — **4 files**:

- `docs/CONSULTATION_HISTORY_ENTRY.md` (new).
- `docs/POST_CONSULTATION_RELEASE.md` (new).
- `docs/POST_CONSULTATION_FIXES.md`.
- `docs/PHASE_3C_HOSTED_FUNCTIONAL_PRIVACY.md`.

Existing unrelated edits in `docs/CHECKPOINT_1_ANDROID_APK.md` and `mobile/__tests__/consultationService.test.js` are preserved and excluded from these proposed commits. Private receipts/configuration, APKs and rollback artifacts remain outside Git. Previously committed Rules/security changes are not part of this mobile-only commit inventory.
