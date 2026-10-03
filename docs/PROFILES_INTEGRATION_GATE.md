# Profiles and verification integration gate (Checkpoint 3G)

## Local environment and safety

Run from `functions` under Node **22.23.3** (see `.nvmrc`):

```powershell
npm run test:integration
```

If the host default is different, the existing pinned Node launcher can be used:

```powershell
npm.cmd exec --yes --package=node@22.23.3 -- node scripts/integrationGate.cjs
```

The runner builds TypeScript and starts only the four required services for
`demo-calladoc-integration`. It checks the runtime, source paths, rules/index paths
and fixed loopback ports before starting Firebase. It refuses Functions `.env`
files, strips inherited credential/config/emulator overrides and disables verbose
DEBUG environment logging. Mobile `.env` is never loaded. The test checks project
and emulator environment variables before initializing either Admin or client SDKs.
Every client explicitly connects all four SDKs to the local services; an absent
emulator fails rather than selecting a production endpoint.

The safety guard was also exercised separately with all three SDK emulator
environment variables absent. Jest rejected the suite before SDK initialization
with `Local emulator safety assertion failed`, as intended.

| Service | Loopback port |
| --- | --- |
| Authentication | 9105 |
| Callable Functions | 5105 |
| Firestore | 8105 |
| Storage | 9205 |
| Emulator hub / logging | 4425 / 4525 |
| Firestore websocket | 9155 |

Configuration: `functions/firebase.integration-test.json`. Jest configuration:
`functions/jest.integration.config.js`. Ordinary Jest excludes integration tests.
The separate Firestore and Storage suites retain their own demo projects/ports.
No dependencies or lockfile versions are changed by the integration runner.

## What the gate exercises

The tests create real Auth-emulator accounts, obtain SDK authentication and call
the six exported functions through `httpsCallable` and the Functions emulator.
They never import internal handlers. Storage uploads/downloads use authenticated
client SDKs with Storage Rules. Profile writes/reads use client Firestore Rules.
Admin SDK access is limited to trusted local inspection, canonical administrator
fixtures, deliberate disabled/claim fixtures and removal of demo evidence for
failure tests. All data is synthetic; uploaded bytes are a labeled test fixture,
not a real medical credential. Administrator fixtures are not a provisioning API.

The 11 integration tests cover:

1. Registration, draft, prepare/upload/finalize, submission, administrator approval,
   exact public projection and visibility.
2. Rejection, newer draft, fresh evidence, linked resubmission, approval and retained
   rejected request/evidence/audit history.
3. Own patient profile/health writes, updates and optional-field clearing; denial
   to another patient, pending/approved doctors and administrator; identity writes denied.
4. Wrong-role callables/uploads, doctor impersonation, claim-only administrator,
   disabled identity and unauthenticated registration denial.
5. Submitted and approved professional locks; private phone update/removal without
   changing approved revision or publication.
6. Attached evidence overwrite/delete/read isolation and legitimate owner/admin reads.
7. Identical draft/finalization/submission/review retries without duplicate state.
8. Simultaneous draft saves, submissions and competing administrator decisions.
9. Stale submission and missing binary failures with no attachment/request/audit.
10. Invalid rejection reason, stale review, disabled administrator and missing
    approval evidence failures with no partial decision or audit change.
11. Latest-request query/index declaration and unreachable legacy callable URLs.

Audit inspection uses Admin; the test does not broaden audit client access.
Concurrent tests assert invariant outcomes instead of choosing a winning caller.
Lost-response behavior is simulated by resending an identical successful request;
it does not simulate packet loss. Approval/rejection consistency is checked after
the callable commits, together with the existing transaction rollback tests.

## Regression commands

After integration passes, run these under Node 22 in `functions`:

```powershell
npm run build
npm test -- --runInBand
npm run test:rules
npm run test:storage
```

If the existing demo Firestore emulator is already running on 8085, run its full
suite directly with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085` and
`node node_modules/jest/bin/jest.js --config jest.rules.config.js --runInBand`.
Do not run two suites concurrently against the same emulator database.

In `mobile`: `npm run typecheck`, `npm test -- --runInBand`, `npx expo-doctor`.
At the repository root: `git diff --check` and `git status --short`.

## Limits and production items not verified

- Firestore emulators execute the composite query but do not enforce production
  composite-index availability. The declared doctorUid ASC/profileRevision DESC
  collection index matches the backend query; deployment/readiness remains unverified.
- Auth-emulator tokens and callable transport are real local flows, not production
  IAM, TLS, quotas, App Check enforcement, billing or deployment verification.
- Storage/Firestore cross-service atomicity remains as documented in
  [VERIFICATION_WORKFLOW.md](VERIFICATION_WORKFLOW.md). Evidence integrity is not
  medical-license authenticity.
- Emulator Java deprecation/shutdown warnings and denial-case Rules evaluation
  warnings may appear. Successful process exit and assertions determine test results.
- On Windows, Firebase CLI may leave its Firestore Java process after shutdown.
  Identify its demo project and port before stopping it; leave unrelated emulators alone.
- No UI, physical-device profile flow, re-verification, retention/cleanup, production
  administrator provisioning or deployment is included.

Generated `functions/lib`, emulator logs and `.firebase` are ignored. Tests do not
export emulator datasets. All earlier approved Checkpoint 3 changes remain uncommitted.

## Recorded gate result

- Integration: 11/11 tests, one suite, through all four local services.
- Functions build: passed under Node 22.23.3; ordinary Jest: 473/473, ten suites.
- Firestore Rules: 334/334, five suites; Storage Rules/integration: 56/56, one suite.
- Mobile typecheck: passed; Jest: 50/50, four suites.
- Expo Doctor: 21/21 checks passed, no issues detected.
- Missing-emulator safety negative check: rejected before SDK initialization.
- No backend behavior defect was found; no production source/rules fix was needed.
- Changed/untracked Checkpoint 3 credential-pattern and copied-client-config scans:
  no findings. Existing package versions and lockfiles were preserved.

Local emulator Java deprecation/shutdown warnings and denial-case Rules warnings
were observed with successful test exits. Verified orphaned test Firestore processes
were stopped; the pre-existing 8085 demo emulator was left running. No deployment,
production access, real administrator provisioning, commit or push occurred.
