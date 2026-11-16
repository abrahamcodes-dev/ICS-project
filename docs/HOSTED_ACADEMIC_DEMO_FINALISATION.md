# Hosted academic demo: safeguards and Phase 3B handoff

Phase 3B update (16 November 2026): backend deployment is recorded in
PHASE_3B_DEPLOYMENT.md. The preparation evidence below is historical; private
account configuration and administrator verification remain outside Git.

Implemented locally, not deployed. The separate project must end in
`-academic-demo`; the default project, aliases, native configuration, emulator
Rules and interactive services are unchanged. Synthetic data only. Blaze is
owner-approved; no project, billing account or hosted resources were changed.

## Admission and authorization

- Private `academicDemoInvitations/{lowercaseEmail}` records contain enabled,
  expiry and a once-bound UID. `academicDemoTesters/{uid}` contains matching
  email/UID, enabled, expiry and the acknowledged hosted notice version.
- Email/password signup still selects patient or doctor. Hosted accounts must
  verify their invitation email, then retry registration. Existing recovery works
  after restarting the app. Server transactions bind one invitation to one UID;
  replay cannot renew expired/revoked membership. Doctor approval remains separate.
- Every active protected callable passes through academicHttps. Hosted requests
  check current Admin Auth disabled/verification/revocation state and both private
  records and the approved invitation role on every request; token roles and client-supplied admission are ignored.
  No membership cache or permissive hosted environment flag exists.
- Mobile hosted initialization requires explicit emulator=false and a separate
  academic-demo project; reuse of another initialized project remains blocked.
- Google verifies its issued token and invitation before creating/linking accounts;
  membership is checked before minting custom tokens. Identity Platform blocking
  triggers protect direct SDK signup/sign-in. Custom authentication bypasses those
  triggers, so the explicit Google checks remain essential. Anonymous sign-in must
  stay disabled. See [Firebase blocking-function behavior](https://firebase.google.com/docs/auth/extend-with-blocking-functions).
- The release generator adds membership, invitation, notice and expiry checks to
  Firestore's common signed-in boundary, preserving domain Rules. Clients cannot
  write admission records, promote roles or read the allowlist.
- Hosted Storage denies all direct SDK access. Credential/avatar uploads and admin
  credential reads use admitted, domain-authorized callables. Slot ownership,
  expiry, declared type/size, generation, checksum and finalization checks remain;
  uploads are bounded and create-only, and issue no bearer download URLs. This
  avoids exceeding Storage Rules' two cross-service document-lookup limit.
- Membership administration requires both an active canonical administrator and
  the privileged `academicDemoAdmin=true` Admin-issued claim, checked in both the
  presented session and current Auth record. Revocation updates
  invitation and membership in one transaction and appends an audit entry.
  The owner/IAM bootstrap tool is not included in Functions packaging.

Firestore Rules enforce membership revocation/expiry even with an existing token.
When disabling an account or revoking tokens in Console, also revoke its membership
and invitation: Rules cannot consult live Auth disabled/token-revocation state.
Already delivered/cached data and an operation authorized before revocation cannot
be retroactively erased. Background payment/deletion/cleanup work continues after
a tester loses admission. IAM administrators bypass Rules and must remain restricted.

## Owner configuration and privileged bootstrap

Templates under `config/academic-demo` contain no secrets. Membership expiry is an
explicit UTC timestamp, not inferred from deployment. Record the final assessment
date and proposed disposal deadline (30 days afterwards) in controls.proposal.json
or a private owner-controlled copy. There is no automatic all-category purge.
The hosted notice version is `academic-demo-2026-11-15-v1`; optional sharing stays
disabled and separate from acknowledgement. Retained shared/audit/payment records
mean account deletion is not complete erasure. Fill in controller/contact/location
and provider-log/recovery-copy retention before invitations are distributed.

Bootstrap with owner IAM/ADC, never an embedded key or public registration role.
First create and verify a dedicated synthetic Auth account with providers closed
to the public, then use the existing `functions/scripts/provisionAdmin.cjs` workflow
to provision its canonical administrator identity. Use an isolated operator build
with its full compiled adminProvisioning module; it is intentionally absent from
the deployed runtime graph. The new owner tool defaults to offline argument checking:

```powershell
& $node22 functions/scripts/academicInvitations.cjs --project '<id-academic-demo>' --email '<invited email>' --expires-at '<UTC ISO timestamp>' --operator '<owner attribution>' --role '<patient|doctor|administrator>'
# Later, separately authorized: add --apply to create an invitation using IAM.
# Bootstrap only: also --bootstrap-admin-uid '<existing canonical admin UID>' --notice-acknowledged
```

The tool refuses emulator overrides and unrelated projects. It does not create
accounts or promote a patient/doctor into an administrator. Subsequent invitation
enable/expiry/revocation operations use the protected manageAcademicDemoTester
callable. Re-enabling a bound membership is privileged, never registration replay.

## Verification and isolated reproduction

The 137-suite / 3,897-test baseline remains historical evidence; unrelated suites
were not rerun. Final unique affected results (overlapping reruns counted once):

| Check | Final result |
| --- | --- |
| Backend Jest | 8 suites, 156 tests passed |
| Mobile Jest | 9 suites, 157 tests passed |
| Hosted Firestore/Storage and Admin SDK integration | 1 suite, 21 tests passed |
| Release/security tooling | 14 Node tests passed |
| Build/types | Fresh Functions compilation, backend source/test types and mobile types passed, Node 22.23.3 |
| Runtime/package | 89 runtime modules / 91 Functions archive files; actual Firebase CLI ZIP exactly matches inventory; 60 production exports match source |
| Production dependencies | Fresh offline production-only install: 242 packages; final manifests/lock byte-identical to that verified installation; final source loads using that production-only tree |
| Deployment safeguards | Inventory verification passes; deployment checkpoint refuses execution pending Phase 3B approval |
| Preservation | Original Rules, project alias, native config unchanged; Metro/Firebase PIDs unchanged; nine recovery snapshot hashes matched, including five accounts and Dr. James Mwangi |

All final tests passed with zero failures/skips. Focused Jest batches were 6/105
and 4/81 backend (two Google suites overlap). Mobile initially ran 6/110 with two
failures, resolved in the 3/31 rerun; subsequent affected batches passed 4/56 and
1/16 (overlapping recovery/authentication reruns). No aggregate pass count
includes duplicate reruns. New tests cover invitation binding, expiry/revocation, stale sessions,
email verification, administrator privileges, callable entry, Rules, hosted object
proxies, environment separation, payment opt-in, notice parity and release limits.

Diagnosed failures: mobile registration envelope needed an explicit shared type;
duplicate proxy upload needed an explicit existing-object check alongside the
cloud generation precondition (the emulator did not enforce that precondition);
expiry fixtures needed an unambiguously past timestamp because of emulator clock
skew; Expo's build-time environment substitution required testing the pure selector;
one cold UI test exceeded five seconds and passed separately with a 30-second
runner timeout; two prior generic hosted-project fixtures now use the approved
academic project class. Assertions and domain/security Rules were not weakened.
Nested consultation signalling reads also pass with the additional admission lookups.

No dependency changes were made during this finalisation. Prior production audits
remain 8 moderate backend entries and 15 mobile entries (10 high, 5 moderate);
full mobile tree 23. Exposure/mitigations remain documented without suppression.

Use Node 22.23.3. The dependency-equipped disposable workspace must have the same
lockfiles; the previous full regression workspace is preserved. Source refresh
copies intended tracked/untracked files and excludes private environments/artifacts:

```powershell
& $node22 scripts/Sync-AcademicChecks.cjs '<existing disposable TEMP workspace>'
# In that copy, with Android Studio JBR 25 (or compatible Java 21+):
& $node22 functions/scripts/academicEmulatorGate.cjs
# Offline clean release preparation, from the original repository:
& $node22 --test scripts/__tests__/academicRelease.test.cjs
& $node22 scripts/Prepare-AcademicRelease.cjs --project '<approved-id-academic-demo>'
& $node22 scripts/Check-AcademicRelease.cjs --inventory-only '<printed release path>'
```

The test gate checks source hashes, private-environment absence, exact loopback
ports and an explicit `demo-calladoc-academic-tests` project. It runs only Auth
9111, Firestore 8111 and Storage 9211 (hub 4451, logging 4551, websocket 9167), with
no imports/exports of demo data. No Functions HTTP service or live project is used.
Application handlers are exercised against these isolated Admin SDK services.
Hosted Auth trigger registration, managed-runtime cold starts and an actual Android
hosted build still require post-deployment smoke testing; local tests do not prove them.

Raw working-tree deployment remains blocked. The approved deployment transition
accepts only calladoc-academic-demo, the verified release directory supplied by
Firebase CLI, and the exact reviewed server OAuth/simulation settings. No generic
approval flag exists. Runtime packaging excludes
emulator-only modules, inactive verification exports, tests, tools and private files.

## Required Console sequence after Phase 3B approval

1. Confirm separate project ID and us-central1 location; create the project and link
   approved Blaze billing. Preserve the existing default alias and emulator data.
2. Set project-scoped USD 5 monthly budget alerts at 50%, 80%, 100%, delivered to
   the owner. Alerts are delayed notifications, not spending caps.
3. Enable Identity Platform and required APIs. Keep public sign-in providers closed
   until admission records, blocking triggers and deny-by-default Rules are ready.
   Do not enable anonymous, phone/SMS, multi-tenancy or unused providers.
4. Register the distinct demo Android app/signing identity and Google web client;
   keep direct Google provider sign-in disabled if using only the implemented custom
   Google exchange. Configure authorized domains and verify email action links.
5. Bootstrap the verified canonical administrator and privileged membership via IAM.
   Set project-specific server simulation opt-in and Google audience; no emulator
   overrides or server controls in public Expo configuration.
6. Approve removal of the deployment checkpoint only after reviewing the exact
   inventory and current focused evidence. Deploy closed Rules/indexes first, then
   blocking triggers and Functions; verify trigger registration before opening
   email/password signup. Confirm 0/2/10 HTTP and 0/1/1 scheduled limits (upload/read
   concurrency remains the safer existing 2), region and service-account permissions.
7. Configure artifact cleanup, budgets/monitoring and recovery procedures; smoke-test
   a non-invited signup, invited verified registration, revoked/expired existing
   token, protected data/object access and server-controlled payment simulation.
8. Distribute synthetic tester invitations only after those checks. Remote FCM,
   STUN/TURN, physical audio and complete manual consultation/payment acceptance
   remain Phase 4. No clinical-use approval is implied.

Remaining npm findings and mitigations are retained in the preceding remediation
record. This finalisation changes no dependencies and suppresses no findings.
See HOSTED_DEMO_COSTS.md for assumptions, monitoring and emergency actions.
