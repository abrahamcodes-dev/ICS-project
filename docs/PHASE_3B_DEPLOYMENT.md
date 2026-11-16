# Phase 3B hosted backend checkpoint — 16 November 2026

Target: **calladoc-academic-demo only**. The original project, local emulator
processes/data and recovery snapshots are outside this deployment. No Android APK
was built. Actual tester emails, verification receipts, session tokens and owner
dates/configuration are stored privately outside Git.

## Deployed and verified

- Firestore admission/domain Rules, deny-direct-access Storage Rules and all ten
  composite indexes deployed; all ten indexes reached READY.
- Sixty Node.js 22 Functions ACTIVE in us-central1: 55 application HTTPS endpoints,
  two Identity Platform blocking Functions and three maintenance Functions.
- beforeCreate and beforeSignIn are registered to the central Function URLs.
- HTTPS/blocking limits: minimum 0, maximum 2, concurrency at most 10; bounded
  document handlers retain concurrency 2. Maintenance limits: 0/1/1.
- Server simulation opt-in, exact project, actual firebasestorage.app bucket and
  Google Web audience verified from managed configuration. No emulator overrides.
- The USD 5 project budget exists; its 90% middle threshold was corrected to the
  approved 80% (50% / 80% / 100%). Alerts are not spending caps.
- Seven-day image cleanup configured in both Functions artifact repositories,
  following explicit owner approval. Application data is not covered by that policy.

The SDK's default blocking-trigger region was us-east1. Both replacements were
deployed and registered in us-central1 before the two misplaced Functions were
deleted with explicit owner approval. Region is now explicit for all endpoints
and asserted in focused tests. The temporary us-east1 artifact repository remains
under the approved image cleanup policy; no Functions remain there.

Eight required APIs were explicitly approved and enabled. Firebase CLI also
enabled its required Firebase Extensions API during deployment; no extensions,
TURN server, VPC/NAT, billing export or other optional paid resource was installed.

## Verification and deployment fixes

- Backend admission/region Jest: 1 suite, 26 tests passed; backend source/test types
  passed. Hosted Rules/Admin SDK integration: 1 suite, 22 tests passed.
- Release/operator guard tests: 17 passed, zero failed/skipped. Node 22.23.3 used
  locally. Unrelated historical regression suites were not rerun.
- Added expiring invitation role binding and explicit privileged administrator
  invitation-before-bootstrap. Public registration cannot provision administrators
  or change an invited patient into a doctor. Doctor approval is never automatic.
- Rules admission is evaluated at each allow boundary using tuple-equivalent
  comparisons to stay within the expression limit. Every original domain condition
  is preserved verbatim; a dedicated invariant test verifies that preservation.
- Raw-worktree, wrong-project, wrong-directory, tampered/unlisted-file and unknown
  environment protections remain. Only the reviewed project-specific environment
  file is accepted as deployment metadata; it is excluded from the uploaded source.
- Eight hosted negative checks passed: five protected callable requests without
  authentication, an invalid Google credential, direct anonymous Firestore access
  and direct protected Storage access. No passwords or outsider accounts were made.
- All maintenance jobs are ENABLED with OIDC and nonpublic invocation policies.
  Natural execution status is checked; manual invocations were not performed after
  automatic approval review rejected potentially destructive job runs.
  Payment reconciliation, deletion recovery and hourly attachment cleanup all have
  successful natural executions.

Build API metadata showed eleven successful builds, approximately 6.2 aggregate
build-minutes at this checkpoint. Actual billed charges can lag and are not claimed
to be zero. Existing cost assumptions and emergency controls remain in
HOSTED_DEMO_COSTS.md. Per-function limits are not a global project spending cap.

## Privileged bootstrap and remaining acceptance

Three owner-approved role-specific invitations and a private retention-policy
record are configured. Administrator bootstrap requires actual mailbox verification
and notice acknowledgement. Passwords are chosen by the account holder; no service
account private key, generated password or fabricated verification is used.

The IAM owner tool first uses --role administrator --invite-administrator to allow
only the approved administrator to establish an Auth account. That flag creates
only an invitation. After verification, the existing provisionAdministrator policy
and audit workflow creates a canonical administrator; bootstrap then requires
--bootstrap-admin-uid and --notice-acknowledged to set privileged admission.
The operator tool supports trusted in-memory credentials/Firestore injection so
the operation does not require writing an extra long-lived credential file.

Administrator bootstrap completed after actual mailbox verification and notice
acknowledgement. The audited provisioning workflow created an active canonical
administrator, bound its role/UID and expiry to the invitation/membership, and set
the academicDemoAdmin custom claim. No patient/doctor role or doctor approval was
granted. Twelve authenticated hosted checks passed: verification-queue read,
patient-directory/consent/slot/checkout/payment-list denials, public role-change
and credential-upload denials, private invitation/Storage direct-access denials,
and rejection of admission management by the pre-bootstrap session lacking the
administrator claim, followed by successful authorization of a refreshed claimed
session reaching input validation. The latter used an empty invalid payload and
returned INVALID_ARGUMENT without changing any invitation or membership. The
refreshed token signature/revocation and current Auth custom claim were verified.
An initial checkout probe used a non-UUID request ID and was
correctly rejected by validation; the corrected UUID probe reached role denial.
Patient/doctor app acceptance belongs on the Pixel 7 after the separately approved
hosted APK build; normal doctor credential submission and manual administrator
review must precede positive paid-booking tests. Do not treat unauthorized-request
checks as successful paid consultation acceptance. Native Google runtime, FCM,
STUN/TURN and physical audio remain Phase 4; Google device testing does not block
this backend or the initial hosted APK preparation.

Storage currently retains soft-deleted objects for seven days. Meeting the private
disposal deadline requires revoking access and planning object deletion early enough
for those copies to expire. Provider-required audit/log retention is a separate
inventory; no complete-erasure promise or automatic purge is made.
