# AUTH-PERSIST-1

## Change

React Native previously initialized Firebase with `getAuth(app)`, selecting memory persistence. It now uses `initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })`. Browser initialization remains unchanged. Expo installed `@react-native-async-storage/async-storage@2.2.0`, which is included in Expo 57's compatibility manifest and accepted by the installed Firebase Auth peer dependency range.

The initialization marker is versioned to require a full reload when moving from the old memory-only instance. Successfully initialized instances are reused during Fast Refresh. Initialization errors are not caught and replaced with memory Auth. Firebase owns session serialization/removal; no custom token store was added. AsyncStorage is application-private storage, not an encrypted credential vault.

The existing AuthContext starts in `initializing`. Firebase's initial auth observer notification follows persistence restoration; only then is the canonical identity read. Navigation remains on the loading screen through both stages. Existing identity error/retry handling, doctor approval gates, registration-in-progress routing and explicit Firebase sign-out remain unchanged. Emulator mode still uses demo-calladoc and 10.0.2.2, with all emulator connections configured synchronously before service exports are consumed.

A narrow TypeScript module declaration supplies the native helper omitted by Firebase 12.19's public type entry. Its signature matches the installed SDK's native declaration; no runtime shim or internal SDK import is used.

## Validation

- Mobile TypeScript: PASS after adding the native type declaration.
- Focused Jest: 76/76, five suites (`firebaseEmulators`, `authState`, `authNavigation`, `authService`, `registrationFlow`). Covers persistence configuration, initialization failure, emulator isolation, hot reload, delayed restoration, empty session, logout and stale reads, patient/doctor navigation and registration retry.
- Git whitespace check: PASS.
- Existing Expo Jest logger warning remains nonfatal. Installation reported 20 dependency audit findings; no audit fix or unrelated upgrade was performed.
- Android persistence: NOT TESTED. Native rebuild required; existing generated autolinking output does not include AsyncStorage. No native files were edited or build run for this change.

## Pixel 7 verification

1. Keep the demo Firebase emulator services running; do not reset their synthetic accounts between tests. Keep emulator mode enabled in the existing local environment.
2. Rebuild/install the Android development client using the project's Temurin JDK 17 build environment (not the Java runtime used for Firebase CLI). From `mobile`, use `npx expo run:android --device` and select the existing Pixel 7. AsyncStorage autolinks; no custom native configuration is needed. Do not uninstall or clear app data.
3. Start/reconnect Metro using `npx expo start --dev-client`; fully restart the app after installation. Fast Refresh alone cannot replace the old Firebase instance/native binary.
4. Sign in once with the existing synthetic patient. A session created before this change was memory-only and cannot be recovered retrospectively. Confirm Patient Home and avatar appear.
5. Force-stop and reopen without clearing data:

   ```powershell
   $adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
   & $adb -s emulator-5554 shell am force-stop com.calladoc.app
   & $adb -s emulator-5554 shell am start -a android.intent.action.VIEW -d 'exp+calladoc://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081' com.calladoc.app
   ```

6. Expect the loading gate followed directly by Patient Home, without the guest/login screen. Confirm the memory-persistence warning is absent.
7. Explicitly sign out, repeat force-stop/reopen, and expect the guest screen. Repeat with a pending doctor: restoration must return to verification, never clinical screens.
8. Repeat optional-photo registration and restart to verify the unchanged single-step path. Record actual device results before marking this checkpoint fully verified.
