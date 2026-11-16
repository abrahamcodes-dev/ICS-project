# Phase 3C hosted Android APK checkpoint — 16 November 2026

## Built and installed

- Separate disposable source/native tree; original local Android tree and private
  environment files were not modified. No dependency changes or Firebase deployment.
- Node 22.23.3, Temurin JDK 17, existing Android SDK and Gradle 9.3.1.
- Expo Android prebuild with `CALLADOC_APP_VARIANT=academic-demo`, `--no-install`,
  fresh native directory and the existing local signing keystore copied privately.
- Gradle `assembleRelease -PreactNativeArchitectures=x86_64,arm64-v8a
  --max-workers=2 --console=plain`: **BUILD SUCCESSFUL**, 15m 49s.
- Package `com.calladoc.app.demo`, label `CallADoc Demo`, version 0.1.0 (1).
  APK is not debuggable and contains an embedded Hermes JavaScript bundle.
- APK size: 90,060,776 bytes. SHA-256:
  `bf726284649f0a6e45034133cf8ecbe9a13b15081e87605f0b1beb56868540d1`.
- APK signature verified. Certificate SHA-256 matches the approved existing
  certificate: `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`.
  This academic checkpoint uses the existing Android debug certificate for signing
  a release-mode APK; it is not a production signing-key migration.

## Focused checks

- All 231 copied source files verified against the working tree; dependency lists
  unchanged. Original native Gradle/manifest/properties/keystore hashes preserved.
- Actual release source-map contents: 99 bundled application sources match current
  source, allowing line-ending normalization. Reused isolated dependencies did not
  cause an older application snapshot to be packaged.
- Production Babel check: emulator flag inlined as `false`; hosted project and
  bucket inlined; no unresolved Firebase public configuration variables.
- Google Web audience matches the deployed backend. Native Google, WebRTC,
  InCallManager, PDF and blob modules remain autolinked. Hosted schemes are distinct.
- No private environment, owner configuration, credentials or service-account files
  found in the APK inventory. Public Firebase registration settings are compiled
  client configuration, not server credentials.
- Pixel 7 installation succeeded alongside `com.calladoc.app` without uninstalling
  or clearing either application. Cold launch via MainActivity returned status OK
  in 2,291 ms, and the visible welcome screen showed Get Started. React Native main
  started; no fatal crash was observed during this startup check. No Metro URL was
  used to launch the release APK.
- Existing local Firebase/Metro services were preserved. No emulator restore/reset,
  cloud creation, new backend deployment, commit or push occurred.

## Artifact and recovery

On this workstation `%TEMP%/calladoc-phase3c-pointer.txt` identifies the private build
directory. It contains `checkpoint.json` (source/native hashes), validated public
build settings, configuration-check results, build log and the complete generated
native tree. The APK is at `mobile/android/app/build/outputs/apk/release/app-release.apk`.
Keep this directory and APK for this checkpoint. Do not copy its settings into the
local environment. Local and hosted applications use separate package data.

The verified APK was also preserved outside the repository at
`%USERPROFILE%/CallADoc-checkpoints/phase-3c/CallADoc-Demo-0.1.0-phase3c.apk`,
with a matching SHA256SUMS.txt. This stable copy contains no private operator
configuration and is byte-identical to the artifact verified above.

The dependency-equipped isolated regression workspace was reused through a junction;
Gradle wrote generated native outputs there. Original installed dependencies and
application source were not upgraded. A later source change requires a fresh source
manifest and rebuilt APK; do not describe this artifact as covering later changes.

## Next manual step and limits

Owner-reported manual verification subsequently passed: the approved administrator
authenticated in CallADoc Demo on Pixel 7 and reached the administrator workspace
and empty doctor-verification queue. The emulator used simulated cellular networking
after Wi-Fi DNS trouble. This records a manual result, not a repeated automated test.
No build or administrator-authentication investigation was repeated to record it.
Successful consultation/payment acceptance and complete privacy/localisation/
connectivity testing remain separate checkpoints.
Register the approved patient/doctor accounts in this hosted app next, using actual
mailbox verification and normal consent. Doctor approval requires normal synthetic
credential submission and administrator review; no automatic approval was granted.

Native FirebaseInitProvider logged missing default native Firebase options. This
project uses the Firebase JS SDK for Auth/Firestore/Functions/Storage, and the welcome
screen started successfully. Native FCM registration/delivery remains deferred; this
warning is recorded rather than represented as successful FCM integration. Native
Google runtime, physical-device audio, STUN/TURN and remote FCM remain unverified.
The accepted InCallManager New Architecture warning remains. SDK metadata, CMake
path-length and dependency deprecation warnings did not prevent the release build.
