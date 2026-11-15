# Checkpoint 16 — secure simulated consultation payments

Current patient approval flow: [In-app payment simulation finalisation](PAYMENT_SIMULATION_FINALISATION.md)
(14 November 2026) supersedes the operator-only approval and emulator-only deployment
statements below. Default local guards remain; hosted simulation requires an explicit,
dedicated academic-demo project. Original checkpoint results remain historical.

Current scheduling behavior: [15/30/60-minute scheduling enhancement](SCHEDULING_DURATIONS.md)
supersedes fixed 30-minute statements below. The doctor rate is per 30 minutes;
selected-duration quotes, full-interval occupancy and legacy compatibility are
documented there. The original checkpoint test evidence below remains historical.

Development only, 4 November 2026. **No real payment, STK Push, PIN, Safaricom
credential, production resource or deployment is involved.** All references,
receipts, refunds and doctor totals are simulated. No financial/legal compliance
claim is made. The original brief ended mid-sentence; the user's supplied
continuation (UI, tests, device checks, documentation and acceptance) is included
in this implementation's scope.

## Architecture and boundaries

`payments/provider.ts` defines a replaceable `PaymentProvider` contract:
`initiate`, `lookup`, `cancel`, `refund`. The implementation is
`SimulatedMpesaProvider`, backed by private Firestore provider records, immutable
notification events and a reconciliation queue. Initiation acknowledges a
simulated STK request; it never contacts a phone. Provider operations are
idempotent for the server-derived payment ID. Refund identity is fixed per charge.

All payment/pricing Functions and simulation operations fail closed unless:

- `FUNCTIONS_EMULATOR` is exactly `true`; and
- project/Firestore host are exactly `demo-calladoc` / `127.0.0.1:8080`, or the
  isolated test pair `demo-calladoc-payments-tests` / `127.0.0.1:8106`.

There is no simulation outcome/callback Function. The mobile app cannot mark paid,
submit provider results, alter amounts, refund itself or forge an audit event.
Only a trusted local operator/test can call the internal simulation API. The
operator script additionally requires explicit `CHECKPOINT16_SIMULATION` opt-in
matching the demo project. Normal production Firebase configuration is unchanged.

Business callables: `getConsultationFee`, `setDoctorConsultationFee`,
`createConsultationCheckout`, `getConsultationPayment`,
`cancelConsultationPayment`, `retryConsultationRefund`,
`listConsultationPayments`, `getDoctorPaymentSummary`.
`reconcileConsultationPayments` is a scheduled backend worker, not a client API.

## Pricing and money

`doctorFees/{doctorUid}` is a separate private configuration because the existing
canonical doctor/approval/public-profile schemas are strict. Setting a fee reuses
the complete existing approved-doctor/source/profile/projection binding check.
Optimistic `expectedRevision` prevents overwriting another fee edit. Each accepted
revision is also recorded in private `doctorFees/{uid}/history/{revision}`.

Currency is KES. Amounts are safe **integer minor units**: KSh 1,500.25 is 150025.
No floating point decimal multiplication/parsing is used for money. The form
parses whole/fractional strings separately. Provisional development range is zero
(explicitly free) or 100–10000000 minor units (KSh 1–100,000). Server validates
the range. This is an engineering limit, not an approved pricing policy.

The patient sees the server fee/revision before confirmation. Creation checks the
expected revision and snapshots amount, currency, professional display, appointment
time and development refund-policy version. Later price changes cannot alter
that intent. A missing fee is **unconfigured**, never implicitly free. Existing
appointments remain valid without migration; new bookings require a configured
fee. Existing synthetic approved doctors should explicitly save a fee, including
zero, before testing new bookings.

## Records, access and retention

| Location | Contents and role |
|---|---|
| `doctorFees/{uid}` and `/history/{revision}` | Approved doctor's fee/revision and server timestamps; private, callable-delivered quote. |
| `consultationPayments/{paymentId}` | Patient/doctor IDs, snapshotted fee and display, reservation/appointment IDs, currency, provider/method, state, intent UUID, references, reason, created/updated/expiry/confirmation timestamps, next reconciliation time, demo flag and schema version. |
| `/audit/{event}` under payment | Server-only state transitions, reason, time, actor when applicable and provider sequence. A same-state replay is not a second transition. |
| `paymentReservations/{id}` | Owner bindings, temporary scheduled-appointment draft, expiry and held/confirmed/released state. Draft is not a published appointment. |
| `paymentSlotHolds/{deterministicLockId}` | Reservation pointer for each doctor/patient slot. Both are created/released atomically. |
| `simulatedProviderTransactions/{paymentId}` | Durable simulator acknowledgement/status/reference, exact amount/currency/payment binding, notification sequence and refund evidence. |
| `simulatedProviderEvents/{digest}` | Immutable trusted test notification, event ID digest, sequence and timestamp; conflicting event replay rejected. |
| `providerReconcileQueue/{paymentId}` | Durable notification sequence and due time, so a crash after notification recording does not lose a late charge. |

Existing Firestore default-deny rules already protect every listed path, including
subcollections. No rules were weakened or new client financial permissions added.
Even administrator client SDKs cannot directly read/write these collections.
Callables check canonical active identity and participant ownership and return
sanitized DTOs. Patient/doctor histories are scoped to their own ID, with bounded
20-record chronological pages and owner-checked cursors. Doctor aggregates query
only their own records and validate safe-integer totals; confirmed, refunded,
pending-refund and failed-refund totals remain separate. Doctors receive no
patient phone, PIN or financial credential.

Kenyan test numbers normalize `07…`, `01…`, `254…` and `+254…` forms to the same
format. Validation occurs on client and server. **The number is discarded after
validation**: it is not saved in the payment/provider/audit record or sent to an
external transport. A real provider would require a separately approved phone-data
handling policy. There is no PIN/card input or storage.

Payments, provider evidence, price history and audits remain private and retained
pending approved financial/clinical/privacy retention decisions. They are not
erased by CP15's eligible-profile cleanup. No retention period or statutory legal
basis is invented; UID references remain personal/pseudonymous. Backups, debug
logs and previously exported copies need separate approved operator governance.

## Booking and payment state machines

1. The patient selects an existing available slot and sees doctor/specialty,
   online consultation, local date/time, fee, total, test number and demo warning.
2. One transaction validates the active patient, fully approved doctor, quote
   revision, existing availability/revision, 30-minute alignment, five-minute
   lead, scheduling horizon and both patient/doctor booking locks and payment holds.
3. A nonzero fee creates a durable payment intent, reservation and both temporary
   holds. The expiry is at most five minutes and never beyond the booking lead
   boundary. No appointment exists yet. Payment ID is the existing deterministic
   appointment hash of authenticated patient UID + canonical request UUID.
4. Provider initiation happens outside Firestore with that same idempotent ID.
   A lost provider/client reply leaves a recoverable `created` intent. Refresh or
   the worker resumes it; it does not issue another charge identity.
5. Trusted lookup/reconciliation processes evidence. Payment ID, currency and
   amount must match before confirmation/refund. Binding failures leave the hold
   protected for operator investigation rather than trusting an unrelated result.
6. Timely success rechecks canonical eligibility, approval binding, availability,
   timing and exact hold ownership. In one transaction it creates the existing
   exact appointment/booking-lock schemas, releases holds, confirms reservation,
   records provider confirmation time and transitions payment to `succeeded`.
7. Definitive decline/cancellation/expiry releases only this reservation's holds.
   Timeout/uncertain or delayed evidence becomes `review_required` and keeps the
   holds until authoritative reconciliation. Expiry alone is not permission to
   release an uncertain charge or start a second charge.
8. Late successful evidence after expiry, replacement booking or loss of account/
   doctor eligibility never creates an unavailable appointment. It records
   `refund_pending`, releases only owned holds and preserves the charge/evidence.
9. Refund lookup processes `refund_pending → refunded` or `refund_failed`.
   An authorized participant can retry a failed refund, which queues that same
   refund intent. Retry is not itself refund completion.

Supported payment states: `created`, `pending`, `succeeded`, `failed`, `cancelled`,
`expired`, `review_required`, `refund_pending`, `refunded`, `refund_failed`.
The transition policy rejects invalid changes; `refunded` cannot become paid
again. A late actual success after a prior definitive failure may move directly
to refund pending, preserving the conflict rather than pretending it was a booking.
Appointment status remains the existing scheduled/cancelled/completed/no-show
contract and is never replaced by a payment status.

An explicit zero fee uses the existing appointment validation, coverage, locks and
notification writer atomically. It creates no fake successful M-Pesa transaction.
The legacy booking endpoint also requires an explicitly configured zero fee for
new appointments and checks temporary holds. Replays of existing appointments
remain supported. Consultation/chat/call/prescription access checks stay intact:
new paid appointments can reach them only after verified booking confirmation;
existing historical/synthetic appointments are preserved.

## Concurrency and recovery guarantees

- A patient UUID identifies one intent. Same intent replay returns its original
  record/snapshot; conflicting reuse is rejected. A new UUID is appropriate only
  after a definitive failed/cancelled/expired result and explicit user action.
- Deterministic doctor and patient holds plus the existing booking locks are read
  in the same Firestore transaction, serializing competing reservations and free
  bookings. Confirmation reads them again and cannot steal a replacement booking.
- The existing availability transaction adapter was extracted for reuse, with
  optional payment hooks for existing injected tests. The production adapter
  always supplies them. Discovery omits held slots; availability replacement
  treats held appointment drafts as protected coverage, including multi-day edits.
- All transaction reads precede writes. External provider calls are outside
  transactions and must be idempotent. Status transitions and audits serialize on
  the payment record. Provider event IDs deduplicate delivery independently.
- Queue sequence fencing prevents an older lookup from clearing a newly arrived
  notification. A crash leaves either a due payment or durable notification queue.
  Due-worker processing is bounded; one failed entry does not abort other entries.
- The mobile session checks account identity before/after requests and is disposed
  on teardown. No payment outcome is inferred from a local button press. No local
  storage of phone, provider credentials or financial state was added. Lost-screen/
  restart recovery uses authorized Payment history; the checkout warns against
  starting another intent after an uncertain result.

## Cancellation, refunds and unresolved business decisions

The versioned development default is a full simulated refund for a valid patient
or doctor cancellation before start, and for late/unbookable success. Cancellation
uses the existing role/status/timing policy. A payment read/plan was added before
the existing lifecycle transaction writes, so appointment cancellation, lock
release and refund queueing commit together. Replays do not duplicate refunds.
These defaults are provisional, not legally binding cancellation/refund promises.
Any policy revision requires a new version, reviewed backend behavior and tests;
the original request's policy version is retained.

Duplicate initiation/notifications cannot duplicate the modeled charge. Distinct
late successful intents are individually refunded without replacing another
appointment. Refund failures retain evidence and a retry state. Setup failures,
clinical disputes, unexpected external duplicate charge references, partial
refunds, reversals/chargebacks, payouts and fee/tax allocation have no approved
business rules or operational support workflow. **No automatic clinical failure
refund is invented.** These require a verified authorized manual-review service
and policy before production; the simulator does not pretend to implement them.

## CP13–15 integration

Consent and medical attachment rules/access are unchanged. Payment does not grant
medical-record sharing consent or additional private profile/document access.
Existing consultation-bound identity, chat, prescriptions and clinical lifecycle
remain authorized by their existing services.

CP15 checks unresolved patient/doctor payments inside its acceptance transaction:
created, pending, review required and pending/failed refunds block deletion with a
specific explanation to resolve them in Payment history. This query serializes
with account/financial creation. Successful future appointments remain covered by
the existing care commitment guard. Definitively failed/free-of-care accounts may
proceed with deletion; a later provider success is still reconciled/refunded by
trusted workers even after canonical disablement/Auth deletion. Financial evidence
is retained. Disabled accounts cannot initiate another payment or appointment.

## Local operator and device procedure

The original `demo-calladoc` Auth/Functions/Storage and Metro ports were unavailable
during this checkpoint. They were not reset/reconfigured. Automated tests used the
isolated demo project/ports below; existing main emulator records were untouched.

With the existing main emulator setup running and Functions built:

```powershell
node functions/node_modules/typescript/bin/tsc -p functions/tsconfig.json
$env:GCLOUD_PROJECT='demo-calladoc'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:CHECKPOINT16_SIMULATION='demo-calladoc'
node functions/scripts/simulatePayment.cjs <payment-id> success <stable-event-uuid>
node functions/scripts/simulatePayment.cjs --due
```

Use only synthetic fixtures. The pending demo receipt includes selectable
`DEMO-MPESA-<payment-id>`; use its 64-character ID suffix. Outcomes are
`acknowledged`, `success`, `declined`, `cancelled`, `timeout`, `not_charged`,
`delayed`, `refund_fail`, `refund_recover`. Retry a lost outcome command with the
same event UUID; a different outcome needs a new UUID. `reconcile` in place of an
outcome performs lookup without fabricating a notification. `--due` processes a
bounded batch and reports only processed/failed counts.

Cloud Scheduler does not tick in the emulator. Use `--due`, status refresh or the
operator outcome command for local recovery; repeat `--due` for further pages.
Do not drop a hold merely because its expiry passed. A timeout can remain in
review until `not_charged` or definitive success is recorded by the simulator.
For refund failure testing, deliver `refund_fail`, cancel via the existing app,
refresh to see failure, deliver `refund_recover`, request the recorded refund retry
and refresh/process due work. No consultation needs to be completed for testing.

Pixel 7 preview, once Metro/main emulators are available:

1. Sign in as an existing synthetic approved doctor. Profile → Consultation fee &
   demo payments → save a fee (or explicitly zero for the free case).
2. As a synthetic patient, choose an available slot and review checkout. Enter a
   test number such as `0700000000`; no PIN or actual phone interaction is needed.
3. Confirm, inspect pending, deliver a trusted outcome using the local script,
   then refresh. Check success/decline/cancellation, history, receipt and refunds.
4. Inspect doctor totals/history and both light/dark themes. Reuse existing
   availability actions; never cancel/modify established clinical records simply
   for a screenshot.

**Native verification remains pending:** Metro `127.0.0.1:8081` refused connections.
Samsung A14 is intentionally disconnected and is not required. No native rebuild,
dependency upgrade or networking change is needed or was performed.

## Automated verification

Test configuration `functions/firebase.payments-test.json` uses only
`demo-calladoc-payments-tests`: Auth 9106, Functions 5106, Firestore 8106, separate
hub/logging ports. Its predeploy command deliberately throws. The test file also
asserts those exact endpoints before initializing any SDK. Test fixtures are new
`cp16-…@example.test` accounts. The isolated emulator exits after testing; main
data is not cleared. Configured runtime is Node 22; this machine's emulator used
installed Node **24.16.0** as its fallback. No runtime/dependency was installed or
upgraded. Node 22 parity remains a release check.

Run from `functions/`, with Android Studio's bundled Java available:

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.json
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only auth,functions,firestore --project demo-calladoc-payments-tests --config firebase.payments-test.json "node node_modules/jest/bin/jest.js --config jest.payments-emulator.config.js --runInBand"
```

Final automated evidence:

| Check | Actual result |
|---|---|
| Mobile TypeScript `--noEmit` | Passed, exit 0. |
| Functions TypeScript build | Passed, exit 0. |
| Focused backend Jest | 241 passed, 8 suites. |
| Additional backend regressions | 407 passed, 6 suites; overlaps the booking/availability suites above. |
| Initial mobile payment/profile/deletion checks | 88 passed, 6 suites. |
| Final mobile payments/auth/registration/consent/prescription/attachment checks | 98 passed, 10 suites; overlaps payment UI/service checks above. |
| Existing booking/availability/lifecycle/chat Firestore rules | 106 passed, 4 suites, isolated port 8085. |
| New financial Firestore rules | 4 passed, 1 suite: anonymous/patient/doctor/administrator each denied direct reads, lists, creates, updates and deletes across all financial categories. |
| Final end-to-end payment emulator run | 23 passed, 1 suite, isolated Auth/Functions/Firestore. |
| Final audit metadata recheck | 3 passed, 20 intentionally skipped by name filter; success/provider sequence and both participant cancellation/refund actors. |
| Operator script syntax | Passed `node --check`. |
| `git diff --check` and additional new-file whitespace scan | Passed. |

These runs overlap; their counts are not summed as distinct tests. The full
payment emulator suite covers fee authorization/revisions/free booking, protected
legacy booking, initiation/callback replay, decline/cancel/timeout/delay/expiry,
reservation races, price snapshots, late-success conflict/refund, refund failures
and retries, private history/summary/audits, deletion blocking, disabled actors,
held availability, provider evidence binding, concurrent identical initiation
and late charge recovery after deletion starts. Existing clinical schemas and
eligibility tests also passed. The first attempt to launch the final filtered
audit command failed in Windows shell quoting before Jest executed; the corrected
temporary argv wrapper ran all three intended cases successfully. No unresolved
automated assertion/build failures remain.

Financial indexes include owner/created-time history pages, owner/status deletion
checks and doctor/status/amount aggregation coverage. Emulator success is not a
production query-plan/index verification. Review the deployed plans/indexes before
release using the [official Firebase aggregation documentation](https://firebase.google.com/docs/firestore/query-data/aggregation-queries).

## Production replacement requirements

1. Obtain approved pricing/refund/tax/receipt, privacy, retention and dispute/
   support policies. Establish merchant onboarding, settlement and operational
   responsibilities. No simulated total is money received or settled.
2. Implement a real `PaymentProvider` using the approved Safaricom Daraja products
   and current official API/security requirements. Use server-side managed
   secrets/OAuth and separate approved environments, never mobile credentials.
   Phone processing, request/provider IDs and reconciliation evidence need an
   approved data-minimization/retention design. Do not persist PINs.
3. Replace simulator evidence delivery with a secured provider-notification
   ingestion boundary, validate authenticity using the provider's supported
   mechanisms, bind IDs/currency/amount/recipient to the saved intent, record the
   event durably and reconcile authoritative status. Never trust a client success
   message or an unverified callback body.
4. Preserve one provider intent and refund identity across retries. Validate the
   real provider's idempotency/lookup guarantees; if a response is uncertain,
   reconcile rather than blindly sending another STK/refund request. Do not assume
   the simulator's transaction semantics exist in an external API. Choose and
   approve refund/reversal products and partial-refund policy explicitly.
5. Operate scheduled/queued reconciliation with least-privileged IAM, backoff,
   alerts, dead-letter/manual review and fair pagination/load controls. Monitor
   due holds, orphan anomalies, mismatched evidence and failed refunds. Real
   provider latency, expiry and backfill/late-notification behavior need testing.
6. Keep `SimulatedMpesaProvider` and operator controls impossible to use against
   production. Replace the explicit demo-only application gate with a separately
   reviewed real-provider configuration; never widen the simulation guard.
7. Deploy reviewed financial indexes/security/backend changes separately. Drain
   old booking handler versions during rollout so an older unguarded booking
   implementation cannot compete with new holds. Verify existing historical
   appointments remain accessible. Complete Node 22 and native/device checks.

## Files

| Group | Exact paths (brace groups list individual files) |
|---|---|
| New backend | `functions/src/payments/{policy,provider,reservations,ledger,engine,callables}.ts` |
| New mobile/contract | `mobile/src/{components/Payments.tsx,services/payments.ts}`; `shared/types/payments.d.ts` |
| Operator/test configuration | `functions/scripts/simulatePayment.cjs`; `functions/firebase.payments-test.json`; `functions/jest.payments-emulator.config.js` |
| New tests | `functions/__tests__/paymentPolicy.test.ts`; `functions/__tests__/rules/payments.rules.test.ts`; `functions/emulator-checks/payments.test.ts`; `mobile/__tests__/payments{UI,Service}.test.js` |
| Scheduling integration | `functions/src/scheduling/{availabilityStore,availabilityHandlers,reservationGuards,bookingHandler,lifecycleHandlers}.ts` |
| Backend registration/indexes | `functions/src/index.ts`; `functions/firestore.indexes.json` |
| Deletion integration | `functions/src/accounts/{deletionCallables,deletionPolicy}.ts`; `mobile/src/services/accountDeletion.ts`; `mobile/src/components/AccountDeletion.tsx` |
| Screen integration | `mobile/src/screens/patient/{BookAppointmentScreen,PatientExperience,PatientScheduling}.tsx`; `mobile/src/screens/doctor/DoctorWorkspace.tsx` |
| Existing test contract/fixtures | `functions/__tests__/{availabilityFixtures.ts,exportSurface.test.ts}`; `functions/__tests__/rules/booking.rules.test.ts`; `functions/__tests__/integration/{schedulingFixtures.ts,scheduling.integration.test.ts}` |
| Documentation | `docs/CHECKPOINT_16.md`; CP16 cross-reference in `docs/CHECKPOINT_15.md` |

No production data, Firebase rules, native configuration or dependencies changed.
Unrelated working-tree changes were preserved; nothing staged, committed, pushed
or deployed.
