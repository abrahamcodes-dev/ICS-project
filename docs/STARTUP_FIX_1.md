# STARTUP-FIX-1 — Android black-screen diagnosis

Date: 27 October 2026. Status: PARTIAL — startup recovered on Pixel 7; original native-state trigger remains unconfirmed.

## Evidence and recovery

- Reproduced the black screen in `com.calladoc.app` (PID 7067). UI Automator exposed an empty foreground container.
- Temporary mount diagnostics established that App, AuthProvider, RootNavigator and WelcomeScreen rendered. Authentication reached `signedOut`, with loading and registrationOpen both false. Welcome received valid dimensions and safe-area insets.
- `adb shell dumpsys activity top` showed a populated ReactSurfaceView, ScreenStack, Welcome text, image and button with nonzero bounds. `dumpsys window` showed two MainActivity windows, alongside records of an earlier development-launcher error. This supports a native activity/window-state problem rather than an authentication or Firebase initialization gate. The exact originating transition is not established.
- Back/reopening restored the visible welcome screen. A subsequent force-stop and explicit local Metro launch also rendered it. No app data was cleared.
- All temporary source diagnostics were removed. No application behavior, Firebase configuration, dependencies or security rules were changed for this investigation.
- The AsyncStorage warning still occurs on the successful launch. It concerns authentication persistence, not the observed blank screen.

## Reproduction/recovery commands

With existing demo Firebase emulators and Metro running, from PowerShell:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb -s emulator-5554 shell am force-stop com.calladoc.app
& $adb -s emulator-5554 shell am start -a android.intent.action.VIEW -d 'exp+calladoc://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081' com.calladoc.app
```

Wait for bundle loading before inspecting the screen. Do not clear application data or rebuild to perform this recovery. Mobile Firebase emulator mode remains `demo-calladoc`, Android host `10.0.2.2`, ports Auth 9099, Firestore 8080, Functions 5001 (us-central1), Storage 9199.

## Validation

- Mobile TypeScript (`npm run typecheck`): PASS.
- `npx jest --runInBand __tests__/authNavigation.test.js __tests__/authState.test.js __tests__/onboardingUI.test.js __tests__/firebaseEmulators.test.js`: 4 suites, 57/57 tests PASS.
- Existing Jest Expo logger warning and PowerShell npm-prefix access warnings appeared; test execution completed successfully.
- Git whitespace check: PASS (line-ending warnings only).
- Android: cold launch, welcome, account access, sign-in and role selection rendered; navigation was exercised through actual taps. Registration submission and image upload were not executed in this investigation.
- No native rebuild: no native/source fix required. Jest cannot establish absence of this native window failure; no mocked test is claimed to reproduce it.

## Remaining verification

Repeat reload and background/foreground transitions on the existing client. Then test synthetic patient/doctor registration against demo emulators and optional avatar operations separately. Authentication currently uses memory persistence; a process restart may require signing in again.

If the black screen recurs, capture `adb shell dumpsys window`, `adb shell dumpsys activity top`, current app PID, current-process logcat and a screenshot **before** restarting. Compare the focused window/activity with the activity owning ReactSurfaceView. Evidence from this run is in the host temporary directory (`startup-fix.png`, `startup-activity.txt`, `startup-clean.png`); these are local diagnostic artifacts, not committed fixtures. An upstream native fix requires a reproducible triggering transition; do not change authentication gates or safe-area behavior speculatively.
