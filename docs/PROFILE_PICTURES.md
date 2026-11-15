# PP-1 — Optional profile pictures

## Status

Source implementation and focused automated validation complete. **PARTIAL: Android gallery selection, native resizing, upload, relaunch persistence and removal require a rebuilt development client and device verification.** No deployment or native build was performed.

## Workflow and limits

Patients and doctors may select a photo during registration. Registration uses the existing canonical identity flow and succeeds independently of the subsequent photo upload. Failed optional uploads can be retried from the profile editor. Pending doctors retain access through their verification screen; photos never confer clinical approval.

The profile editor supports selection, preview, cancellation, save, reload, retry of a completed pending upload, replacement and removal. Directory/profile avatars use initials on missing images or failed reads. Mounted avatar views refresh after confirmed changes. Logout/identity refresh invalidates sessions, cancels active upload tasks and prevents late results being applied. Local normalized files are removed on cancellation, completion and teardown, best effort.

Gallery only; no camera capture. JPEG, PNG and HEIC/HEIF inputs are accepted when the picker provides MIME, size and dimensions. Inputs are limited to 20 MiB and 40 megapixels. Native normalization produces JPEG at no more than 512 pixels per dimension, quality 0.7, and 256 KiB. Oversized/unsupported images are rejected. Missing size information fails closed.

## Backend and security

- `changeProfileAvatar`: authenticated canonical active patient/doctor; prepare/finalize/remove operations with `expectedRevision`.
- `getProfileAvatar`: owner read, or an authenticated active patient/doctor reading a currently approved doctor's photo. Cross-patient reads and administrator/claim-only access are not granted.
- Canonical avatar state: `users/{uid}/avatar/state`, controlled only by backend. Fields: `revision`, `current`, `generation`, `pending`, `expiresAt`, `retired`.
- Objects: `avatars/{uid}/{serverUUID}/image.jpg`. Storage permits only the canonical owner's first upload to the matching unexpired 15-minute slot. JPEG MIME, nonzero size through 256 KiB, and no client custom metadata are required. Reads, lists, overwrites, metadata changes and deletes are denied to clients.
- Finalization validates JPEG markers, dimensions and metadata exclusions, pins the object generation, and atomically switches the current reference. This is header validation, not a complete server-side image decoder or malware scanner. Native re-encoding still needs Android verification.
- Doctor projection child: `doctorPublicProfiles/{uid}/avatar/current` contains only avatar ID, generation and revision. It cannot be read or written directly by clients. Existing parent approval snapshots and credential schemas remain unchanged. Callable reads revalidate the full current approval binding using decoded Firestore timestamps.
- Images are returned as bounded JPEG data URIs through authenticated callables. No `getDownloadURL`, public URL or public Storage read is used. Firebase-generated download tokens are removed before a reference is published.
- Patient identity fields, professional registration details and credential documents are never included in avatar responses. Firestore Rules and existing credential Storage permissions are unchanged.

## Recovery and limitations

Old references remain current until finalization succeeds. Finalization replay of the same current upload is idempotent; revision conflicts require reload. A superseded or expired upload cannot be finalized. Uploaded-but-unconfirmed files can be finalized through pending-upload recovery; incomplete/expired uploads require a fresh selection or removal.

Retired object deletion is best effort and failed deletions remain recorded for the next mutation. An abandoned pending slot or failed cleanup may retain an inaccessible object until the owner returns; there is **no scheduled garbage collector**. Process termination can also leave native cache files for OS cleanup. Do not claim guaranteed immediate physical deletion after a crash or prolonged outage. Rapid/in-flight replacement races still need emulator/native end-to-end validation beyond mocked transaction tests.

Callable image delivery trades public URLs for extra backend reads/bandwidth. Avatar bytes are not deliberately persisted in a client cache; visible images already delivered cannot be remotely revoked. Native image-cache behavior and memory usage need device verification.

## Dependencies and native configuration

Installed with `npx expo install expo-image-picker expo-image-manipulator`:

- `expo-image-picker` **57.0.20**
- `expo-image-manipulator` **57.0.21**

The picker plugin supplies the photo-library usage description. Existing consultation camera/microphone permissions are preserved: setting these plugin options to `false` would block WebRTC permissions globally. Existing external-storage blocks remain intact. No gallery camera action was added. Expo introspection passed and retained `com.calladoc.app`.

The existing APK cannot establish native compatibility for newly installed modules. Rebuild using the documented JDK 17 Android development-build procedure before testing. No generated Android files were changed in this checkpoint.

## Executed validation

- Functions TypeScript build: PASS.
- `npm --prefix functions test -- --runInBand avatars.test.ts exportSurface.test.ts`: **31/31 PASS**.
- Avatar Firestore/Storage emulator security tests: **12/12 PASS** after adding the explicit `resource == null` immutable-create guard.
- Existing credential Storage suite: **56/56 PASS**, executed alongside the initial avatar suite. It was not rerun after the avatar-only guard correction.
- Mobile TypeScript: PASS.
- `npm --prefix mobile test -- --runInBand avatarService.test.js avatarUI.test.js`: **25/25 PASS**.
- Existing auth, patient experience and doctor workspace tests: **30/30 PASS**. Doctor workspace fixtures emit duplicate-key warnings; no unrelated UI changes were made to address them.
- Expo configuration introspection: PASS; native compilation/runtime not tested.
- Git whitespace validation: PASS.

Initial failures were resolved: Jest dynamic-import handling, missing immutable-create guard, and Firestore timestamp conversion in approved-doctor reads. Isolated emulator runs used `demo-calladoc-credentials` on Firestore 8095 and Storage 9195, Node 22 and the existing JBR runtime. Emulator tooling emitted Java deprecation warnings. Dependency installation reported 21 audit findings (9 moderate, 12 high); no audit fix or unrelated upgrades were performed.

## Android acceptance checklist

1. Rebuild the development client with the new Expo modules using JDK 17. Start the current Functions build and demo Auth/Firestore/Functions/Storage services using `docs/ANDROID_INTEGRATION_TEST_PLAN.md`; restart Functions after building so the two avatar exports are available.
2. Use only `demo-calladoc` and synthetic photos. Register a patient and doctor without pictures; confirm unchanged account/role behavior.
3. Select a gallery image, cancel, then select/save. Confirm crop/compression, fallback/error messaging and no camera-capture flow.
4. Register with a selected image. Interrupt connectivity during upload: account creation must still succeed; restore connectivity and recover or replace from the profile.
5. Relaunch/sign in: verify persistence. Replace and remove; check current references and cleanup queue in local emulators.
6. Approve the synthetic doctor through the existing workflow. Verify the doctor's image appears in patient discovery without professional credential leakage. A pending/rejected doctor must not acquire directory visibility through a photo.
7. Switch accounts/logout during upload and reads; verify no previous account image or late update appears. Test large/unsupported images and missing/deleted remote objects.
8. Check existing voice/video permission behavior after rebuilding. Collect actual screenshots, emulator results and any native errors; do not equate unit tests with device verification.

## PP-1 files

- `functions/src/profiles/avatarPolicy.ts`
- `functions/src/profiles/avatarCallables.ts`
- `functions/src/index.ts`
- `functions/storage.rules`
- `functions/__tests__/avatars.test.ts`
- `functions/__tests__/storage/avatars.storage.test.ts`
- `functions/__tests__/exportSurface.test.ts`
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/app.config.js`
- `mobile/src/services/avatarService.ts`
- `mobile/src/components/ProfileAvatar.tsx`
- `mobile/src/screens/auth/AuthForm.tsx`
- `mobile/src/screens/doctor/DoctorWorkspace.tsx`
- `mobile/src/screens/doctor/SubmitVerificationScreen.tsx`
- `mobile/src/screens/patient/PatientExperience.tsx`
- `mobile/src/screens/patient/PatientMenu.tsx`
- `mobile/src/screens/patient/PatientScheduling.tsx`
- `mobile/src/screens/patient/BookAppointmentScreen.tsx`
- `mobile/__tests__/avatarService.test.js`
- `mobile/__tests__/avatarUI.test.js`
- `docs/PROFILE_PICTURES.md`

Several edited screens already contained unrelated UI work; that work is preserved. No staging, commit, push or deployment was performed.
