# Checkpoint 1 Android APK — 17 November 2026

## Final artifact

- File: `%USERPROFILE%/CallADoc-checkpoints/checkpoint-1/CallADoc-Demo-0.1.0-checkpoint1-localisation-r2.apk`.
- SHA-256: `c1ef9118ed1895336d268e6f9b869cf1177b09b235a2a7faf11f3976e6f0dd3b`.
- Size: 90,164,168 bytes. Version name 0.1.0, version code 1 (unchanged).
- Application ID `com.calladoc.app.demo`; display name CallADoc Demo.
- Release mode, not debuggable; embedded Hermes bundle; arm64-v8a and x86_64.
- Source checkpoint: `80fd37d` (preceding localization commits `c79fce2`,
  `f5c3ce1`, `cc97865`). The earlier Rules correction is separate: `8cf6d29`.
- Existing academic signing certificate, not a signing-key migration:
  SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`;
  SHA-256 `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
  APK signatures verified using the installed Android SDK apksigner.

The previous verified Phase 3C APK remains at
`%USERPROFILE%/CallADoc-checkpoints/phase-3c/CallADoc-Demo-0.1.0-phase3c.apk`,
read-only and reverified against SHA-256
`bf726284649f0a6e45034133cf8ecbe9a13b15081e87605f0b1beb56868540d1`.
It was never overwritten. The first localization artifact is also retained
separately, SHA-256
`af3fd34c6d1763b370ce1ff68eda2291d3a324d8ee4aa0804308f53553935dec`.
Use the r2 file above for this checkpoint. No APK or private build environment
is committed to Git.

## Build and packaging verification

Node 22.23.3, Temurin Java 17, existing Android SDK, unchanged dependency locks and
existing signing key. A fresh disposable source/native copy reused the existing
isolated dependencies through a junction. Original local Android configuration
hashes remained unchanged. No private environment was overwritten, and no
dependency was installed/upgraded. The hosted public build settings remained
explicitly `calladoc-academic-demo`, with emulator mode false.

Expo prebuild used the existing academic-demo variant and `--no-install`.
Gradle command:

```powershell
.\gradlew.bat assembleRelease -PreactNativeArchitectures=x86_64,arm64-v8a --max-workers=2 --console=plain
```

The first build failed during JS bundling because the dependency junction made
Expo's default AppEntry resolve App.tsx inside the regression workspace rather
than the fresh build copy. Only the disposable build bootstrap/package main was
adjusted: an equivalent copy of Expo's registerRootComponent bootstrap imports
the copied `./App`. No repository entry/native/dependency change was made.
The corrected build succeeded in 4m 8s, reusing the already compiled native
outputs. Device review then identified an untranslated All filter chip. Its
display/accessibility text was fixed without changing the empty filter value or
authored specialties. The affected patient-experience suite passed 26/26; the
final incremental build succeeded in 1m 22s.

All 105 actual bundled application source-map contents match the committed
source, including localization, Firebase configuration and the Kiswahili engine.
Production Babel checks confirm the hosted project is inlined, emulator mode is
inlined false and no public Firebase environment references remain unresolved.
APK package/version, certificate, standalone bundle and private-file exclusions
were checked. No private environments, signing keys or operator files were found
in the APK inventory. Initial successful checks were not represented as passing
the corrected artifact without rechecking its bundle/signature/package.

The existing 475 distinct affected localization tests remain the baseline;
26 patient-experience tests additionally passed for the device-discovered fix:
501 distinct tests across 28 affected suites, not a new full-repository run.
No backend or Rules suite/deployment was repeated. Existing native FCM,
InCallManager New Architecture, SDK deprecation and CMake path warnings were not
silently suppressed or addressed by unrelated dependency changes.

## Installation and data preservation

Both localization APK installations used `adb install -r`, never uninstall,
clear-data, emulator reset, version downgrade or an application-ID change.
The final r2 update completed at 07:31:59 EAT, well before the existing 09:00
consultation. Hosted app UID remains 10210; local app UID remains 10209. The
hosted app's original installation date remains 16 November. Existing Firebase
authentication restored the same patient without entering credentials.

Read-only hosted checks before and after installation confirmed the same three
approved, enabled, email-verified accounts. Hashes of the existing appointment,
simulated payment, payment reservation, doctor fee, private/public doctor profiles
and patient consent document were unchanged. The appointment remains scheduled
for 17 November 09:00–09:30 EAT and its simulated KES 1,500 payment succeeded.
No booking, payment, consent save, profile save, upload or account mutation was
performed during device checks. No Firebase resource was deployed.

The original native configuration, unrelated consultation-service test file,
old rollback APK and running interactive Firebase processes were preserved.
The patient app was returned to English and left signed in. Temporary UI
hierarchies/screenshots and private record hashes remain outside Git.

## Device verification: observed versus pending

Observed on Pixel 7 with the installed standalone app:

- Current patient session survived both in-place updates.
- English → Kiswahili changed the mounted home, navigation and profile UI.
- Kiswahili persisted across force-stop/cold restart without reauthentication.
- Kiswahili patient home/profile/native headers were visually inspected;
  expanded labels wrapped and did not overlap the status bar in these views.
- Account settings showed the original declined sharing decision. The hosted
  Kiswahili notice displayed synthetic-only, cloud-processing and retention
  limitations; no consent controls were changed or saved.
- Synthetic offline phrase `Siwezi kupumua` displayed emergency guidance,
  immediate-help/do-not-wait wording and the no-diagnosis disclaimer. The
  in-memory test conversation was cleared by leaving the assistant. This is
  device behavior verification, not clinical validation.
- Final r2 directory shows Zote in visible text and its accessibility label;
  doctor name and original authored specialty remain unchanged.
- Language-button selected states and localized navigation/accessibility labels
  were inspected through the actual Android UI hierarchy.

Pending owner-assisted acceptance (normal passwords are not collected/stored):

1. Sign out, switch languages before login and inspect welcome/login screens.
2. Sign in as the existing approved doctor, confirm the Kiswahili workspace,
   existing fee and header layout without saving any records.
3. Sign back in as the existing patient, confirm preference persists across roles,
   and restore English for the scheduled consultation if preferred.

Those manual actions were requested, not marked passed. Approved doctor status
does not exercise the pending-doctor safe-area branch; that exact branch remains
unverified on-device. Large-font/narrow-screen/dark-mode sweeps, spoken TalkBack
acceptance and qualified Kenyan medical/legal language review remain pending.
The Kiswahili assistant has a smaller authored topic set than English and safely
declines unsupported questions. Platform dialogs and unknown backend diagnostics
can remain in their original language. Full bilingual acceptance is not claimed.

No push was performed. No Checkpoint 2/privacy-deletion or Checkpoint 3/connectivity
implementation was started. Future rollback, if approved, should also be an
in-place update with the preserved same-package/same-certificate APK; do not
uninstall or clear storage as a shortcut.
