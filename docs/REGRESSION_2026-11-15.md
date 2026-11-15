# Phase 2B regression evidence — 15 November 2026

## Scope and environment

The approved full regression baseline was 137 Jest suites and 3,897 tests passed,
with no skipped tests or snapshots. Finalisation updates only six direct Expo
dependencies and their required transitive dependency tree. No application logic,
Rules, backend dependency, or native configuration was changed.

Execution uses Node 22.23.3 and the guarded disposable workspace
`C:\Users\eyoel\AppData\Local\Temp\calladoc-regression-x53QK6`.
The mobile dependency archive was refreshed, retaining the old archive separately.
Original and isolated manifest/lockfile dependency graphs match. Runtime packages
were installed using Expo CLI; jest-expo remains solely a development dependency.

| Direct dependency | Before | Final |
|---|---|---|
| expo | 57.0.26 | 57.0.33 |
| expo-dev-client | 57.0.20 | 57.0.21 |
| expo-image-manipulator | 57.0.21 | 57.0.22 |
| expo-image-picker | 57.0.20 | 57.0.21 |
| expo-notifications | 57.0.21 | 57.0.25 |
| jest-expo (development) | 57.0.5 | 57.0.6 |

No unrelated direct dependency changed. react-native-incall-manager remains 4.3.0;
React and React Native remain 19.2.3 and 0.86.3. No Doctor exclusion was added.
Read-only npm audit comparison found 31 baseline versus 24 final advisories
(8 low, 5 moderate, 11 high), with no newly introduced advisory IDs. These existing
advisories need separate triage before live integration; no audit-fix was applied.

## Results

| Check | Passing suites | Passing tests | Evidence disposition |
|---|---:|---:|---|
| Mobile Jest | 72 | 1,217 | Rerun against patched runtime/preset; see timing note below |
| Backend Jest | 41 | 1,820 | Approved Phase 2B result carried forward; unchanged |
| Firestore Rules | 13 | 611 | Approved result carried forward; unchanged |
| Storage Rules | 2 | 68 | Approved result carried forward; unchanged |
| Core integration | 4 | 95 | Approved result carried forward; unchanged |
| Payments | 1 | 51 | Approved result carried forward; unchanged |
| Google | 1 | 6 | Approved result carried forward; unchanged |
| Consent, attachments, deletion | 3 | 29 | Approved result carried forward; unchanged |
| Total | 137 | 3,897 | Zero remaining failed/skipped tests; zero snapshots |

Mobile TypeScript passed after the updates. Backend compilation and test TypeScript
passed in the approved baseline and were not repeated for mobile-only patches.

The final complete mobile run reported 71 suites/1,216 tests passed and one 5-second
startup timeout in paymentsUI while native compilation was competing for resources.
With compilation stopped, the unchanged affected suite passed all 17 tests; its
first checkout test took 2,702 ms. No timeout was raised, test skipped, assertion
relaxed, or payment implementation changed. Totals above count unique tests across
the full run and affected rerun, not repeated attempts. Prefer sequential JS checks
and native builds on this machine to avoid contention.

Expo Doctor: **20/21 checks passed**, exit 1 solely for the retained library's
React Native Directory classification: **untested on New Architecture**.
The SDK dependency alignment check passes. No check is excluded or suppressed.
The disposable copy has local Git metadata (no commits/remotes/staging), allowing
Doctor to recognize the existing ignored CNG Android folder correctly.

## Android development build

Status: **BUILD SUCCESSFUL**, arm64-v8a and x86_64, in 20m 41s; 475 tasks
(119 executed, 356 up-to-date). Both ABIs were verified in the resulting APK.
The initial long-TEMP-path build failed at
`:app:buildCMakeDebug[arm64-v8a]` because Ninja rejected an object filename longer
than 260 characters. This was an environment path limitation, not a compiler
diagnostic against application code.

The retry maps only the disposable workspace to an unused `R:` drive with subst.
Generated CMake/autolinking caches containing the old path were preserved under
`*-before-short-path`; no original native inputs were edited. The mapping is
temporary. JDK 17 is used for Android, independently of JBR 25 for Firebase.

The owned drive mapping was removed after verification. For a fresh isolated build,
map the copy before the first Gradle invocation to avoid stale absolute CMake paths:

```powershell
# Confirm R: is unused first; never replace an existing mapping.
subst.exe R: 'C:\Users\eyoel\AppData\Local\Temp\calladoc-regression-x53QK6'
Set-Location R:\mobile\android
```

From the disposable copy's short `R:\mobile\android` path:

```powershell
$node22='C:\Users\eyoel\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
$env:PATH=(Split-Path $node22)+';'+$env:JAVA_HOME+'\bin;'+$env:PATH
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS='true'
$env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST='127.0.0.1'
.\gradlew.bat :app:assembleDebug --no-daemon --max-workers=1 '-Dorg.gradle.parallel=false' '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m' '-Pkotlin.compiler.execution.strategy=in-process' '-PreactNativeArchitectures=arm64-v8a,x86_64'
```

The JVM limits are invocation-only. No prebuild, APK installation, global Java
configuration change or emulator restart is part of this check.

APK: `mobile/android/app/build/outputs/apk/debug/app-debug.apk` in the disposable
workspace; 155,700,904 bytes. SHA-256:
`d6906d7a9f50e6940f1b78b63394406799fa0f346043bb8cf536e549cbc1e62d`.
It was not installed. After building, leave R: and remove only the mapping you
created (`subst.exe R: /D`); this does not delete the copy or APK.

Local logs: `expo-doctor-final.log`, `mobile-types-sdk57-final.log`,
`mobile-jest-sdk57-final.log`, `mobile-jest-sdk57-affected.log`, and
`android-build-short-path.log`. These are outside the original repository.

## Review of the seven baseline test corrections

| Test file | Meaningful checks retained |
|---|---|
| mobile/__tests__/avatarUI.test.js | Exactly one labelled selected-photo preview, matching URI, cancellation and disposal; unrelated Google icon no longer miscounted |
| mobile/__tests__/doctorVerificationUI.test.js | Original role, draft, phone, upload, failure/retry and disposal assertions; unrelated AvatarEditor mocked, with avatar behavior covered by its own suite |
| functions/__tests__/schedulingPolicy.test.ts | Exact 15-minute start grid and 30-minute default, ordered contained candidates, supported 60-minute interval and rejection of unsupported durations; strict schema checks retained |
| functions/__tests__/appointmentIndexes.test.ts | Exact ten approved composites and no additional indexes/field overrides |
| functions/__tests__/rules/appointmentReads.rules.test.ts | Malformed-record denial retained using unsupported 45 minutes instead of now-supported 60 minutes; Rules unchanged |
| functions/__tests__/rules/availability.rules.test.ts | Exact three starts at 15-minute intervals, sanitized fields and persistence checks |
| functions/__tests__/integration/scheduling.integration.test.ts | Exact approved export allowlist including Google/simulated decisions, legacy endpoint 404s, index checks and booking/cancellation integrity |

No further correction was required during finalisation.

## Acceptance limits and preservation

The remaining InCallManager warning requires physical Android audio verification;
see [the audio compatibility checklist](CALL_AUDIO_ANDROID.md#sdk-57-compatibility-warning-15-november-2026).
Build success, mocked tests and emulators cannot establish device audio quality.
Manual payment acceptance and full end-to-end/device evaluation remain deferred.

Final verification confirmed the original Firebase and Metro processes retained
their IDs/start times; all five Auth accounts, including Dr. James Mwangi, retained
their membership. All 37 original/copied native inputs and recovery-snapshot file
checksums were unchanged. The private Functions environment file remains present.
The original working tree and intended implementation were preserved. Git whitespace
checks passed; nothing is staged. Phase 2C commit preparation may proceed with the
documented compatibility warning; this is not approval for live deployment or a
claim of completed physical-device/end-to-end acceptance.
No staging, commits, pushes, live Firebase connection or deployment is authorized
by this evidence document.
