# Full scheduling integration gate (Checkpoint 4G)

This gate exercises the approved C4 contracts through real Firebase client SDK
transport. It adds no scheduling UI, payment logic, consultation authority or
production operation. The existing 4B–4F work remains intact.

## Run and safety

From `functions`, with the documented Node **22.23.3** runtime selected:

```powershell
npm run test:integration
```

The existing `scripts/integrationGate.cjs` builds Functions and starts the guarded
`firebase.integration-test.json` topology. Its existing Jest configuration now
discovers both the 11-test profile/verification suite and the scheduling suite.
No dependencies, npm scripts or lockfiles need to change.

| Service | Loopback endpoint |
| --- | --- |
| Auth | 127.0.0.1:9105 |
| Functions | 127.0.0.1:5105 |
| Firestore | 127.0.0.1:8105 |
| Storage | 127.0.0.1:9205 |
| Hub / logging | 127.0.0.1:4425 / 127.0.0.1:4525 |
| Firestore websocket | 127.0.0.1:9155 |

Only `demo-calladoc-integration` is used. The runner refuses Functions `.env`
files, requires the fixed runtime/configuration and strips inherited credentials,
Firebase config and emulator overrides. DEBUG environment dumping is disabled.
The new fixture module independently checks the project, runtime, configuration
and exact SDK emulator hosts **before SDK initialization**. Every client connects
explicitly to loopback emulators. A negative launch with the Auth emulator variable
missing was rejected before any SDK instance was created. A second launch with
a non-loopback host was rejected at the same guard without contacting that host.

Scheduling fixtures use Auth-emulator accounts with random synthetic
`@example.test` emails/passwords. Canonical users and valid doctor/private/public/
approved-request bindings are seeded by the local Admin SDK. The synthetic
administrator exists only in this demo database; no provisioning action runs.
The scheduling suite resets only this demo Firestore database before each test.
Jest runs suites serially so it cannot erase a concurrently running profile test.

## Transport and assertion boundaries

| Mechanism | What it proves |
| --- | --- |
| Auth client SDK | Real emulator sign-up, tokens and refreshed synthetic custom claims. |
| `httpsCallable` | Serialization, authenticated context, sanitized errors and all five scheduling endpoints through Functions. No scheduling handler is imported by these tests. |
| Firestore client SDK | Server reads/queries and direct writes evaluated by actual Rules, including privacy and participant authorization. Reads explicitly use server APIs. |
| Admin SDK | Synthetic setup, deliberate corruption and persisted-state inspection only. It never proves client access. |
| Local Functions `/backends` | Exact loaded trigger-name set; backend environment data is never logged. |

The main workflow verifies real Timestamp persistence, exact appointment fields,
trusted decision times, immutable participants/intervals and both deterministic
reservations. An independent invariant assertion scans appointments and locks:
every scheduled appointment has exactly its expected pair and availability
coverage; every lock belongs to a scheduled appointment; terminal history owns
no current lock. Reused positions may belong to a replacement appointment.

## Workflow coverage

- Publish revision 1, discover sanitized candidates, book, inspect appointment
  and locks, observe occupied-slot disappearance and participant reads, cancel,
  observe release/rediscovery, and let a different patient rebook.
- Complete and no_show through real callables, preserve history/metadata, release
  both locks, retain participant history access and reject fresh past bookings.
- Normalize equivalent IANA timezone names without revision change; reject
  unsorted windows as required by 4B; increment once for a
  meaningful replacement; reject stale revisions/timezone changes and preserve
  started windows. Reserved coverage is removable only after cancellation.
- Concurrent doctor and patient double booking: one winner, one generic conflict,
  one appointment and exactly two locks, with no partial loser state.
- Booking versus coverage removal in both launch orders; final coverage and
  revision are consistent regardless of the winner.
- Concurrent identical booking gives one creation and one replay. Conflicting
  UUID intent fails. Exact scheduled/terminal booking retries preserve state.
- Competing cancellations, competing completion/no_show, duplicate completion,
  cancellation versus booking and stale cancellation replay after rebooking.
  Replacement locks survive terminal retries.

Concurrent requests wait on a shared barrier. The helper checks that all request
start times precede the earliest completion, proving overlapping network request
lifetimes. The emulator controls server/transaction interleaving; the gate does
not claim deterministic coverage of every possible interleaving. Existing
transaction retry and rollback emulator tests remain in the regression gate.
The successful run's emulator logs also recorded two overlapping bookAppointment
executions and two overlapping recordAppointmentOutcome executions.

## Authorization and privacy

All five scheduling callables are tested against guests, wrong roles, disabled
identities, a canonical administrator and claim-only authority. New booking and
discovery reject disabled/pending/rejected target doctors. Availability ownership
comes from authentication; a supplied doctorId is rejected. Current approval is
not imported into the existing lifecycle policy: active pending/rejected doctor
participants retain cancellation and outcome authority.

Real Firestore client tests use the exact [4F upcoming/history queries](APPOINTMENT_READS.md).
They exercise both roles, limits, missing/cross-owner constraints, disabled callers,
counterpart status changes, approval loss and equal-time document-ID cursors.
All direct scheduling creates/updates/deletes fail. Lock and availability gets
remain denied, including the retired availabilitySlots path.

Having an appointment grants no patient-health, private credential, verification
audit, unrelated verification request, consultation, room, message or WebRTC
access. Positive owner reads accompany health/credential denial assertions so
malformed fixtures cannot accidentally make a privacy test pass. Discovery's
exact output keys and generic conflict messages reveal no other patient UID or
appointment ID.

## Corruption and atomicity

Local Admin fixtures corrupt availability, appointment schema, either missing
reservation, foreign reservation references, companion metadata and stale or
malformed doctor projections. Existing-booking retries, lifecycle decisions and
applicable discovery/replacement paths fail closed. Snapshots before/after the
failed calls prove no silent repair or partial mutation.

Invalid lifecycle timing, conflicting intent and protected availability removal
also leave all three scheduling collections unchanged. The separate existing
Rules/emulator suites inject exceptions **after staging writes** for booking and
lifecycle and an aborted availability transaction followed by reauthorization.
They prove rollback without adding a remotely callable failure switch.

The transport suite does not inject a mid-commit crash into production handlers.
Privileged deletion of a doctor lock also cannot be discovered by a raw occupancy
lookup that never reads the now-unreferenced appointment; this architecture relies
on callable-only atomic writes for reservation integrity. Existing-appointment
retry/lifecycle paths detect the missing pair. Administrative corruption is a
trusted-boundary failure, not a supported repair workflow.

## Exports, indexes and later modules

The Functions emulator must load exactly:

1. completeRegistration
2. saveDoctorProfileDraft
3. prepareDoctorCredential
4. finalizeDoctorCredential
5. submitDoctorVerification
6. reviewDoctorVerification
7. replaceDoctorAvailabilityDay
8. getAvailableAppointmentTimes
9. bookAppointment
10. cancelAppointment
11. recordAppointmentOutcome

Inactive legacy endpoints must return 404. The active bookAppointment endpoint
rejects the retired slot-based payload; the old implementation is not exported.

The integration test checks all four approved appointment composites plus the
existing verification composite. Emulator query success does **not** establish
production index deployment or readiness. No indexes or rules are deployed.

Appointment fields remain exactly the C4 schema, including appointmentId,
patientId, doctorId, startAt, endAt and status for C5. No price, payment status,
phone, receipt, checkout ID, callback or payment credential is introduced.
Future `payments/{paymentId}` records can reference immutable appointmentId under
an independent authorization model. An appointment ID alone confers no C5 access.

## Limits for 4H

- Completion/no-show use valid Admin-seeded historical appointments; the gate
  does not wait for a newly booked 30-minute consultation to elapse. Transitions,
  authorization and trusted decision clocks still run in unmodified callables.
- Started-window protection likewise uses a historical availability fixture.
- Concurrency covers overlapping requests and invariant outcomes, not every
  server interleaving or production-scale load.
- Deterministic post-write fault injection remains in the existing transaction
  emulator tests, not the client transport layer.
- No real-device scheduling UI, production indexes, production permissions,
  payment integration or consultation behavior is validated or deployed here.

## Findings and repository hygiene

No concrete C4 production correctness/security defect was exposed. Runtime
handlers, Rules, dependencies, lockfiles and mobile code were not changed in 4G.
The first integration attempt identified two incorrect new-test expectations:
4B requires sorted windows (it does not sort them), and Firebase JS 12.19.0 appends
the HTTP status to callable error messages. The tests now verify rejection of
unsorted input, IANA alias normalization and the exact sanitized conflict message
`Scheduling conflict. Choose another time. [409]`, with no error details.

The full corrected integration run passed **49/49 tests in two suites**: 38 new
scheduling tests plus all 11 existing profile/verification tests. The two negative
safety launches are separate checks, not skipped or passing workflow test counts.
Existing tests were not weakened or removed.

The C4 file review and credential-pattern scan found no private keys, service
accounts, actual Firebase client keys, access tokens or production project IDs
in the changed files. New accounts/data are synthetic; no real patient data is
used. No environment files, generated Functions output, emulator logs or cache
artifacts appear in Git status. The remaining notification TODO is in the
unmodified, inactive legacy booking source; no security bypass was introduced.

The local Java emulator can leave a Firestore process bound after reporting
shutdown on Windows. Task-owned orphan processes were identified by project,
port and command line before being stopped; the separate Rules emulator was
preserved. This tooling issue does not require a backend behavior change.

## Final regression results and readiness

| Gate | Result |
| --- | --- |
| Functions build, Node 22.23.3 | Passed |
| Complete ordinary Functions Jest | 843/843 tests, 15 suites |
| Full Firestore Rules suite | 478/478 tests, 9 suites |
| Scheduling transaction emulator suites (included in Rules) | 69/69: availability 17, booking 25, lifecycle 27 |
| Full callable integration gate | 49/49 tests, 2 suites: scheduling 38, profiles/verification 11 |
| Storage suite | 56/56 tests, 1 suite |
| Mobile typecheck | Passed |
| Mobile Jest | 50/50 tests, 4 suites |
| Expo Doctor | 21/21 checks passed; no issues detected |
| Tracked/untracked whitespace checks | Passed |

All regression commands completed successfully. Storage retains the established
Java Unsafe warnings, expression-limit/null-value errors in expected denial cases
and a shutdown NullPointerException. Expected client permission-denied logs are
also visible in the integration suite. These did not fail an authorization-success
test or produce a nonzero final gate exit. Git emits its existing LF/CRLF warnings.

Classification: **B. READY WITH DOCUMENTED NON-BLOCKING LIMITATIONS**, as listed
above for 4H. No production defect fix was required. Final C4 working status is
7 modified tracked files and 33 untracked source/documentation files, including
the approved 4B–4F work. Nothing is staged. The committed baseline remains
`c2924b9c6852e5a746688d7a9e4f0aa406c2f2bd` on `main`.
No stage, commit, push, package installation or deployment was performed.
