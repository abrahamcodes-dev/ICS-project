# Checkpoint 10A - Android smoke results

21 October 2026. Tested working tree at `fc5a9d26c198d7050a888c7abf3b80fb36afee5e`,
including the existing uncommitted AuthForm/authUI changes. These were preserved.
This is a narrow smoke test, not a full integration/regression or clinical validation.

## Environment and actual results

- Functions compiled successfully with existing Node **22.23.3**.
- Firebase CLI **15.32.0** ran using process-local Android Studio JBR **25.0.3**;
  `JAVA_TOOL_OPTIONS=-Xmx768m`, `FUNCTIONS_DISCOVERY_TIMEOUT=120` and a fresh unsigned
  temporary CLI configuration. Global Java settings were not changed. Temurin 17
  remains available for native builds, which were not run.
- Root `firebase.json`, explicit **demo-calladoc**: Auth 9099, Firestore 8080,
  Functions 5001, Storage 9199, all loopback. Hub `127.0.0.1:4400/emulators`
  confirmed the endpoints; CLI reported all services ready and loaded source callables.
- Pixel_7, API 35 x86_64, serial `emulator-5554`. Existing debug APK installed with
  `adb install -r`; no rebuild, dependency install or data clearing.
- Metro ran with emulator flag true, `.env` loading disabled, IPv4 localhost and
  one worker. Android loaded the normal Expo AppEntry bundle (1153 modules).
  Compatibility is verified for the exercised screens, not every native module.

| Smoke scenario | Observed outcome |
| --- | --- |
| App launch | PASS after correcting Metro loopback binding; Login rendered |
| Login and registration UI | PASS; patient selector, name/email/password/confirmation controls rendered |
| Guest chatbot | PASS without authentication; `healthy eating` returned the predefined nutrition response |
| Synthetic patient registration | PASS with slow cold-start/recovery caveat below; canonical patient created |
| Local Auth/Functions/Firestore connectivity | PASS: Android Auth creation, authenticated completeRegistration execution, canonical identity read and Patient Home |
| Patient navigation | PASS: Home greeting, empty upcoming appointments, Profile with synthetic identity |
| Logout | PASS: returned to Login, patient greeting and profile no longer present |
| Fresh login | PASS using same synthetic patient; returned to Home; final logout also passed |
| Production isolation | Fixed demo config and Auth Emulator warning observed; local callable path/project and Firestore identity verified. No unexpected production application access observed; no exhaustive packet capture performed |
| Storage workflow | Service running only; upload/download deliberately NOT TESTED in 10A |

Synthetic account: `smoke10a20261021@example.test`, name `Smoke Patient`, local UID
`JbTvqZKC8vivaEevAAVG9OlIDXWL`. Canonical `users/{uid}` was read back from the local
emulator as `role=patient`, `status=active`. A read-only emulator-admin lookup was
used for evidence, not to create or bypass identity authorization. The random
password was never printed or committed; its temporary encrypted file was removed.
The account remains local; reset its password through the emulator if reuse is needed.

## Problems encountered and resolution

1. Desktop computer-use helper unavailable. Used existing ADB Android UI hierarchy,
   screen input and screenshots; no additional automation dependency installed.
2. Metro originally listened on IPv6 `::1`. Android reverse to IPv4 failed with
   `java.io.IOException: unexpected end of stream on http://127.0.0.1:8081/`.
   Restarting only Metro with `NODE_OPTIONS=--dns-result-order=ipv4first` fixed the
   binding. The executable plan now includes it. No source/native change required.
3. The first registration waited on a slow Functions worker cold start: request
   accepted at 10:43:08 UTC, runtime ready around 10:44:37, finished 10:45:01.
   Auth existed before canonical identity, so the app temporarily showed Finish
   account setup. The existing setup-recovery UI was used; Home subsequently loaded.
   No second Auth account or manual identity write was needed. First-attempt seamless
   registration is not claimed; budget local warm-up time before a demonstration.
4. Expected memory-persistence Auth warning remains; cold restart persistence was
   not added. Java Unsafe/runtime warnings and an npm version-lookup timeout did
   not prevent Firebase readiness. Expo offered updates; none were installed.
5. Automatic approval review temporarily hit a usage limit before registration
   submission. That action did not execute; after user requested continuation,
   screen/services were rechecked and testing resumed.

Host memory was constrained (approximately 125 MiB free during cold bundling).
No unrelated processes were terminated and no global pagefile/settings changed.
The first Metro bundle took about 80 seconds. These are observations of this run,
not performance benchmarks. Resource pressure is a demonstration risk.

## Evidence and scope

- Terminal evidence: Functions build exit 0, Firebase readiness table/hub endpoints,
  completeRegistration callable authentication VALID, active patient identity, Android
  UI hierarchy and repeated Login/Home/Profile states.
- Screenshots outside Git: `%TEMP%/calladoc-10a-home.png` and
  `%TEMP%/calladoc-10a-logout.png`; contain only synthetic account UI.
- Local generated evidence: `mobile/.expo/dev/logs/start.log`, emulator logs and
  generated `functions/lib`; remain excluded. Crash-level logcat inspection returned
  no AndroidRuntime/ReactNativeJS errors at the final successful sign-in check.
- No production Firebase credentials used. CLI fetched public version metadata;
  this is separate from application access to the live CallADoc project.
- No doctor verification, availability, booking, prescribing or calling was attempted.
  PDF/media runtime behavior and multi-user security tests remain unverified here.

## Handoff

**10A smoke scope PASS with environment/cold-start caveats.** 10B can begin with
its agreed scope and synthetic fixtures. Administrator testing still requires a
local canonical administrator fixture; PDF workflows remain device-unverified.
At completion the Android app is signed out. The AVD, Metro and demo Firebase
services are left running for review; no production deployment, commit or push.
Emulator data is ephemeral without export. Stop only these task-owned processes
when finished, not unrelated Java/Node processes.

Only documentation changed during 10A: this report and the integration plan's
Metro commands. Existing authentication changes and `.vscode/` were untouched.
