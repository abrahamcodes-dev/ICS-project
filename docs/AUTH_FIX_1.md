# AUTH-FIX-1 — Single-step registration

## Result

**PARTIAL: implementation and automated validation pass; Android submission is blocked by the running emulator environment.** No deployment, commit, staging, dependency installation or security-rule change.

## Root causes

1. Firebase Auth emits its signed-in event during `createUserWithEmailAndPassword`, before `completeRegistration` and the canonical identity read finish. AuthContext immediately enters loading/missing-identity state; RootNavigator previously unmounted the original registration form and showed a separate completion form. Name, role and optional image selection belonged to that unmounted form.
2. An uncertain completion failure preserved the Firebase account, but retrying `registerUser` rejected all signed-in users rather than allowing the same interrupted registration to resume.
3. The UI-2 setup-success branch introduced another button press after confirmed registration.
4. During device verification, the running emulator's `/demo-calladoc/us-central1/completeRegistration` endpoint returned HTTP 404. Its CLI startup log has no explicit `--project`; repository default is `calladoc-2c05a`. It also reports host Node 24 instead of required Node 22. These local-environment issues are separate from the navigation race. No request was sent to a production endpoint.

## Implementation

- An in-memory registration gate opens before Firebase Auth creation. Root navigation keeps the existing guest registration form mounted through intermediate AuthContext states, including a failed canonical submission.
- Successful registration still calls the existing secure `completeRegistration` callable, validates its response, reads the canonical identity, and requests AuthContext refresh. Only canonical identity controls role routing.
- The patient goes directly to Patient Home. Pending/rejected doctors enter the existing verification flow; approved-doctor and disabled-account guards remain unchanged.
- Same-form retries reuse only the matching pending UID/email, never creating another Auth account. No passwords or tokens are added to persistent storage. A different signed-in account/email cannot take over that retry.
- Existing incomplete accounts after restart/sign-in reuse the registration form in recovery mode with an explicit **Retry account setup** action. They use the authenticated account and existing completion callable, not Auth creation. If the original unsaved form is no longer in memory, name/role must be supplied because no trusted canonical record exists to recover them from.
- Removed the separate completion title and routed setup-success step. Removed the obsolete AuthContext setup-confirmation state. No registration screen redesign.
- Optional photos stay attached to the mounted form during the first submission and retries. Photo upload begins only after canonical registration succeeds; it does not delay or determine navigation success. PP-1 editing, storage and security implementation remain unchanged.
- A successful login or logout clears the registration gate. Failed sign-in does not falsely release an interrupted registration.

## Executed validation

- Mobile TypeScript: PASS (`npm --prefix mobile run typecheck`).
- Functions TypeScript build: PASS, executed by the existing integration gate.
- Focused mobile tests: **97/97 PASS**, seven suites:
  `registrationFlow`, `authService`, `authState`, `authNavigation`, `authUI`, `avatarUI`, `avatarService`.
- Existing onboarding UI tests: PASS in the earlier targeted run (the three-suite run containing onboarding/authService/authUI passed 38 tests).
- Functions registration policy/handler tests: **102/102 PASS** (`completeRegistration.test.ts`, `registrationPolicy.test.ts`).
- Existing real Firebase profile integration suite: **11/11 PASS**, including Auth creation/canonical registration, role denial, credential restrictions, idempotent retries and transaction races.
- Git whitespace check: PASS.

The composed React tests exercise the real AuthProvider, auth service and root routing with mocked Firebase transport: the Auth event arrives while the callable is unresolved, the original form remains mounted, and confirmed patient/doctor identities route directly with/without an optional photo. They also cover backend failure/same-button retry, restored incomplete accounts, and fresh provider rehydration. These are not Android device tests.

The first isolated integration attempt failed function discovery under the existing safety guard. Repeating with the documented fresh unsigned `XDG_CONFIG_HOME` and Node 22 resolved it without changing guards or backend code. Test project: `demo-calladoc-integration`; ports 9105/8105/5105/9205. The successful run log is in the local temporary file `calladoc-auth-fix-integration.log`.

## Android findings and remaining acceptance

- `emulator-5554` is connected; Metro and the four ordinary emulator ports are listening.
- The mobile emulator flag is enabled. Android UI inspection shows **Create your account / Retry account setup**, without the old Complete Your Profile title.
- Patient/doctor submission, restart and picture behavior on Android remain **NOT VERIFIED** because the expected demo callable returned 404.
- Existing running emulator services and their fixtures were not stopped or replaced. Restart them deliberately using the Node 22 / unsigned CLI setup in `ANDROID_INTEGRATION_TEST_PLAN.md` and explicitly `--project demo-calladoc`. Preserve/export needed synthetic fixtures first.
- Confirm the demo callable returns an authentication error for an unauthenticated POST (rather than 404), then verify patient and doctor registration from the role-selection screen, failed-network retry, logout/login and restart. Patient must reach Home; doctor must remain in verification.
- PP-1's new native image modules still require a development-client rebuild before photo/device acceptance.
- Firebase currently uses `getAuth(app)` without a native persistent Auth adapter. This change does not add persistent login storage. Canonical registration survives on the backend; users may need to sign in after an actual process restart. Silent login persistence is not claimed.

## Files changed for AUTH-FIX-1

- `mobile/src/services/authService.ts`
- `mobile/src/context/AuthContext.tsx`
- `mobile/src/navigation/RootNavigator.tsx`
- `mobile/src/screens/auth/AuthForm.tsx`
- `mobile/src/screens/auth/RegisterScreen.tsx`
- `mobile/src/screens/auth/AccountStatusScreen.tsx`
- `mobile/__tests__/registrationFlow.test.js` (new)
- `mobile/__tests__/authService.test.js`
- `mobile/__tests__/authUI.test.js`
- `mobile/__tests__/authNavigation.test.js`
- `docs/AUTH_FIX_1.md` (new)

Prior PP-1 and unrelated UI/.vscode changes remain uncommitted and preserved.

## Environment correction — 27 October 2026

The 404 blocker above is resolved. The previous CLI ran `firebase emulators:start` without `--project`, so `.firebaserc` selected `calladoc-2c05a`. Registered Functions used `/calladoc-2c05a/us-central1/...`, while the mobile emulator configuration correctly requested `http://10.0.2.2:5001/demo-calladoc/us-central1/completeRegistration`.

The previous suite's local data was exported successfully before restarting, to:
`C:\Users\eyoel\AppData\Local\Temp\calladoc-before-demo-fix-20261027-085847`.
The backup was not imported into the fresh demo suite; preserve it if old synthetic fixtures are needed. No production project data was accessed or altered.

Only the verified Firebase emulator process tree was stopped. Android and Metro were left running. The replacement suite is explicitly `demo-calladoc`, running Functions with Node 22, with all four services bound to loopback on their existing ports. The app configuration, `.env`, `.firebaserc`, Firebase Rules and application logic were unchanged.

Verified after restart:
- Functions log: Node 22; registered `http://127.0.0.1:5001/demo-calladoc/us-central1/completeRegistration`.
- Unauthenticated POST to that route: HTTP **401**, `UNAUTHENTICATED`, rather than 404.
- `firebaseEmulators.test.js`: **11/11 PASS**, including project isolation, connection ordering and production-mode guards. A mocked Expo logger warning remains non-failing.
- Startup script PowerShell parsing and Git whitespace checks: PASS.

### Restart command (repository root)

First stop the currently running demo suite deliberately; do not run two suites on these ports. Export any needed synthetic fixtures before stopping. For future source changes, build Functions before restarting. Then:

```powershell
.\scripts\Start-DemoEmulators.ps1 `
  -Node22 'C:\Users\eyoel\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe' `
  -JavaHome 'C:\Program Files\Android\Android Studio\jbr'
```

The script validates Node 22, uses the existing local CLI, explicitly selects the demo project, and isolates CLI credentials in a fresh temporary configuration. Environment changes are process-local and restored on exit. Supply another existing Node 22 binary if the npm-cache path is later removed. It does not install, build, import data or deploy. JDK 17 for Android builds remains unchanged.

Current startup output: `%TEMP%\calladoc-demo-auth-fixed.log`. The existing JBR emits Java deprecation warnings; services started successfully.

**Android registration is still NOT VERIFIED.** Reload the app and sign out of any stale emulator session, then register fresh synthetic patient/doctor accounts without pictures to verify Home/verification routing. Picture testing still requires PP-1's native development-client rebuild. Stop here: environment correction is complete; no device registration was executed in this step.
