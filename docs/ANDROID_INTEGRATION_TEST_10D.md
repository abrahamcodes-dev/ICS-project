# Checkpoint 10D — final integration, security and regression validation

22 October 2026. Baseline: 10B commit `59373488649891eb1aa4170ece9ae10e5efde682`
plus the preserved working tree documented in 10C. No production deployment.

**Status: PARTIAL. All executed automated gates passed; native recovery and
two-client media acceptance criteria remain open.** No production defect was
found or fixed in this checkpoint.

## Scope and evidence boundaries

10D validates remaining integration, privacy/recovery, concurrency and regression
coverage. It does not convert mocked tests into native evidence. Existing 10A–10C
device results are reused rather than repeated. Two-client call acceptance,
bidirectional media and connected-call network recovery remain outstanding.

## Added coverage

Five cases in `functions/__tests__/integration/consultations.integration.test.ts`
reuse the existing guarded demo fixtures, real Functions emulator and Firestore
transactions:

- Concurrent exact prescription retries preserve one immutable record and one
  patient notification; a conflicting request loses with `already-exists`.
- Recovery reads return the committed prescription without its private request
  ID. Replaying the winning request does not duplicate the notification.
- Concurrent notification mark-read requests succeed; another patient cannot
  open that notification.
- Concurrent exact/conflicting ratings preserve one rating and increment the
  doctor's aggregate exactly once, including score zero. The winning value can
  be recovered and retried safely; another patient cannot retrieve it.
- Direct client reads/writes of prescriptions, ratings, doctor aggregates and
  private inbox records are denied. A canonical identity disabled after login
  loses callable access using its existing authenticated client; guest access is
  denied. This is authorization-revocation evidence, not a native expired-token test.

Historical fixtures establish elapsed appointment times without changing the
server clock. Completion uses the existing `recordAppointmentOutcome` callable.
No production handler, security rule, contract or mobile behavior was changed.

## Execution record

Node 22.23.3 was verified for build and regression gates. Firebase CLI uses the
existing Android Studio JBR with process-local `JAVA_TOOL_OPTIONS=-Xmx512m`,
`FUNCTIONS_DISCOVERY_TIMEOUT=120` and a separate unsigned temporary CLI directory.
The live Android demo project/fixtures are preserved. Test infrastructure uses
its fixed, separate `demo-calladoc-integration`, `demo-calladoc-rules` and
`demo-calladoc-credentials` configurations; no production fallback is permitted.

| Gate | Result |
|---|---|
| Functions build (`npm --prefix functions run build`) | PASS |
| Source/test TypeScript (`tsc -p functions/__tests__/tsconfig.json --noEmit`) | PASS |
| Focused ordinary authorization/prescription/rating/notification tests | 77/77 PASS; initial run used Node 24 because the sandbox could not access the external Node 22 path. Superseded by the full Node 22 run below. |
| Full ordinary Functions Jest (`npm --prefix functions test -- --runInBand`) | 1,640/1,640 PASS, 33 suites, Node 22 |
| Mobile TypeScript (`npm --prefix mobile run typecheck`) | PASS |
| Focused mobile session/recovery tests | 113/113 PASS, 7 suites |
| Remaining mobile suites, excluding those seven | Initially 330/332; two five-second timeouts. Both passed unchanged on isolated retries. Unique final coverage: 445/445 across all 40 mobile suites. |
| Focused real-emulator consultations integration | 15/15 PASS, including the five new tests |
| Full Firestore Rules (`npm --prefix functions run test:rules`) | 606/606 PASS, 12 suites |
| Full Storage Rules (`npm --prefix functions run test:storage`) | 56/56 PASS, 1 suite |
| Remaining real-emulator integration: profiles, scheduling, consultationCalls | 64/64 PASS, 3 suites |
| Complete integration coverage across the two disjoint runs | 79/79 PASS, 4 suites |
| Git whitespace check | PASS; nothing staged |

Unique final automated coverage: **2,826 passing tests** (1,640 ordinary
Functions + 606 Firestore + 56 Storage + 445 mobile + 79 integration). Focused
ordinary tests and retries are not counted again. This is combined coverage across
the recorded runs, not a claim that every first attempt passed.

Integration commands, with the process-local environment above:

```powershell
npm.cmd --prefix functions run test:integration -- consultations.integration.test.ts
npm.cmd --prefix functions run test:integration -- profiles.integration.test.ts scheduling.integration.test.ts consultationCalls.integration.test.ts
git diff --check
```

The second command excludes the already successful consultation suite. Existing
coverage exercises competing verification decisions, booking/availability and
cancellation races, exact retries, immutable offer/answer/ICE, quota transactions,
expiry reconciliation and denied private state access. These tests use real local
emulators, but their synthetic signaling payloads do not prove native media flow.

Mobile suites ran through the installed Jest executable with `--runInBand`.
Focused names: authState, adminVerification, callSession, consultationService,
prescriptionService, ratingService and notifications. Remaining suites excluded
those names. A first npm invocation failed to forward the exclusion regex through
Windows cmd; it executed no tests and was replaced by direct Node/Jest invocation.

The two timeouts were `adminVerificationUI` queue rendering and `doctorWorkspace`
tab/listener cleanup. Administrator UI passed on its first isolated retry; doctor
workspace still timed out while the emulator suite was active, then passed 7/7
after it shut down (the previously failing test took 576 ms). Assertions and
timeout thresholds were not relaxed. This is consistent with host resource
contention; retain it as test-environment fragility, not an unqualified first-run pass.

## Recovery and native limitations

- Automated mobile coverage includes late async response rejection, logout and
  account changes, listener/file/media cleanup, uncertain-send retry IDs and
  bounded transport retry behavior. These are mocked unit/UI results.
- Existing emulator integration covers expiry reconciliation, exact send replay,
  immutable state and cross-account rejection. New tests cover concurrent
  prescription/rating recovery and canonical access revocation.
- Existing 10A/10B/10C evidence covers Android restart/login, navigation, outgoing
  native capture, document viewing and background cleanup. No new two-party
  device evidence is claimed here.
- Android permission prompts still require explicit call retry. Native token
  expiry/refresh and interrupted-network recovery across two connected peers are
  not verified. Memory-only Auth persistence remains intentional current behavior.
- Remote push, background incoming calls and internet STUN/TURN readiness remain
  outside verified capabilities. No secrets, real medical data or new services.

## Hygiene

Only the integration test and checkpoint documentation are 10D changes. Preserve
unrelated AuthForm/authUI edits, `.vscode/`, and the earlier 10A/10C reports.
Generated `functions/lib`, emulator logs and temporary execution logs remain
excluded. No staging, commit, push, native build or deployment is performed.

Temporary logs: `%TEMP%/calladoc-10d-{functions,mobile,mobile-retry,focused,rules,storage,integration-remaining}.log`.
Logs are local evidence, not release artifacts. Java deprecation warnings and
expected permission-denied traces are not failed security assertions. Integration
Eventarc/Tasks auxiliary ports shifted because the Android demo services remained
running; the guarded Auth/Firestore/Functions/Storage ports stayed fixed.

## Remaining acceptance criteria / next checkpoint

- Execute two independently authenticated native peers with actual received audio
  and video, then verify network interruption, termination and logout at both ends.
- Verify device token expiry/refresh and interrupted connectivity outside mocks;
  canonical identity revocation and guest denial are covered here, not token expiry.
- Address or explicitly accept the Android permission-prompt retry UX documented
  in 10C while retaining background privacy guarantees.
- Preserve the recorded first-run UI timeout history; isolate emulator-heavy and
  mobile test runs on this resource-constrained host.

Ready for review and the next explicitly scoped verification checkpoint. Not ready
to declare full native end-to-end acceptance or production deployment readiness.
No next checkpoint implementation was started.
