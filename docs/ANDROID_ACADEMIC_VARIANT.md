# Separate Android academic-demo configuration

Select `CALLADOC_APP_VARIANT=academic-demo` for both hosted configuration/build and
its Metro session. Unset the variable (or use `local`) for the existing local app.
Unknown values fail configuration evaluation. This selector does not set Firebase
credentials or change runtime mode: hosted public configuration must separately
use `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=false` and project `calladoc-academic-demo`.

| Setting | Local default | Hosted Android demo |
| --- | --- | --- |
| Package | com.calladoc.app | com.calladoc.app.demo |
| Display name | CallADoc | CallADoc Demo |
| Expo slug | calladoc | calladoc-demo |
| App URL scheme | calladoc | calladoc-demo |
| Generated dev-client scheme | exp+calladoc | exp+calladoc-demo |

The hosted slug makes the generated dev-client scheme distinct without adding a
plugin or changing dependencies. Use the matching scheme when launching Metro;
do not reuse local QR/deep links for the hosted app. Navigation does not currently
configure an application deep-link router. Native Google Sign-In uses Google Play
services and an explicit Web client ID, not either app URL scheme.

The Android-only change leaves iOS bundleIdentifier untouched; this does not prepare
side-by-side iOS builds. Existing camera/audio permissions, WebRTC/PDF/image-picker
plugins, private-PDF provider removal and conditional Google iOS plugin are retained.
Blob-util's provider authority derives from `${applicationId}`, not a fixed package.
No package literal was found in application services that needs renaming.

## Firebase and Google Console

1. Select `calladoc-academic-demo` → Project settings → General → Add app → Android.
2. Register package **com.calladoc.app.demo**, nickname **CallADoc Demo**. Keep the
   existing com.calladoc.app registration and all existing OAuth clients.
3. Add this existing signing certificate's SHA-1 and SHA-256:

```text
SHA-1: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
SHA-256: FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
```

4. Confirm an Android OAuth client exists in this Google Cloud project for the new
   package and SHA-1. If Firebase does not create it, create an OAuth client of
   type Android with that exact pair; do not delete the conflicting old client.
5. Download the newly registered app's google-services.json and verify project ID,
   storage bucket and the com.calladoc.app.demo client entry. Keep it separate from
   the original download. The previous download targets com.calladoc.app and is
   not the hosted variant's registration file.
6. Keep using the same project's OAuth **Web** client as the token audience:
   `307695796194-48q9nusdb0tqp0dj1g7cm3j9365bgg81.apps.googleusercontent.com`.
   Confirm it remains the Web client in Console; set it later in the hosted mobile
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and backend GOOGLE_SIGN_IN_WEB_CLIENT_ID.
   An Android client ID is not a replacement for that Web audience. If OAuth is
   External/Testing, admit the dedicated Google test accounts in its audience.

## Native build and data safeguards

Configuration selection alone does not rename the existing generated Android
project: its Gradle applicationId remains com.calladoc.app. Do not run Gradle in
that tree expecting a hosted APK. A later approved hosted build must generate
Android in a separate disposable copy using the selected Expo configuration,
starting from a fresh native tree rather than reusing the local Android directory
(Expo preserves old URL schemes on incremental native configuration),
retain all native plugins/required settings, and explicitly reuse the current
mobile/android/app/debug.keystore. Verify the new manifest, autolinking, package
names, permissions, provider removal and APK signing fingerprints before install.
Do not assume a freshly generated keystore or future EAS signing matches this one.

No prebuild, native regeneration, APK build/install, private environment overwrite,
OAuth deletion or Firebase deployment is performed in this preparation. Keep the
local installation and its data. Distinct package IDs permit separate installs;
use separate Metro sessions/ports and explicit matching launch schemes rather than
changing the running local demo's environment. Membership/blocking triggers and
the other Phase 3B prerequisites still apply before any hosted testing.

## Configuration verification

Node 22.23.3 in-memory evaluation confirmed the default and explicit-local configs
equal the committed local config exactly. Hosted selection changes only name,
slug, scheme and android.package; unsupported selectors reject. The plugin list,
permissions and iOS bundle identifier are identical.

Installed Expo read-only plugin introspection passed for local and hosted selection.
Against an empty temporary native directory it produced only calladoc-demo and
exp+calladoc-demo schemes and retained the private-PDF provider removal; no native
files were generated. Introspection against the existing local native tree also
confirmed that its old schemes would accumulate, which is why fresh generation is
required later. Gradle, AndroidManifest.xml and signing-keystore hashes were unchanged.
The existing automatic-appearance advisory about missing expo-system-ui remains;
no dependency was added. Runtime Google Sign-In and the final signed APK remain
unverified until the separately approved build and hosted smoke-test phases.
