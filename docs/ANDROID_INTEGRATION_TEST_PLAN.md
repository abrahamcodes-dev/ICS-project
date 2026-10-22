# Android integration test plan

Prepared 21 October 2026 after 9H commit `fc5a9d26c198d7050a888c7abf3b80fb36afee5e`.
This is a plan, not a record of successful device tests. No build, emulator or
test suite was run during preparation. Earlier automated results remain evidence
for their individual checkpoints, not a full integrated device pass.

## Readiness by workflow

| Workflow | Connection and navigation present | Automated evidence | Android status / gate |
| --- | --- | --- | --- |
| Authentication and roles | Login/Register -> completeRegistration -> canonical identity -> RootNavigator; patient, approved doctor and administrator branches | authService, authState, authNavigation, authUI tests | Full integrated run pending; synthetic identities required; Auth uses memory persistence |
| Doctor verification | Pending/rejected doctor gate -> draft/upload/finalize/submit; administrator queue -> private viewer -> reviewDoctorVerification | doctorVerification and adminVerification service/UI tests; PDF spike tests | Picker, uploads, PDF/image rendering and cleanup pending; local administrator fixture required |
| Scheduling | Doctor Schedule -> availability editor; patient Doctors -> profile/time -> booking -> Appointments/cancel | 9C: 416 Functions, 180 Rules, 75 mobile and 39 scheduling integration tests historically passed | Android pending; approved profile bindings and future UTC slots required |
| Messaging and calls | Both appointment lists -> same authorized consultation; text callable + bounded reads; existing five call-signaling endpoints and native media UI | 9D: 44 focused mobile tests; C6/C7 signaling, session, media and Rules tests | Native WebRTC loading historically verified; two-peer media and integrated chat pending; both parties in eligible room, second client/network needed |
| Completion/prescriptions | Doctor history/Schedule -> confirmed completed outcome -> consultation prescription form; patient My prescriptions | 9E: 29 backend, 26 mobile; completion follow-up 52 mobile tests historically passed | Android and real contention pending; appointment must have ended and consultation must already exist |
| Ratings | Completed patient appointment -> rate; own record recovery; doctor workspace aggregate | 9F: 27 backend, 44 mobile historically passed | Android pending; no public comments/review feed, only own patient comment and doctor aggregate |
| Notifications | Patient Home, doctor workspace and pending-doctor gate -> private inbox; four callables; source transaction events | 9G: 312 backend, 53 mobile historically passed | Inbox Android pending; remote push deliberately disabled; reminders generated on refresh only |
| Chatbot | Login guest action and Patient Home -> local English rules; consultation CTA -> Login/Doctors | 9H: TypeScript and 62 focused tests passed | Android accessibility/layout/cleanup pending; local chat needs no backend, no diagnosis or triage claim |

Evidence anchors: `mobile/src/navigation/{Root,Guest,Patient,Doctor,Admin}Navigator.tsx`,
`functions/src/index.ts`, and the corresponding `docs/*_MOBILE.md` checkpoint reports.
Source currently exports 30 callables; exports are not production deployment.
Historical checkpoint export counts in older documents describe those checkpoints.

## Confirmed environment and blockers

**10B update (22 October 2026): first-draft blocker resolved with approval.**
The owner may now read an absent private doctor profile; existing profiles still
require full validation. The focused Rules suite passed 41/41. Android verified
first draft, refresh/relogin persistence, synthetic credential upload/submission,
administrator private PDF viewing and approval, and approved-doctor navigation.
Scheduling, booking/cancellation, fixture-based chat/completion/prescriptions, ratings and in-app notifications were then exercised. Two UI defects (doctor top inset and closed-history routing) were corrected and retested. See
`ANDROID_E2E_TEST_10B.md` for actual results. Further authorization changes require review.

Severity: **P0** prevents a workflow test; **P1** limits meaningful end-to-end
verification; **P2** known limitation to record rather than claim as complete.

- **P0, environment:** current `JAVA_HOME` points to missing `C:\Program Files\Java\jdk-21`;
  PATH resolves Temurin 17. Installed Firebase CLI requires Java >=21
  (`functions/node_modules/firebase-tools/lib/emulator/commandUtils.js`). Use the
  existing Android Studio JBR 25.0.3 in the emulator terminal only. For a future
  native build use Temurin 17, which passed the previous PDF build. Do not reuse
  Java 25 for Gradle: the earlier native build failed with that toolchain.
- **P0, fixtures:** no ready local test accounts/data were established by this review.
  Public registration cannot create administrators. `functions/scripts/provisionAdmin.cjs`
  explicitly refuses emulator overrides; do not run it against production or remove
  its guard. A local-only administrator fixture is required (procedure below).
- **P0, startup gate:** current backend must be compiled and all four emulators
  loaded with the current Rules/index configuration. No production deployment is
  authorized. Never rely on the live `.firebaserc` default.
- **P1, media:** local Firebase host is fixed to `10.0.2.2`, which is Android Studio
  emulator-specific. Physical Android/iOS connectivity needs a separately approved
  configuration. Two AVDs reaching Firebase does not establish WebRTC reachability.
  No STUN/TURN configuration exists; internet calling is not ready to demonstrate.
- **P1, native runtime:** PDF parsing/private download/cleanup and complete Android
  workflows remain unverified. APK installation alone is not evidence of rendering.
- **P2:** no background incoming calls/global incoming notification discovery; both
  participants must enter the consultation. No remote push delivery or scheduled
  background reminders. Memory-only Auth persistence means a cold start can require
  login again. Chat history UI retains the active-appointment gate, even though
  backend historical reads are supported. Chatbot content needs clinical review.

### Build and launch assessment

Existing `mobile/android/app/build/outputs/apk/debug/app-debug.apk` is present,
91,000,794 bytes, matching the documented successful JDK 17 PDF build artifact.
Pixel_7 AVD exists (API 35, x86_64, configured 2048 MiB RAM). Android SDK adb/emulator
binaries exist. Installed-on-device APK/version and current launch success were
not checked; no emulator was started. Current resource sufficiency is not measured.

`mobile/app.config.js` enables WebRTC/PDF plugins, camera/microphone permissions
and the private-PDF manifest plugin; shared-storage permissions are blocked.
Native autolinking output lists WebRTC, PDF and blob-util. Document picker is in
the installed manifest and was included before the documented PDF build.
The debug Android manifest permits local cleartext networking. Do not weaken
release networking or Storage Rules if a request fails.

No fresh native build is indicated by 9C-9H JavaScript-only changes. First install
the existing development APK and verify native modules. A missing module/stale
installed APK is a build gate, not a reason to use Expo Go. Rebuild only with
separate authorization if the artifact is unsuitable. See `PDF_COMPATIBILITY_SPIKE.md`
for the successful recovery and historical native build command.

## Startup commands (future authorized test session only)

Run from repository root in dedicated PowerShell windows. Commands below were
prepared, not executed. No dependency install is needed. Do not print `.env`.

### Terminal 1: Node 22, Java for Firebase, current local backend

```powershell
$node22 = 'C:\Users\eyoel\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin'
if (!(Test-Path "$node22\node.exe")) { throw 'Select the documented existing Node 22 runtime; do not install automatically.' }
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:PATH = "$node22;$env:JAVA_HOME\bin;$env:PATH"
node --version  # expect 22.23.3
java -version  # this terminal: existing JBR 25.0.3, not Gradle's JDK
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '120'
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP ('calladoc-demo-cli-' + [guid]::NewGuid().ToString('N'))
# Fresh unsigned CLI configuration; do not log out or alter the user's CLI credentials.
npm.cmd --prefix functions run build
if ($LASTEXITCODE) { throw 'Functions build failed; stop.' }
& .\functions\node_modules\.bin\firebase.cmd emulators:start --project demo-calladoc --config firebase.json --only auth,firestore,functions,storage
```

Confirm project `demo-calladoc`, Auth 9099, Firestore 8080, Functions 5001,
Storage 9199 and the printed emulator UI address before signing in. Keep listeners
on loopback, not `0.0.0.0`. Stop on port conflicts rather than killing unrelated
Java processes. Do not use `test:integration`: it targets a different demo project
and ports. Do not launch both environments on overlapping resources.

The demo project's default Storage bucket is `demo-calladoc.appspot.com`, matching
the mobile synthetic config and Firebase CLI's demo Admin SDK config. Verify this
in a failed-upload investigation; never substitute the live bucket. No import/
export is requested here: local data may be lost when emulators stop.

### Terminal 2: Metro

```powershell
cd mobile
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = 'true'
$env:EXPO_NO_DOTENV = '1'
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'
& .\node_modules\.bin\expo.cmd start --dev-client --clear --localhost --max-workers 1
```

`firebaseConfig.ts` selects fixed demo configuration, connects all four services
before use, uses us-central1 Functions and rejects emulator mode in release builds.
Existing live `.env` values are ignored, not overwritten. Fully reopen the app
after changing modes; Fast Refresh cannot switch Firebase projects safely.

10A confirmed that the default localhost lookup selected IPv6 `::1`, causing
Android's IPv4 reverse connection to fail with an unexpected-end-of-stream error.
The process-local IPv4 preference above fixed it without opening a LAN listener.
One Metro worker limits memory pressure. These flags do not change global Java,
networking, Firebase credentials or application configuration.

### Terminal 3: approved Android launch/install

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
Start-Process -FilePath "$sdk\emulator\emulator.exe" -ArgumentList '-avd','Pixel_7' -WindowStyle Hidden
& "$sdk\platform-tools\adb.exe" devices
# Replace with the serial printed for Pixel_7; do not target an unrelated device.
$serial = 'emulator-5554'
& "$sdk\platform-tools\adb.exe" -s $serial wait-for-device
& "$sdk\platform-tools\adb.exe" -s $serial install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
& "$sdk\platform-tools\adb.exe" -s $serial reverse tcp:8081 tcp:8081
& "$sdk\platform-tools\adb.exe" -s $serial shell monkey -p com.calladoc.app -c android.intent.category.LAUNCHER 1
```

Wait for Android boot and installation success. In the development launcher open
Metro at `http://127.0.0.1:8081` (use its actual port if 8081 was occupied and update
the reverse mapping). Firebase uses `10.0.2.2`, independently of Metro's reverse.
Do not select another Metro session with live Firebase mode. `install -r` preserves
app data; do not clear app data or overwrite user documents as a troubleshooting shortcut.

## Synthetic accounts and documents

- Patient A and unrelated Patient B: create through app registration; use unique
  `.test` email addresses and locally chosen passwords, never recorded in screenshots.
- Doctor A: register through app, complete draft and verification as below. Doctor B
  may be used for cross-doctor denial. Do not manually approve a doctor by changing
  only the identity; approval requires consistent profile/request/public bindings.
- Administrator A: create a **separate Auth emulator account** via local emulator UI,
  then, as a deliberate local test fixture only, create its canonical `users/{uid}`
  document in the Firestore emulator UI with the following fields matching
  `functions/src/auth/adminProvisioning.ts`: `uid`, matching `email`, `fullName`,
  `role: "administrator"`, `status: "active"`, `schemaVersion: 1`, and `createdAt`/
  `updatedAt` as ISO UTC strings. Set its synthetic Auth email verified. Do not
  promote a patient/doctor record or set token claims instead of canonical identity.
  Confirm the UI project is demo-calladoc before any fixture write. This local
  fixture is not production provisioning evidence and is not a new app capability.
- Supply synthetic PDF/JPEG/PNG files (no genuine identity or medical documents),
  1 byte to 5 MiB, plus an oversized file for rejection. Valid fixtures must actually
  render; include a medical_license category and 1-5 selected credentials.
- Use distinct future appointments for cancellation, active consultation, and a
  second rating boundary case. A second independently signed-in Android client is
  needed for simultaneous messaging/calls; do not reuse the same AVD concurrently.

## Ordered scenarios and expected outcomes

1. **Guest and authentication:** open chatbot before login, test unknown/emergency/
   medication questions, reset, background and reopen. Register Patient A/B and Doctor A;
   retry sign-in errors; verify canonical role navigation, sign-out and cold restart.
   Pending doctor must not enter clinical routes; no public administrator registration.
2. **Doctor verification:** save all four required professional fields; record current
   revision. Pick/upload/finalize PDF/JPEG/PNG credentials within the 15-minute slots;
   submit at that revision. Test oversized/type rejection, expired slot and uncertain
   retry. Save generated credential/request IDs for supported recovery; no collection
   query workaround. Pending/rejected doctors retain verification-only navigation.
3. **Administrator review:** sign in as Administrator A; refresh queue, inspect only
   selected credentials, render PDF/images, close/background/sign out during download.
   Verify app-private temporary cleanup and no public URLs/broad-storage prompts.
   Reject with a reason; doctor saves a changed revision and fresh evidence, resubmits;
   approve, then doctor refreshes status. Test duplicate decisions and stale selection.
   Expect published approved profile and clinical access only after backend confirmation.
4. **Availability and discovery:** approved doctor edits a future UTC date, max eight
   sorted nonoverlapping 30-minute-aligned windows; confirm full replacement. Check
   device-local preview. Patient directory shows only eligible doctor/name/specialty;
   search is loaded-results-only. Exercise empty/error/continuation pages. Conflicting
   expectedRevision requires reload, never a silent overwrite.
5. **Booking/cancellation:** patient selects a local date and returned slot (>=5 minutes
   lead, within 90 days), confirms; both participants see one appointment and booking
   inbox event. Race Patient B for the same slot using a second client: only one booking
   should succeed. Test lost acknowledgment/retry before leaving the screen. Cancel a
   separate future appointment; verify authoritative cancelled status, slot release and
   both inbox alerts. Do not alter stored timestamps to skip eligibility checks.
6. **Active consultation:** wait until start; both participants open the same appointment
   (scheduled, start <= now < end +15 minutes). Texts appear chronologically with correct
   sender; test pagination, reconnect and retry without duplicate messages. Other accounts
   cannot enter. Closed-room history is not exposed by this mobile entry gate.
7. **Calls:** both clients stay foreground in that room. Start audio then video separately;
   accept/reject, mute, camera toggle/switch, end, deny permissions, background and leave.
   Verify actual remote audio/video on both peers, not merely connected metadata or local
   preview. Log inability to establish media as unverified/blocked; do not invent TURN
   credentials or change networking/Rules. Native module load was historically verified,
   not this end-to-end sequence.
8. **Completion/prescription/rating:** after appointment end, assigned doctor confirms
   Record completed appointment; refresh must show completed. The consultation must
   already exist. Issue a synthetic, explicitly entered prescription and verify patient
   read, exact retry and unrelated-user denial. Patient rates 0-5 with optional comment,
   recovers the same immutable rating after retry; doctor sees aggregate count/score,
   not private patient comments. Test 0 and 5 on separate completed consultations.
9. **Notifications:** generate new events after this backend starts (no backfill). Check
   booking/cancellation, approval/rejection, message and prescription alerts, read state,
   pagination and destination reauthorization. Refresh inside one hour before another
   scheduled appointment for the reminder. No timer/push receipt is expected. Permission
   denial/native push unavailability must leave the inbox useful; remote delivery disabled.
10. **Privacy/recovery:** sign out/switch accounts while loading inbox, chat, prescription
    or credential; no stale content may appear. Test offline errors and retries without
    optimistic success. Verify unmount/background media release, no residual private
    viewer, no guest record access, and unchanged consultation authorization.

## Evidence and completion criteria

Record per scenario: commit plus uncommitted patch status, APK SHA256/install source,
Android/API/device/ABI, emulator project/ports, synthetic participant IDs, UTC and local
time, exact steps, expected/actual result and PASS/FAIL/BLOCKED/NOT TESTED. Capture
redacted screenshots or short recordings, relevant sanitized logcat/callable error
codes, and local authoritative document counts/IDs for idempotency checks. Never
collect passwords, tokens, real patient data, full credential content or prescription
content in logs. Use synthetic labels in all evidence.

The unrelated AuthForm/authUI edits and `.vscode/` remain outside 9H; record that the
device tests use the working tree, not claim an untouched release commit. Recent
Rules execution and real contention for prescriptions/ratings/notifications remain
pending; earlier mocked tests are not a substitute. Broad regression is a separate gate.

Stop on unexpected production project selection, authorization leakage or exposed
private artifacts. Classify these as P0 rather than changing Rules to continue.
Stop only resources started for the test; never kill arbitrary Java processes.
Keep emulator exports, logs, test documents and APKs excluded from Git. The plan
requires no production deployment, billing change or dependency installation.
