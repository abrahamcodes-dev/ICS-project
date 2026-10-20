# 9B PDF compatibility spike

This is an isolated Android development experiment, not administrator credential viewing.
No real credentials, Firebase calls, remote PDFs, public download links or media documents
are used. Runtime rendering remains unverified until an approved emulator/device test.

## Pinned candidates

- `react-native-pdf` 7.0.5
- `react-native-blob-util` 0.25.1
- `@config-plugins/react-native-pdf` 14.0.2

The PDF plugin accepts Expo >=56 and adds Android native-library packaging rules.
Both native modules provide New Architecture codegen configuration. These declarations
are compatibility evidence, not proof of successful compilation or rendering on RN 0.86.
Blob-util is autolinked; neither its optional certificate plugin nor the separate
`@config-plugins/react-native-blob-util` package is enabled.

Version-specific OSV queries returned no advisories for the three candidates, crypto-js
4.2.0, deprecated-react-native-prop-types 2.3.0, base-64 1.0.0, AndroidPdfViewer 4.0.1,
pdfiumandroid 1.0.32, Gson 2.13.2 and commons-lang3 3.20.0. This does not establish that
the bundled native PDF parser is free of vulnerabilities. Npm audit reports 72 findings
(54 high, 18 moderate) in the installed dependency tree, including inherited Expo tooling
findings. No audit fixes were applied. CryptoJS is deprecated/unmaintained.

## Security and native configuration

- The standalone `mobile/pdf-spike.js` entry rejects production execution and never
  imports the normal app or Firebase. The normal package entry remains unchanged.
- `PdfSpike` renders an ASCII synthetic single-page fixture from an application-private
  cache file, with `cache: false`, `trustAllCerts: false` and annotations disabled.
- No external URL, supplied filename, untrusted document or permission request is accepted.
- Android config blocks READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE and
  DOWNLOAD_WITHOUT_NOTIFICATION. Private cache access needs none of these permissions.
- A small local manifest plugin removes blob-util's unused sharing FileProvider. The
  upstream provider is non-exported, but its paths encompass external storage and app
  files/cache. The spike does not need that sharing surface.
- No TLS/network security override is introduced. The existing development client's
  Metro networking configuration is separate from this local-file renderer.
- Close, background and unmount trigger best-effort deletion. Disposal waits for an
  unfinished write, preventing a late write from recreating a deleted file. Android or
  the renderer may already have removed the file. Abrupt process death can leave a
  synthetic file in the OS-managed cache; secure erasure is not guaranteed.

## Automated validation

From the repository root:

```powershell
npm.cmd --prefix mobile run typecheck
npm.cmd --prefix mobile test -- --runInBand --runTestsByPath __tests__/pdfSpike.test.js
git diff --check
```

The focused tests use mocked native modules. They cover synthetic PDF structure, local
source selection, TLS bypass disabled, file disposal including late writes/failure,
production exclusion, lifecycle cleanup and the provider-removal plugin. They do not
execute the native PDF renderer.

### Recorded spike results

- Mobile TypeScript: PASS.
- Focused Jest: 11/11 PASS (one suite).
- Expo configuration and Android prebuild: PASS.
- Merged debug manifest: shared-storage permissions, silent-download permission and
  blob-util FileProvider absent.
- Android debug build: FAILED after 7m 22s at `:app:configureCMakeDebug[x86_64]`.
  PDF and blob-util Java compilation completed, but full native compatibility remains
  unverified. No APK was produced.
- The installed Android Studio JBR reports OpenJDK 25.0.3. Prefab 2.1.0 emitted a
  restricted `System.load` / JNA native-access warning; its recorded process result
  was 0, while Gradle reported that warning as the CMake configuration failure.
  This indicates a toolchain issue, not a proven PDF implementation defect. The
  build also warned about its 512 MiB metaspace limit. No retry was performed.
- Evidence: `mobile/android/app/build/intermediates/cxx/Debug/275r4c31/logs/x86_64/`
  (`prefab_stderr.txt`, `metadata_generation_record.json`), and local
  `~/.gradle/daemon/9.3.1/daemon-26992.out.log`. These generated logs stay excluded.

Build invocation from `mobile/android` (process-local Android Studio JBR and Android SDK,
`CMAKE_BUILD_PARALLEL_LEVEL=1`, `NODE_ENV=development`, `EXPO_NO_DOTENV=1`):

```powershell
.\gradlew.bat ':app:assembleDebug' '--no-daemon' '--max-workers=1' '-Dorg.gradle.parallel=false' '-Dorg.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=512m' '-Pkotlin.compiler.execution.strategy=in-process' '-PreactNativeArchitectures=x86_64'
```

Initial spike recommendation: NO-GO for dashboard integration until the JDK/Prefab build issue is
resolved in a controlled follow-up and actual runtime rendering/cleanup is verified.

### Subsequent controlled JDK 17 recovery

The authorized follow-up used the existing Temurin JDK 17 installation with
process-local Java selection. Android debug compilation succeeded in **8m 30s**
(409 tasks, 99 executed), producing
`mobile/android/app/build/outputs/apk/debug/app-debug.apk` (91,000,794 bytes).
This records the previously reported recovery; C9C did not rerun the native build.
The original JDK 25/Prefab failure findings above remain historical evidence.

The native compilation blocker is resolved. Checkpoint 9B subsequently integrated
the authenticated, private-file credential viewer; see `ADMIN_VERIFICATION_MOBILE.md`.
**PDF rendering, Android administrator workflow and device cleanup remain unverified.**
A successful build is not a runtime rendering result. No Android emulator was
launched during this documentation update.

## Future runtime test (approval required; not performed by this spike)

1. Use the successful JDK 17 native development APK (rebuild only if necessary);
   Expo Go cannot run this renderer.
2. Temporarily select `pdf-spike.js` as the mobile package's `main` entry, saving and
   restoring the existing value `node_modules/expo/AppEntry.js` afterward. This isolates
   the test from authentication and production Firebase. Do not enter the normal app.
3. Start Metro with `EXPO_NO_DOTENV=1` and `npx expo start --dev-client --clear`; open this
   development project on the approved Android emulator.
4. Verify the visible synthetic page and native load-complete callback. Inspect crashes,
   repeated opens, backgrounding, explicit close and cache-file removal.
5. Restore the normal entry and stop the test resources. Do not use real credentials.

The original isolated spike did not contain an authenticated download adapter.
Checkpoint 9B now supplies it with Storage Rules authorization, size/content-type
checks, logout cleanup and no durable Firebase download-token URLs. Runtime
validation remains outstanding for both the synthetic harness and the dashboard.
