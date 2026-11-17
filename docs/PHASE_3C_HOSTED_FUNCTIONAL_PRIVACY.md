# Hosted functional verification and privacy — Checkpoint 2

Current-state correction (17 November 2026 release): the patient consent is **granted, revision 5**, recorded through the profile at **09:09:41 EAT**. The owner approved preserving that exact revision. References below to registration revision 1 and declined sharing describe earlier checkpoints and must not be used as the current release state. Any later summaries that carried "declined" forward were incorrect. Optional medical-record reading remains disabled for every preference; the grant does not broaden the implemented appointment summary or consultation-document authorization. See `POST_CONSULTATION_FIXES.md` for the corrected access scope and release evidence. The older APK acceptance notes are preserved as historical evidence, not a current consent assertion.

Date: 16 November 2026. Status: in progress; patient onboarding verified,
doctor approved through normal administrator review; fee/availability setup pending.

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
canonical pending-doctor checks remain. The owner subsequently completed recovery.
An independent read confirmed enabled/verified Auth, active canonical doctor role,
pending verification, matching UID/doctor-role invitation and membership, active
expiry and recorded hosted notice acknowledgement. No administrator claim exists.
No doctor approval was granted. Credential submission and administrator review
remain the next manual steps; this confirmation is not evidence of clinical access.

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

## Submitted doctor profile read failure

Owner reported a ready synthetic medical license followed by a permission message
and a blank/disabled form after attempting submission. Read-only hosted inspection
confirmed the professional draft's four fields and revision 1 remain intact,
activeRequestId is bound to one submitted verification request, and its medical
license is attached to that request. Storage metadata confirms the object still
exists with matching generation, content type and size. Auth remains verified and
enabled, canonical doctor remains active/pending, admission is bound/unexpired and
notice is recorded. No administrator claim or approval was granted.

Cloud Run callable logs show HTTP 200 for draft save, credential finalization and
verification submission. The submission transaction created the submitted request;
this is not a failed submission and is not grounds to upload or submit again.

Exact reproduced denied operation: direct Firestore get of the submitted owner's
doctorProfiles document under generated hosted Rules. The same read passes for
the editable draft, then fails after activeRequestId becomes a valid UUID with
"maximum of 1000 expressions to evaluate has been reached". Own identity,
attached-credential and submitted-request reads pass in that reproduction. Mobile
load/reload uses this profile get; a failed initial load leaves loaded=false and
the form blank/disabled. Its generic permission mapping makes the successful
submission appear failed. Callable logs do not log individual subsequent client
SDK reads; the isolated Rules reproduction establishes the specific failure rather
than attributing an unobserved client request to a separate callable.

Local fix: doctorOwner caches currentIdentity and delegates the same canonical,
active-status, verification-state, string and calendar validation to the existing
workflowIdentity predicate, retaining explicit ownership/existence and doctor-role
checks. Admission checks and all document validators remain unchanged. No approval
requirement was added to pending-doctor onboarding, and no security checks were
removed to avoid the expression limit.

Focused final results: 3 hosted post-submission owner-read regressions passed
(22 unrelated academic tests deliberately filtered/skipped), plus 41 doctor-profile
authorization Rules tests passed; two suites, 44 selected tests, zero final failures.
Before the fix, the profile regression failed with the expression-limit error while
the credential/request cases passed. Tests used isolated demo projects/ports and
synthetic fixtures; hosted records and the interactive emulator data were not used
as writable test fixtures. The academic emulator runner now accepts an optional
validated test-name filter while retaining all project/port/source safety checks.
Runner syntax and Git whitespace checks passed. No backend deployment, Rules
deployment, APK rebuild, data repair or new commit was performed during diagnosis.

Minimum recovery pending owner approval: deploy only the reviewed Firestore Rules
artifact to calladoc-academic-demo through the existing clean-release safeguards,
then use Refresh status and draft or reopen the hosted application. The original
request must remain submitted and its credential attached; no duplicate submission
or reupload is needed. Normal administrator review/approval remains a separate
explicit workflow. A Rules-only deployment does not require rebuilding the APK.

## Deferred final UI polish

Owner reported Android navigation header/status-bar overlap. Record for the final
UI polish checkpoint: inspect safe-area/header insets and verify on the existing
Pixel 7. No navigation layout change, visual verification claim or APK rebuild was
made during this submission diagnosis.

## Approved Firestore Rules-only deployment

Owner approved deployment after complete affected suites, rollback preservation,
live authorization verification and a separate commit. Complete final isolated
results: doctor-profile and verification domain Rules 2 suites / 79 tests passed;
full hosted academic admission/Rules suite 1 suite / 25 tests passed. Total:
**3 suites / 104 tests passed, zero failed/skipped**, including every previously
filtered academic test. No mobile or unrelated backend suites were rerun.

The existing hosted source matched the reviewed baseline. Comparing generated
artifacts proved the only source difference was doctorOwner. A disposable verified
release reused unchanged runtime inventory; only firestore.rules changed hash.
A missing local indexes artifact was recovered from the tracked file only after
its hash matched the previous inventory; indexes were not deployed. Existing
inventory, exact-project and deployment-directory/environment guards all passed.

Command: Firebase CLI `deploy --only firestore:rules --project
calladoc-academic-demo --config firebase.json --non-interactive` from the verified
disposable release. Compilation and deployment succeeded. No Functions, Storage
Rules, indexes, application records or approval decisions were deployed/changed.

Published Ruleset: `805b25d1-ff8a-442d-8c1f-3ca15b7d0c4c`.
Previous Ruleset: `eab70454-03a6-432b-9891-6c0e3aa71619`.
The published source was re-read from the Firebase Rules API and matched the
reviewed artifact exactly (normalizing line endings); artifact SHA-256:
`33b59fd8f33db16b05571d21bac9ff9dbeca666e20d66d215ad56e900dadcb1e`.

Previous release metadata, full previous Ruleset/source, deployed source,
verification receipt and authenticated release-switch rollback instructions are
preserved outside Git under `%USERPROFILE%/CallADoc-checkpoints/checkpoint-2/`
in the folder named for the new Ruleset. Rollback repoints only this project's
cloud.firestore release to the saved previous Ruleset; it requires owner approval.

Live doctor-session verification passed all six checks: own canonical identity,
professional profile and submitted request each returned HTTP 200; anonymous and
cross-owner profile reads and pending-doctor clinical availability each returned
HTTP 403. The private receipt contains result metadata only, not session tokens.
The owner separately confirmed the native doctor screen refreshed successfully
and restored the saved professional details and submitted verification request.
The existing Rules fix is committed as 3ea4b7d; no duplicate source commit or
successful-suite rerun is needed. Normal administrator evidence review and
approval remain pending; no reupload, resubmission or programmatic approval occurred.
An independent anonymous direct read of the hosted submitted request was rejected
with HTTP 403 after deployment; no record mutation was attempted.
A verified loopback page performs six read-only checks: pending canonical identity,
own professional profile, own submitted request, anonymous denial, cross-owner
profile denial and pending-doctor clinical-availability denial. Passwords/tokens
are not persisted or sent to the helper; only non-secret result metadata is saved.
No IAM-bypassing read is counted as successful client Rules authorization.

## Normal administrator approval confirmed

Owner manually opened the submitted synthetic license in the native administrator
viewer, confirmed its fictional academic-test markings, and approved through the
normal confirmation flow. Read-only stored-state verification confirmed active,
email-verified canonical doctor status approved; the request is approved with its
reviewer bound to the approved administrator. The approved audit actor, request,
doctor and review timestamp match. The draft activeRequestId is cleared, its
approvedRequestId is bound, and the published professional profile and revision
match the reviewed request. Admission remains active and no administrator custom
claim was granted to the doctor. No account or approval record was edited by the
verification tool. Fee is not yet configured and no availability days exist.

These bindings establish server eligibility for approved-doctor clinical routes;
native doctor sign-in/route transition and actual scheduling/payment operations
must still be observed. Next owner action: sign out of administrator, sign into
the existing doctor account, save the synthetic consultation fee from Profile,
then save future availability through Manage Availability. No repeat submission,
credential upload or approval is required. The earlier read-only helper expected
a pending doctor and must not be rerun as an approval test after this transition.

No new application/dependency/native changes, deployment, APK rebuild, database
reset, account deletion or push occurred during this checkpoint preparation.
The previously verified Phase 3B source/tests and Phase 3C evidence are committed
as the owner-approved baseline before further functional or privacy changes.

## Patient booking profile-read blocker (16 November 2026)

Owner confirmed native approved-doctor workspace access and successful saves of
KES 1,500 per 30 minutes and 17 November 09:00–17:00 Africa/Nairobi availability.
Read-only hosted inspection independently confirmed fee amountMinor 150000,
currency KES, demo true, revision 1; availability revision 1 covers 06:00–14:00 UTC.
No booking or payment has been confirmed yet.

The patient profile screen first awaits `getPatientDoctor`, which performs a
direct `getDoc(doctorPublicProfiles/{doctorId})`; only after that succeeds does it
call `getAvailableAppointmentTimes`. Its generic eligibility error conflates
Firestore and callable permission failures. Read-only hosted inspection confirms
verified, enabled patient Auth, active canonical patient identity, active bound
invitation/membership, current academic notice acknowledgement, and optional
medical-record sharing declined. Declined sharing is not a booking prerequisite.
No available-times service invocation was found in the queried post-17:00 UTC
log window; this absence is supporting evidence, not a captured client error.

The published Rules source was read back and matched the committed pre-fix
hosted Rules exactly (ruleset 805b25d1-ff8a-442d-8c1f-3ca15b7d0c4c). An isolated
admitted-patient/approved-doctor direct-read reproduction failed with Firebase
permission denial and the Rules evaluator's explicit "maximum of 1000
expressions" error at the public-profile allow boundary. Binding the caller
identity alone remained insufficient. The local fix additionally expresses the
same ten doctor/approval-source bindings as tuple equality; identity schemas,
calendar/string validation, active/approved checks and hosted admission remain.
The regression then passed. No mobile change is needed for this Rules correction.

The affected academic suite passes 41/41, including twelve new negative cases:
anonymous/unverified readers, revoked/expired membership, disabled/malformed
patient or doctor identities, pending doctor, mismatched approval/publication,
and direct writes. The complete affected appointment-read/domain Rules suite
also passes 75/75 (unchanged since that execution): final total two suites,
116 passed, zero failed or skipped. The three added role-boundary cases confirm
eligible patient, doctor and administrator public-profile gets; deny collection
listing, other doctors' private drafts and private admission records; deny
patient/unrelated-doctor credential and verification reads; and preserve normal
administrator credential/verification review access.
Neither final log contains a 1000-expression exhaustion error. Whitespace checks
pass. Isolated projects/ports were used; interactive emulator data
was not cleared. The private localhost patient helper captured the actual hosted
responses at 18:59:49 UTC: own identity HTTP 200; public doctor profile HTTP 403,
PERMISSION_DENIED ("Missing or insufficient permissions"); available-times callable
HTTP 200 with 31 times. This fresh-session check confirms callable discovery,
admission and scheduling eligibility work independently of the failed direct
profile read. Hosted does not expose the evaluator's expression-limit detail;
that precise cause was reproduced against the matching Rules in isolation.
No passwords or tokens are persisted. Deployment requires
separate owner approval; no hosted records, Rules releases, Functions, APKs or
Git commits were changed during diagnosis.

### Approved public-profile Rules-only deployment

On 16 November 2026 at 19:11 UTC, the owner-approved correction was deployed only
to Firestore Rules in `calladoc-academic-demo`, through the existing verified
release inventory and predeploy guard with `--only firestore:rules`. Project ID
was independently confirmed through the Firebase Management API. The previous
published ruleset `805b25d1-ff8a-442d-8c1f-3ca15b7d0c4c`, full source and rollback
instructions were preserved outside Git in the checkpoint directory before
deployment. A missing unchanged indexes artifact was restored only in the
disposable release after its hash matched the existing inventory; no indexes
were deployed. Functions, Storage Rules and Hosting were not deployed.

Published ruleset `2491e6ab-e4c6-4b34-a37f-b2bb23c58122` was read back and matched
the tested hosted artifact byte for byte. SHA-256:
`959696400c5a2901bf58e49045aa6e1b998e45c6a2552100bc0c2bb3dfc90fcd`.
Three live unauthenticated read checks returned HTTP 403 PERMISSION_DENIED for
the actual public doctor profile, private doctor profile and administrative
membership path. Authenticated role boundaries remain covered by the 116
previously passed affected tests; successful suites were not repeated.

The existing three-check patient helper remains available. A new owner-entered
patient sign-in is required because credentials and session tokens were not
retained. Post-deployment authenticated read results and native profile refresh
remain pending; no success is claimed until observed. No hosted records,
bookings, payments, accounts, local emulator data or APKs were modified. No Git
commit or push was performed; unrelated working-tree edits were preserved.

## Final post-consultation evidence — 17 November 2026

The earlier pending statuses in this chronology describe historical checkpoints. **Patient and Doctor completed-history device acceptance PASSED; hosted authorization 28/28 PASSED** (Patient 13/13, Doctor 15/15, previously confirmed separate receipts). All **nine tracked record hashes and five message hashes unchanged**, with **granted consent revision 5 preserved**. Doctor Kiswahili device checks, fresh direct-SDK negative checks and active-appointment device testing are **PENDING, not failed**. See [final release evidence](POST_CONSULTATION_RELEASE.md) and [history implementation evidence](CONSULTATION_HISTORY_ENTRY.md) for scope, artifact verification and preservation receipts. The Doctor remains signed in. This evidence update does not alter hosted records, account settings, APKs, local environments or unrelated edits, and performs no deployment, rebuild, staging, commit or push.
