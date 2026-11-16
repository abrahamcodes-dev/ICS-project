# Hosted functional verification and privacy — Checkpoint 2

Date: 16 November 2026. Status: in progress; patient onboarding verified,
doctor onboarding required.

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

Subsequent patient result: the owner completed hosted email verification and
onboarding and reached the patient workspace. A focused, read-only server check
confirmed enabled/verified Auth, active canonical patient identity, matching bound
patient invitation/membership and future expiry. Stored patient consent is
`sharingDecision: declined`, `privacyAcknowledged: true`, revision 1, source
`registration`, document version `academic-demo-2026-11-15-v1`. No consent or
account record was changed by verification. Patient workspace access is a reported
manual app result; stored-state verification is an independent owner-IAM read,
not a patient-session authorization test. Profile editing, consent changes and
withdrawal, bookings and consultation workflows remain untested at this checkpoint.

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

## Doctor finalisation defect and approved recovery

Read-only diagnosis found an enabled, email-verified doctor Auth account, an
unexpired doctor invitation with no UID binding, and no canonical identity or
membership. The deployed registration callable was ACTIVE. The hosted doctor UI
dropped its notice choice when calling email registration/recovery; the service's
required-acknowledgement check rejected locally before the protected callable and
the generic registration-incomplete message hid that cause. Repeated APK retries
could not repair the missing argument.

The owner approved the existing private helper for recovery through the normal
protected finalisation callable. It now offers existing-doctor sign-in only, with
no account-creation action and no token-sharing option. Passwords/refresh tokens
and ID tokens are used only in browser memory for direct Firebase requests; helper
receipts whitelist role/email/notice acknowledgement and time, with no tokens.
Normal server email verification, invitation role/binding/expiry, notice and
canonical pending-doctor checks remain. At this evidence update owner interaction
was still pending; no completed doctor recovery or approval is claimed.

Local mobile fix: one shared registration-choice selection in AuthForm forwards
hosted doctor notice acknowledgement through email registration and recovery.
Google already forwarded that choice and now shares the same selection. Local
doctors keep an undefined optional choice; patient choices remain explicit. No
service/backend guards, Rules, dependencies or native files were changed.

Focused isolated Node 22 verification: six Jest suites, **62 unique tests passed**,
zero final failures/skips; mobile TypeScript passed. Initial run had 61 passes and
one existing cold-render UI timeout at five seconds. Only that suite was rerun
with the documented 30-second allowance: 12/12 passed (first render 2.28 seconds).
Assertions were unchanged; duplicate successful reruns are not counted. Coverage
includes hosted patient/doctor acknowledgement forwarding, pending-doctor recovery
without Auth account creation, missing acknowledgement, email verification and
server admission denials, Google forwarding and existing local/patient behavior.

A clearly labelled fictional medical-license PNG was prepared outside Git and
copied to Pixel 7 Downloads as `calladoc-synthetic-doctor-credential.png`. It is
not a real professional credential. No hosted upload or approval was performed.
After recovery verification, normal profile/draft, medical-license upload,
submission and administrator evidence review must precede approval. The installed
APK still contains the registration UI bug; this fix requires the later approved
replacement build and is not represented as shipped.

No new application/dependency/native changes, deployment, APK rebuild, database
reset, account deletion or push occurred during this checkpoint preparation.
The previously verified Phase 3B source/tests and Phase 3C evidence are committed
as the owner-approved baseline before further functional or privacy changes.
