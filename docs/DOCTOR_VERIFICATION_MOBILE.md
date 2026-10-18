# Checkpoint 9A: doctor verification mobile workflow

## Scope and authorization

Active canonical pending/rejected doctors enter `SubmitVerificationScreen` from
`RootNavigator`, outside the clinical navigator. Patients, administrators, disabled
accounts and approved doctors cannot use this submission screen. Backend identity,
revision and workflow checks remain authoritative. Refresh status after review;
approval returns the doctor to the existing clinical navigator.

No backend, rules, deployment, approval bypass or production configuration changes
are part of this increment. Use synthetic documents with the local emulators.

## Profile, upload and submission

- `saveDoctorProfileDraft` accepts professionalName, specialty, registrationNumber,
  issuingAuthority and optional phoneNumber. Drafts can be incomplete; submission
  requires all four professional fields. Saves replace editable fields. The UI
  reloads the server-assigned revision before submission.
- `prepareDoctorCredential` receives category, contentType and sizeBytes. The
  picker accepts PDF/JPEG/PNG, 1 byte through 5 MiB. Categories are medical_license,
  professional_certificate, identity_document and other_supporting_document.
- The selected binary is uploaded using Firebase Storage to the exact returned
  `doctorCredentials/{uid}/{credentialId}/document` path, with the declared MIME
  type and no custom metadata. No download URL is generated. Storage rules prevent
  overwrite and enforce the 15-minute prepared-slot expiry.
- `finalizeDoctorCredential({credentialId})` verifies the stored object. Only then
  is the credential added to the submission selection. Upload progress is shown;
  leaving the screen cancels active uploads and blocks subsequent client steps.
- `submitDoctorVerification({expectedRevision, credentialIds})` uses the saved
  revision and 1–5 credentials, including a medical license. Exact retries reuse
  the same revision/selection; the backend controls idempotency. A lost response
  can be recovered by refreshing the active request on the doctor profile.
- Submitted drafts are locked. After rejection, correct/save the professional
  draft and upload fresh evidence. An unchanged save does not advance revision.
  Old attached evidence cannot be reused for a new submission.

## Recovery and limitations

Only individual authorized document gets are used; no credential/request collection
queries or direct Firestore writes are introduced. Saved drafts and active requests
reload from the doctor's own profile. Known credential IDs allow retrying finalization
after a successful upload whose finalization failed. Expired incomplete uploads
require a fresh selection and slot; files cannot be overwritten.

Recovery IDs are shown in selectable text. Keep them privately if you need recovery
after restarting. This increment does not add persistent local credential storage.
The backend profile does not retain a rejected-request pointer; rejected history
after a restart requires a known request ID. The UI can display the rejection reason
on that authorized document. Lost IDs cannot be rediscovered by collection queries.
Removing a credential from the selection does not delete the server file.

The system picker copies the selected document into the app cache so it can be read
for upload. No additional file-system dependency or explicit cache purge is added;
use synthetic documents for demonstration. MIME/size checks do not establish the
authenticity of qualifications. Administrative review remains a separate workflow.

`expo-document-picker@57.0.3` requires a rebuilt development client. TypeScript and
mocked tests do not verify native selection or real Storage uploads. Checkpoint 9A
is not fully verified until the Android emulator workflow succeeds.

## Android and local-emulator demonstration

1. Build the Android development client with the installed SDK/JDK and install the
   resulting debug APK. An older APK without ExpoDocumentPicker is insufficient.
2. Build Functions with the documented Node 22 runtime. Start the local suite with
   `firebase emulators:start --project demo-calladoc --only auth,firestore,functions,storage`.
   Keep the services on loopback; Android Studio reaches them at 10.0.2.2.
3. In a separate PowerShell window, run:

   ```powershell
   cd mobile
   $env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS = 'true'
   npx expo start --dev-client --clear
   ```

   Fully reload the development client. Do not modify live `.env` values. See
   `MOBILE_FIREBASE_EMULATORS.md` for isolation details.
4. Register a synthetic doctor through the existing registration form. Confirm
   verification is accessible and clinical tabs are not.
5. Save an incomplete draft, leave/reopen, then complete the four required fields.
   Save again. Select a synthetic medical-license PDF/JPEG/PNG from Android Files.
6. Verify upload progress, ready status and recovery ID. Test invalid type/size,
   cancellation, network failure and recovery by known ID. Expired unfinished slots
   must fail rather than overwrite an existing object.
7. Submit. Inspect the local emulator's request, attached credentials and profile
   activeRequestId. Confirm repeated attempts cannot create competing requests.
8. Review only through an authorized local administrator workflow. Refresh the
   doctor screen; verify rejection details by known request ID, correction/new
   evidence resubmission, and clinical navigation only after actual approval.
9. Test logout/unmount during upload and switching accounts. Confirm no old
   credential state appears for another account. Never use real patient documents.

No administrator interface/provisioning, Firebase deployment or emulator launch is
performed by this implementation.
