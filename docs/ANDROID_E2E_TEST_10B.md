# Checkpoint 10B — Android workflow verification

Updated 22 October 2026. Base HEAD: `fc5a9d26c198d7050a888c7abf3b80fb36afee5e`.
**Result: requested local happy-path workflows passed, with the fixture and coverage
limits below.** No production deployment, APK rebuild, dependency installation,
commit or push. Unrelated authentication edits and `.vscode/` were preserved.

## Environment and fixtures

- Reused Pixel_7 (`emulator-5554`), existing development APK and IPv4 Metro8081.
- Only `demo-calladoc`: Auth9099, Firestore8080, Functions5001 and Storage9199,
  bound to host loopback. Existing Android emulator connectivity configuration reused.
- Synthetic patient from 10A; doctor registered through Android; administrator
  fixture created using existing `provisionAdministrator` and `transactionAdapter`
  with guarded localhost dependencies. Canonical administrator identity/audit created;
  no production CLI guard disabled, no client role promotion.
- Test passwords kept in encrypted temporary storage outside the repository.
  No production credentials or real patient/credential data used. No exhaustive
  packet capture was performed.
- One synthetic 602-byte PDF generated from the existing PDF spike fixture.

## Defects corrected

### 1. Approved missing-profile Rules correction

Client profile loading expects null before the first professional draft exists.
The old rule required valid `resource.data` even when absent: emulator-admin read
returned 404, but owner read returned 403, leaving the form disabled.

`functions/firestore.rules` now requires canonical `doctorOwner(uid)` and either
absence of the deterministic profile or the existing full
`readableDoctorProfile` validation. Existing malformed profiles, other users,
listing and all direct writes remain denied. No other collection or Storage
permission changed.

### 2. Doctor prescription navigation under status bar

Android screenshot `%TEMP%/calladoc-10b-top.png` showed the prescription action
under the system status bar. `DoctorWorkspace.tsx` now wraps its two existing top
actions in `SafeAreaView edges={['top']}`. Both routes remain unchanged. Android
then opened prescriptions successfully.

### 3. Closed consultation rejected by mobile notification route

The backend returned authorized closed history, but `ConsultationCallScreen.tsx`
rejected every non-active room. It now accepts a correctly bound closed result
with `canSend=false` and renders the existing chat history without mounting call
resources. Invalid room bindings and inconsistent closed/sendable results remain
denied. No backend lifecycle, callable authorization or Rules adjustment needed.
Android subsequently displayed both participants' messages from the notification;
new messages and calls were unavailable.

## Executed scenarios

| Scenario | Actual result |
| --- | --- |
| Doctor registration / pending navigation | PASS; canonical active/pending doctor, clinical routes locked |
| First professional draft | PASS after Rules fix; four synthetic fields saved, revision 1 |
| Draft persistence | PASS after refresh, logout/sign-in and app process restart |
| PDF selection/upload/finalization | PASS; synthetic medical-license file reached ready state |
| Verification submission | PASS; submitted request persisted and profile locked |
| Administrator queue/detail | PASS; submitted doctor, professional fields and revision visible |
| Private PDF rendering | PASS; Android visibly rendered “CallADoc synthetic PDF test” |
| Viewer cleanup | PASS for close/logout check: no `calladoc-review-*` files in app cache |
| Administrator approval | PASS after explicit confirmation; queue became empty |
| Approved doctor navigation | PASS; approved workspace unlocked on sign-in |
| Availability | PASS; saved revision 1, 21 October 22:30–24:00 UTC; correct 22 October 01:30–03:00 local preview |
| Patient discovery / booking | PASS; approved doctor found, 01:30 and 02:00 local appointments confirmed |
| Cancellation | PASS; separate 02:00 appointment canceled and upcoming list refreshed |
| Both participants' appointment views | PASS; doctor history showed scheduled, canceled and fixture-completed records |
| Consultation messaging | PASS using historical fixture; patient message, doctor read/reply, chronological sender labels/timestamps |
| Unauthorized consultation access | PASS targeted check: nonparticipant canonical administrator get and send both HTTP403 |
| Appointment completion | PASS; doctor explicitly confirmed elapsed fixture; refreshed history showed completed |
| Prescription issuance/retrieval | PASS; synthetic nonclinical record issued, doctor and associated patient retrieved it |
| Duplicate prescription | PASS; second request with new ID rejected HTTP409 ALREADY_EXISTS; immutable existing record retained |
| Rating submission/recovery | PASS; patient confirmed 4/5; refresh restored existing immutable rating |
| Conflicting duplicate rating | PASS; second score/comment rejected HTTP409 ALREADY_EXISTS |
| Doctor aggregate | PASS on Android: 4.0/5, count1; patient comment/identity not displayed |
| Notification events | PASS observed booking, cancellation, approval, message, prescription and refresh-generated reminder |
| Read state / navigation | PASS mark-read; reminder routed to Appointments; prescription routed to own records; message routed to authorized closed history after UI fix |

### Explicit historical-fixture limitation

The real bookings above were created entirely through Android. A **separate**
synthetic historical appointment supported messaging and completion without waiting
for a future appointment to end. It followed the repository's integration-fixture
schema, using guarded local Admin SDK and an atomic transaction:

- Appointment `670e4afe05dbe76f523e2c84db512271fec66613494b02a2824eff832173182e`.
- UTC 21 October 21:30–22:00; opened/messaged within existing 15-minute grace period.
- Added nonoverlapping historical availability and matching doctor/patient locks;
  availability revision became2. Existing future bookings were preserved.
- No clock changes or lifecycle/authorization bypass in production code.
- Doctor completion, prescription and rating then used the actual mobile/callable
  workflows. This is fixture-based evidence, not proof that a naturally elapsed
  UI-booked appointment completed end to end in real time.

## Focused automated validation

All commands ran with no dependency installation or unrelated suites.

| Command | Result |
| --- | --- |
| Node22: `node functions/node_modules/jest/bin/jest.js --config functions/jest.rules.config.js --runInBand --runTestsByPath functions/__tests__/rules/doctorProfiles.rules.test.ts` | 41/41 PASS; one suite; 98.701s |
| Mobile: `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath __tests__/doctorWorkspace.test.js __tests__/prescriptionUI.test.js` | Workspace7/7; prescription6/7 with one default 5s timeout |
| Mobile isolated unchanged retry: `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath __tests__/prescriptionUI.test.js` | 7/7 PASS in2.656s; no timeout/test relaxation |
| Mobile: `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath __tests__/callUI.test.js __tests__/consultationChat.test.js` | 22/22 PASS, two suites |
| Mobile: `node node_modules/typescript/bin/tsc --noEmit` | PASS after final source change |
| `git diff --check` | PASS |

Rules tests used process-local `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, reusing the
running emulator in fixed separate project `demo-calladoc-rules`. Test clearing did
not target the interactive fixture project. The affected suite now permits only
localhost8080/8085. Five absent-profile regressions added; existing malformed,
foreign, wrong-role, list/write and transaction checks retained.

Final unique focused coverage: **41 Rules tests and 36 mobile tests passed**.
The initial mobile timeout remains recorded; a full regression was not run.

## Environment observations and limits

- One Android system wait dialog recovered with Wait.
- Picker initially reported ERR_PICKING_IN_PROGRESS; restarting only CallADoc
  recovered selection. Initial initiating cause was not established. Temporary
  picker diagnostic logging was removed; no retained picker/source change.
- Functions cold starts delayed some operations, notably completion. We checked
  authoritative refreshed state rather than declaring success from button taps.
- Automatic approval-review usage-limit failures interrupted testing several times;
  rejected commands did not execute. Work resumed only after explicit continuation.
- Minor replacement-character typography appears in rating copy; not a workflow blocker.
- Auth remains memory-only. Remote push, rejection/resubmission, JPEG/PNG rendering,
  broad adversarial/concurrency coverage, offline recovery and two-device WebRTC
  were not verified in this run. No new native build or real-device claim.
- Screenshots under `%TEMP%`: `calladoc-10b-pdf.png` (rendering),
  `calladoc-10b-top.png` (pre-fix status-bar overlap), plus prior blocker evidence.
  These synthetic artifacts are local and not committed.

## Changed files / handoff

- `functions/firestore.rules`
- `functions/__tests__/rules/doctorProfiles.rules.test.ts`
- `mobile/src/screens/doctor/DoctorWorkspace.tsx`
- `mobile/__tests__/doctorWorkspace.test.js`
- `mobile/src/screens/shared/ConsultationCallScreen.tsx`
- `mobile/__tests__/callUI.test.js`
- `docs/ANDROID_INTEGRATION_TEST_PLAN.md`
- `docs/ANDROID_E2E_TEST_10B.md`

No additional authorization blocker remains from executed scenarios. **10C may
begin with these coverage limits recorded.** Nothing staged; unrelated AuthForm,
authUI tests, `.vscode/`, and prior 10A documentation remain untouched by these fixes.
Existing local services are left running; synthetic fixture data is ephemeral.
