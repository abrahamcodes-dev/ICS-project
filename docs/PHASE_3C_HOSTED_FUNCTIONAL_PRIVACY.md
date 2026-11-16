# Hosted functional verification and privacy — Checkpoint 2

Date: 16 November 2026. Status: in progress; tester onboarding required.

## Confirmed starting point

- Owner manually verified hosted administrator authentication, administrator
  workspace and empty doctor-verification queue in the installed standalone APK.
- Pixel 7 currently uses simulated cellular connectivity after Wi-Fi DNS issues.
  Preserve this working configuration; no repeated APK build or administrator
  authentication investigation is required.
- A focused owner-IAM read of only the two approved synthetic tester identities
  found neither Auth account, canonical profile nor tester membership yet. Both
  role-specific invitations remain enabled, unexpired and correctly assigned.
  This read created or changed no cloud records. Personal account details remain
  in private owner configuration outside Git.

## Next functional steps

1. Account holders register the approved patient and doctor accounts in CallADoc
   Demo, choose their own passwords, verify actual mailboxes and acknowledge the
   hosted notice. Patient optional sharing is a separate explicit choice.
2. Verify canonical role and admission binding after registration. Doctor must
   remain pending until synthetic profile/credentials are submitted and the
   administrator reviews them through the normal workflow.
3. Configure the approved synthetic doctor's fee and future availability through
   existing mechanisms, then verify patient directory and slot discovery.
4. Exercise hosted scheduling and server-controlled simulated payment flows with
   synthetic records, preserving retry IDs and recording actual outcomes.
5. Verify privacy choices, participant/document access and logout/restart behavior
   against these actual hosted fixtures. Do not delete the approved accounts,
   revoke their access or run destructive deletion checks without an agreed fixture
   and recovery plan. Do not migrate local emulator records into the hosted project.

The owner subsequently supplied the checkpoint requirements. Additional required
coverage includes consultation text/attachments/prescriptions, ratings, chatbot,
in-app notifications and voice/video only when two suitable clients are available.
Actual hosted application results must remain distinct from backend test evidence.
The right-to-be-forgotten audit must cover Auth/session revocation, Firestore and
Storage cleanup, withdrawal restrictions, retries/recovery/idempotency, retained
records' purposes/access/disposal and accurate patient notices. Use an isolated
synthetic emulator account, never the approved hosted accounts, for deletion tests.
Targeted fixes are authorized locally with focused tests; no new deployment or APK
rebuild is approved. Native FCM diagnosis is in scope, but localisation and
connectivity enhancements are deferred. These are pending checks, not passes.

## Focused privacy observations

- Installed hosted package reports ALLOW_BACKUP; generated Android manifest uses
  android:allowBackup=true. Backup eligibility is a confirmed configuration gap
  for review. No claim is made that a backup was actually taken or that disabling
  backup would erase an already existing copy. The installed APK is unchanged.
- Hosted notice distinguishes academic/synthetic testing, cloud processing,
  restricted admission, optional sharing, simulated payments and deletion limits.
  Patient controls state that medical-record sharing remains disabled for every
  preference. Runtime consent behavior still requires patient registration.
- Account deletion copy describes retained shared/audit/payment records rather
  than complete erasure. Its assistance alert still says retention/support are
  unconfigured, while the hosted project has private owner-approved dates; that
  hosted wording needs review. No support contact should be invented.
- Prior admission/Rules and administrator authorization results remain historical
  evidence; they were not rerun or relabelled as new patient/doctor acceptance.

No new application/dependency/native changes, deployment, APK rebuild, database
reset, account deletion or push occurred during this checkpoint preparation.
The previously verified Phase 3B source/tests and Phase 3C evidence are committed
as the owner-approved baseline before further functional or privacy changes.
