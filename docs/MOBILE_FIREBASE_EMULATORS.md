# Android development Firebase emulators

The opt-in `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true` selects fixed synthetic
configuration for **demo-calladoc**. Existing live `.env` values are ignored in this
mode, not overwritten. Production builds reject the flag before initializing Firebase.
Only Android is supported; this mode is specifically for Android Studio emulators,
not physical Android devices or iOS. No host override or production fallback exists.

All connections are synchronous during firebaseConfig module evaluation, before
dependent services run: Auth 9099, Firestore 8080, Functions us-central1 5001 and
Storage 9199. Existing getFunctions(app) calls retrieve the same connected default
region instance. Fast Refresh reuses only a matching, fully initialized instance;
mode changes, project mismatch or partial initialization require a full app reload.
Do not import SDK instances separately before firebaseConfig initialization.

## Run locally

Keep the suite bound to **127.0.0.1**. Android Studio's **10.0.2.2** is an alias for
the Windows host loopback interface; binding to 0.0.0.0 is unnecessary. Do not open
LAN firewall ports for this workflow. Official references:
[Android networking](https://developer.android.com/studio/run/emulator-networking-address)
and [Firebase Functions emulator](https://firebase.google.com/docs/emulator-suite/connect_functions).

Ensure the running suite uses `demo-calladoc` (not the live default in .firebaserc).
If starting it separately, use the existing configuration and explicit project:

```powershell
firebase emulators:start --project demo-calladoc --only auth,firestore,functions,storage
```

Build Functions with the repository's documented Node 22 runtime before starting
the suite when compiled output is stale. Do not deploy. The automated integration
suite uses a different demo project and different ports; do not repoint that suite.

Start Metro in another PowerShell window without changing any existing .env values:

```powershell
cd mobile
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = 'true'
npx expo start --dev-client --clear
```

Fully close/reopen the Android development app and connect it to this Metro session.
Use only synthetic emulator accounts/data. Existing live accounts are not imported.
The suite must contain the required callables and compatible rules; canonical users,
doctor approval and appointment eligibility remain required. UI sign-up uses the
local Auth and completeRegistration callable. Emulator outages cause failures; they
never cause automatic production fallback. This integration does not seed data.

When finished, stop that Metro session and remove the process-local variable:
`Remove-Item Env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS`. Restart Metro and fully reload
the app to change modes. Normal mode retains the existing environment configuration.

No emulator interface, Firebase production configuration, credentials, rules or
business logic are changed. Unit tests verify initialization/isolation; Android
runtime connectivity and two-device calling need separate verification. HTTP emulator
traffic requires the existing development build's local cleartext networking support;
do not weaken release networking settings to troubleshoot it.
