# Google Sign-In — Android development setup and security

Status: implementation and automated/native build validation complete; development
OAuth audience configured locally on 6 November 2026. **Real Google account and
device verification remain pending.** No Google Cloud/Firebase Console settings
were changed by this implementation. No new
signing keys were generated. Application ID remains `com.calladoc.app`.

## Current local development configuration

The user confirmed Google provider/client registration in development project
`calladoc-2c05a`. Its public **Web** OAuth client ID is configured identically in
`mobile/.env` (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`) and the emulator-only
`functions/.env.local` (`GOOGLE_SIGN_IN_WEB_CLIENT_ID`):

```text
357773331749-5am7ck5kdh6rqiv81nvi3lcbacqs9lgp.apps.googleusercontent.com
```

`calladoc-2c05a` supplies Google OAuth identity proof only. Firebase Auth sessions,
Firestore, Functions and Storage remain in local `demo-calladoc` emulators;
`EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true` remains enabled. No live Firebase
project IDs, API keys, app IDs, service files or medical records were changed.
The Firebase CLI loads `.env.local` only for emulation; that file is ignored by
Git and is not a deployed Functions environment configuration.

Restart Metro from `mobile/` with `npx.cmd expo start --dev-client --localhost`
and fully reload the app so Expo embeds the new public client ID. Start/restart
the local Functions emulator using the normal `--project demo-calladoc` command
below, preserving any existing emulator data. No shell audience export is needed
now: `.env.local` supplies it. Remove an old conflicting shell override if present.
No new Android build is required for this environment-only change if the client
already includes the Google native module built during implementation. If it
does not, install the previously built APK using the commands below.

Real Google ID tokens are verified against Google's keys and this OAuth audience;
the resulting Firebase custom token is consumed by emulator-connected Auth. The
Cloud OAuth project therefore need not match the emulated Firebase project.
Synthetic signed fixture tests validate that exchange, binding, consent, linking
and reauthentication without turning off signature verification in application
code. They do not establish that real Google account selection has passed.

Configuration follow-up validation (6 November 2026): mobile TypeScript, 32
focused mobile tests, 30 backend tests, six isolated emulator integration tests
and whitespace checks passed. The installed Firebase CLI environment loader
confirmed matching audiences and that the new Functions setting is excluded
from non-emulator environment loading. No Android rebuild or real Google
account sign-in was performed; Metro and main emulators were not running.

### Missing-button follow-up — 6 November 2026

The Pixel 7 was still using a client last updated on 27 October. Inspection of
its installed APK confirmed that **both** Google Sign-In and InCallManager were
absent. Its login UI also lacked the current Google button. The source renders
the custom Google button unconditionally on login/registration (configuration
only disables it), so missing OAuth configuration/native code does not hide it:
the running UI was stale as well.

Rebuilt `mobile/android/app/build/outputs/apk/debug/app-debug.apk` successfully
for ARM64+x86_64 using JDK 17, and verified both native modules in the resulting
DEX files. Updated Pixel 7 using `adb -s emulator-5554 install -r ...`; app data
was retained. Metro was restarted with its transform cache cleared. Because
`--localhost` resolved to IPv6 in the restarted process, it was relaunched with
the process-local Node option `--dns-result-order=ipv4first`, preserving the
existing IPv4 ADB forwarding without changing project networking configuration.
The refreshed bundle contains the Google button and the configured Web audience.

Pixel 7 accessibility inspection then confirmed Continue with Google on Login
and on Patient Registration after scrolling below the privacy/consent controls.
No fields/consent were submitted and no Google authentication was initiated.
TypeScript, 24 focused Google/UI tests and whitespace checks passed. No Firebase
emulator records, signing keys, dependencies or application source were changed.
`google-services.json` remains unnecessary for the explicit Web-client-ID /
Firebase-JavaScript-SDK implementation; native compilation succeeds without it.

If needed, the IPv4-compatible Metro command from `mobile/` is:

```powershell
node --dns-result-order=ipv4first node_modules/expo/bin/cli start --dev-client --localhost
```

## Architecture and preserved gates

The mobile app retains Firebase JavaScript Auth 12, AsyncStorage persistence and
its single canonical `users/{uid}` identity. Native Google account selection uses
`@react-native-google-signin/google-signin@17.0.0` (Expo-compatible, compiled with
SDK 57/RN 0.86.3 and the enabled New Architecture). No native Firebase SDK/app is
introduced. `google-auth-library@10.9.1`, already present transitively, is now an
explicit Functions dependency for server token verification.

Google ID tokens go to the `signInWithGoogle` callable. The server verifies their
Google signature, issuer, expiry, configured **Web client audience**, subject and
verified email. It resolves an existing Google provider binding, or provisions a
new Firebase Auth identity only for explicit registration. It then returns a
short-lived Firebase custom token for the confirmed UID. It never trusts a
client-supplied UID, email, role or approval flag, and never mints role claims.

This exchange is necessary because Firebase's normal trusted-provider sign-in
can automatically link/replace an email account. CallADoc deliberately avoids
`signInWithCredential` for initial Google login. Email collision is refused, not
merged. Existing accounts must be signed in with their current password, then
explicitly linked using Firebase `linkWithCredential` after password
reauthentication and a fresh native Google choice. The UI also requires matching
emails so an accidental link cannot change the existing email/password account.
Matching email alone is never proof of ownership: both credentials are required.

Auth provisioning is two steps (create, then provider binding). A new random
nonce and Google-subject fingerprint in the **new Auth UID** allow recovery of
only our own interrupted provisioning; ordinary same-email accounts are excluded.
Concurrent requests converge on the same bound UID. Tokens are not minted before
the binding is confirmed. There is no new Firestore mapping collection or
profile schema. Existing Google-linked UIDs, names, roles and approvals are kept.
After account deletion, fresh registration receives a new UID; retained records
under the deleted UID cannot be resurrected by signing in with the same Google
email. Tests exercise this behavior.

- Login never creates a new account. New users choose Patient/Doctor through the
  existing Sign up flow, then enter a full name and choose Google registration.
- Email/password inputs remain for email registration; Google does not require
  them. Optional gallery photos still use the secure avatar upload service and
  cannot block registration. External Google photo URLs are not copied into the
  canonical avatar system.
- Patient registration still requires server-validated privacy acknowledgement
  and an explicit sharing decision, including decline. Consent defaults remain
  unchecked. Existing consent, withdrawals and existing-user compatibility are
  unchanged; Google login never fabricates acknowledgement or consent.
- `completeRegistration` creates the canonical identity. Doctors remain pending
  until professional profile/credential submission and administrator approval.
  No Google claim grants clinical access. Existing identities are not rewritten
  to match a role selected on the registration screen.
- The existing registration gate keeps the form mounted while Auth/profile
  creation finishes. Uncertain registration retries the same Firebase UID. An
  interrupted app restart retains the existing safe recovery form.
- Firebase owns session persistence and restoration; native Google sessions are
  cleared after interactive operations and logout. No silent Google sign-in or
  Google refresh-token storage is used. Logout invalidates in-flight Google
  operations so a late result cannot restore the signed-out session.
- Google-only deletion performs Google credential reauthentication, checks the
  same UID and refreshes the Firebase token. Password accounts retain their
  existing deletion flow. Server recent-authentication, care/payment and retained
  record restrictions are unchanged.
- Disabled/deleting users are denied new server-exchange sessions. Existing MFA
  users are refused by the custom-token exchange, rather than bypassing their
  second factor. An MFA challenge UI is not implemented here.

The pre-existing Firebase initialization guard was missing its final `ready`
assignment. It is now set only after all initialization/connection calls succeed,
allowing healthy persistent Auth to survive module reload while still refusing
partial/mismatched initialization. Firebase project/host values were not changed.

## Actual development signing certificate

Retrieved from **`:app:signingReport`, variant `debug`**, using the existing
development signing configuration:

```text
Application ID: com.calladoc.app
SHA-1:   5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
SHA-256: FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

These certificate fingerprints are public configuration, not private keys.
They apply to the APK built here, not automatically to EAS/Play/release builds.
Do not generate replacement signing keys or change the application ID to fix
OAuth. Confirm any future build's actual signing report before registration.

## External setup — user action, development only

### Google Cloud Console

1. Select/create a **dedicated non-production Google Cloud project**. Do not use
   or modify CallADoc's production project. `demo-calladoc` is a local emulator
   project and cannot itself supply real Google OAuth clients.
2. Open **Google Auth Platform**. Configure **Branding** with a development app
   name and your actual support/developer contact. Do not invent contacts or
   publish the draft medical privacy notice as a legally approved policy.
3. Under **Audience**, select the appropriate user type (normally External), keep
   publishing status **Testing**, and add the specific Google account(s) used for
   testing as test users. Organizational Internal access works only for members
   of that organization.
4. Under **Data Access**, request only basic `openid`, email and profile. This
   implementation does not need Drive, Gmail, medical data scopes or offline
   access. OAuth account permission is separate from CallADoc medical consent.
5. Under **Clients**, create an **Android** OAuth client in that same project:
   package `com.calladoc.app`, SHA-1 exactly as above. SHA-256 is not a substitute
   for the Android OAuth client's SHA-1 field.
6. Create a **Web application** OAuth client in the same project. Its public
   `...apps.googleusercontent.com` ID is the ID used by both the native app and
   Functions. Do **not** use the Android client ID as `webClientId`. This native
   ID-token flow does not need an Expo browser redirect, JavaScript origin or
   redirect URI. Do not copy/store a Web OAuth client secret in the app.
7. Allow configuration propagation, then set the matching public IDs below.
   Real account selection and server certificate retrieval require internet,
   even though all Firebase application data stays in local emulators.

### Firebase Console

For the current **local `demo-calladoc` emulators**, no production provider
configuration, Google service-account key, live Firebase API key, or
`google-services.json` is needed. The Auth emulator supports the Google binding;
Google Cloud supplies the independently configured real OAuth identity proof.

If using a dedicated non-production Firebase project later, select that project
only, open **Project settings > General > Your apps**, register/verify the Android
application ID, and add **both** SHA-1 and SHA-256 under certificate fingerprints.
Open **Authentication > Sign-in method > Google**, enable Google and choose your
actual support email. Confirm that its Web client ID matches the client used by
the app/backend. This is required for real Firebase Google linking/reauthentication.
These are future external setup instructions, not changes performed here.

The custom server exchange is separately enabled by
`GOOGLE_SIGN_IN_WEB_CLIENT_ID`. To disable it, unset that backend setting;
disabling Firebase's Google provider alone is not a kill switch for a custom
token issuer. Review both controls before any future non-emulator rollout.

This app uses the JS Firebase SDK plus an explicit Web OAuth client ID. Android
Google SDK autolinking requires no second native Firebase app or Google Services
Gradle plugin. Do not add a live `google-services.json` or replace the existing
Firebase project settings just to enable native Google selection.

### Environment values

Configured in **`mobile/.env`**, retaining all existing settings:

```dotenv
EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=357773331749-5am7ck5kdh6rqiv81nvi3lcbacqs9lgp.apps.googleusercontent.com
```

The Firebase CLI loads **the same Web ID** from **`functions/.env.local`** only
when running emulators:

```dotenv
GOOGLE_SIGN_IN_WEB_CLIENT_ID=357773331749-5am7ck5kdh6rqiv81nvi3lcbacqs9lgp.apps.googleusercontent.com
```

Examples are in `mobile/.env.example` and `functions/.env.example`. These are
public client identifiers. No client secret, OAuth refresh token or service
account key belongs in Expo variables. Do not put real tokens in logs or tests.
Keep the existing Firebase emulator flag and connectivity configuration. A full
Metro/app reload is required after changing Expo environment variables.

For iOS later, also configure `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and its exact
reversed `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`. The Expo plugin is applied only when
that real scheme exists. iOS requires its own native build and is unverified.

## Build and local Android verification

A **new Android development client is required** for the new native module.
The generated APK already built successfully for `arm64-v8a,x86_64`; it includes
both Google Sign-In and the recent WebRTC in-call audio manager. No device was
uninstalled or cleared, and no existing consultation/account records were changed.

If Functions source changes later, build from the repository root; changing
the environment value alone does not require recompilation or an Android rebuild:

```powershell
Push-Location functions
npm.cmd run build
Pop-Location
```

Restart local emulators only using your existing data-preserving import/export
procedure. If they are already running, preserve/export their data before a
restart; never reset them for OAuth. The normal launch command at the root is:

```powershell
node functions/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --project demo-calladoc --only auth,firestore,functions,storage
```

Keep the Functions runtime on the project's configured Node 22 where available.
For the Android build, use the installed JDK 17; JBR 25 produced the existing
Prefab native-access-warning failure during the earlier audio checkpoint.

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
$env:NODE_ENV='development'
Push-Location mobile/android
.\gradlew.bat :app:assembleDebug '-PreactNativeArchitectures=arm64-v8a,x86_64'
# To retrieve fingerprints again without changing keys:
.\gradlew.bat :app:signingReport
Pop-Location

$adb="$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices -l
$serial='emulator-5554' # replace with A53's authorized serial for that device
& $adb -s $serial install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
# Existing default host 127.0.0.1 works on both devices through ADB reverse.
foreach ($port in @(8081,9099,8080,5001,9199)) {
 & $adb -s $serial reverse "tcp:$port" "tcp:$port"
}
Set-Location mobile
npx.cmd expo start --dev-client --localhost
```

In another terminal at the repository root, open the development client:

```powershell
$adb="$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$serial='emulator-5554'
& $adb -s $serial shell am start -a android.intent.action.VIEW -d 'calladoc://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' com.calladoc.app
```

If an existing environment explicitly uses `10.0.2.2` or a reachable LAN host,
retain it rather than changing networking for OAuth. Android needs Google Play
Services; use a Play-enabled emulator image and add a real test Google account
through Android's own settings. Never enter its password in a CallADoc field.

Manual checklist after external setup:

1. Sign up > Patient: full name, explicit privacy acknowledgement and sharing
   choice (decline is valid), then Continue with Google. Do not fill a CallADoc
   password. Confirm canonical profile/consent and Patient Home. Optional gallery
   photo upload should still work independently of registration success.
2. Close/reopen the app: Firebase restores the same UID and role before routing.
   Sign out: the signed-out flow remains signed out after restart. Google then
   offers an explicit account choice rather than silently restoring access.
3. Sign up > Doctor using a different test account: confirm pending verification
   and the credential-submission flow, never an approved clinical dashboard.
4. Existing email/password account: Google collision must not replace its UID or
   password. Sign in with the password, open Profile (or verification account
   controls for pending doctors), choose Link Google account, confirm password
   and the explicit dialog, then choose the matching Google email. Verify both
   sign-in methods still use the original UID/records. Cancel/wrong-account and
   already-linked-to-another-UID cases must not merge or move any records.
5. Cancel native selection, deny/revoke Google access, and interrupt networking.
   Confirm safe errors/no unintended account creation or role change. Confirm
   account switching/logout during selection does not restore a late session.
6. On an expendable synthetic Google-only account with no outstanding care or
   financial obligations, inspect deletion confirmation and Google reauth. Wrong
   Google choice/cancellation must not submit deletion. Execute deletion only
   when intentionally testing deletion, not solely for visual inspection.
7. Check light/dark layout, scrolling/keyboard, guest assistant, existing
   email/password login and the unchanged verification/clinical access gates.

`DEVELOPER_ERROR`/code 10 usually requires checking package, **actual installed
APK signing SHA**, matching Android/Web OAuth project, Web-vs-Android client ID,
test-user audience and propagation. Do not regenerate signing keys, weaken Auth
rules or switch Firebase to production to work around it.

## Test evidence and limitations

- Mobile TypeScript and Functions build: passed.
- Focused mobile tests: 245 distinct tests across 19 suites/focused runs, covering
  Google selection/cancellation, explicit linking, UID preservation, consent,
  onboarding, doctor restrictions, persistence, deletion, account switches,
  late logout and the WebRTC audio regression checks.
- Focused backend tests: 81 passed across six suites. Signed local RSA fixtures
  verify signature/audience/issuer/expiry rejection; Google certificate retrieval
  is mocked in tests only. Production code has **no fake-token/emulator bypass**.
- Isolated Auth/Firestore emulator integration: six passed. Includes real Firebase
  SDK linking/password login and Google-only reauthentication/provider metadata,
  canonical consent, pending-doctor authorization,
  concurrent registration, disabled/deleting rejection and new-UID registration
  after deletion. The server callable handlers run with synthetic signed IdP
  fixtures and mocked certificate distribution; this is **not real Google OAuth**
  or a device account-chooser/HTTPS callable transport test.
- Expo public configuration, native autolinking, development signing report and
  full ARM64+x86_64 debug APK: passed. WebRTC audio module is still autolinked.
- `git diff --check`: passed. Existing Firebase emulator mock tests were updated
  to assert the current default host, explicit overrides and initialization guard.
- Existing Jest Expo mock setup emits a logger warning when resetting modules;
  assertions pass. Initial stale-host/ready-marker and concurrency failures were
  corrected and the affected tests passed on rerun.
- Real Google account selection, Google/Cloud configuration, native session
  persistence, cancellation, linking and Google-only deletion on Pixel 7/A53
  remain pending. Metro and main Firebase emulators were unavailable during
  verification. No existing device session was signed out for UI inspection.

Google grant revocation is distinct from Firebase session revocation. Already
issued Firebase sessions are not instantly invalidated by revoking Google access;
use the established Firebase token-revocation/disabled-account process for a
security incident. ID/custom tokens are bearer credentials with finite lifetimes.
Disabled canonical identities and deletion tombstones continue denying protected
records even while a previously issued token has not expired. No tokens are
persisted by this Google integration or logged.

The native package's Original Google Sign-In Android API remains functional but
is deprecated upstream; plan a supported Credential Manager migration before
its retirement. iOS and MFA challenge UI are not claimed as verified/supported
by this Android checkpoint. Before any future non-emulator release, separately
review real-provider tests, release/Play signing fingerprints, HTTPS/App Check
and abuse protection, custom-token signing IAM (no downloaded service-account
keys), privacy/legal approval and the existing production launch requirements.
Nothing was deployed, staged, committed or pushed.

## Relevant files

- `functions/src/auth/googleSignIn.ts`, `googleSignInHandler.ts`, `src/index.ts`:
  verified exchange, explicit provider binding and callable export.
- `functions/package.json`, lockfile, `.env.example`: token verifier dependency
  and public backend audience configuration.
- `functions/__tests__/googleSignIn.test.ts`, `googleTokenVerification.test.ts`,
  `exportSurface.test.ts`: exchange/crypto/allowed-export checks.
- `functions/emulator-checks/googleAuth.test.ts`, `jest.google-emulator.config.js`,
  `firebase.google-test.json`: isolated demo-only integration fixtures/config.
- `mobile/src/services/googleAuth.ts`, `authService.ts`, `accountDeletion.ts`,
  `firebaseConfig.ts`: native interaction, canonical registration, linking,
  persistence-safe logout/deletion and the initialization-ready fix.
- `mobile/src/components/GoogleSignInButton.tsx`, `AccountConnections.tsx`,
  `AccountDeletion.tsx`, `screens/auth/AuthForm.tsx`: themed controls and safe flows.
- `mobile/src/screens/patient/PatientExperience.tsx`,
  `screens/doctor/DoctorWorkspace.tsx`, `SubmitVerificationScreen.tsx`:
  account-linking entry points, including pending doctors.
- `mobile/app.config.js`, `.env.example`, package/lockfile and
  `assets/google-g.png`: native integration and official Google logo.
- `mobile/__tests__/googleAuth.test.js`, `googleRegistration.test.js`,
  `googleAuthUI.test.js`, `accountConnections.test.js`, deletion service/UI tests
  and `firebaseEmulators.test.js`: focused regressions.

Sources: [Expo native Google authentication](https://docs.expo.dev/guides/google-authentication/),
[Google token verification](https://developers.google.com/identity/sign-in/android/backend-auth),
[Firebase automatic provider linking](https://firebase.google.com/docs/auth/users/),
[Firebase explicit linking](https://firebase.google.com/docs/auth/web/account-linking),
[native Google configuration](https://react-native-google-signin.github.io/docs/original).
