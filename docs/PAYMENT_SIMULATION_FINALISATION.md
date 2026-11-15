# In-app payment simulation finalisation

14 November 2026. Simulation only; no real M-Pesa integration or live deployment.

## Previous limitation and flow

Checkout created a payment and held the slot, but only the internal operator script
could deliver provider success/decline. The patient could only refresh or cancel.
`submitSimulatedPaymentDecision` now accepts exactly `{paymentId, decision}` where
decision is `approve` or `decline`. The existing authenticated payment session calls
it from checkout or Profile > Payment history. No amount, status, event ID or PIN is
accepted. The confirmation card shows CallADoc, the consultation, authoritative KES
amount, doctor, time/duration, expiry and explicit no-real-money notice.

The server authenticates the active owner patient, verifies simulator-only record
markers, reconciles prior evidence/expiry, and records one immutable patient-decision
provider event. Its transaction rechecks owner, payment/provider amount binding and
held reservation; approval additionally checks exact holds, locks, doctor approval,
availability, lead time and overlapping appointments. Existing reconciliation alone
creates the appointment. Concurrent eligibility loss after delivery follows the
existing late/unavailable-success refund policy. No Rules changes were needed.

Approve/decline races cannot overwrite the first event. A lost reply or reconciliation
failure leaves durable evidence; repeat approval, Refresh payment status or opening
the saved receipt resumes authoritative reconciliation. Terminal payments return
their current status rather than becoming newly paid. Cancel/refund behavior and
zero-fee bookings are unchanged. Buttons share an immediate submission lock, and
late responses are discarded on teardown/account change. A patient can recover a
pending record after restart through Profile > Payment history and approve there.

## Environments

Default behavior remains the exact existing local demo emulator allowlist. The
isolated automated suite uses demo-calladoc-payments-tests, Auth 9106, Functions
5106 and Firestore 8106; it does not clear or import the ordinary demo database.

Future hosted academic demonstrations require BOTH server-only settings:

```
PAYMENT_SIMULATION_MODE=academic-demo
PAYMENT_SIMULATION_PROJECT_ID=<dedicated-project-id-ending-in-academic-demo>
```

The runtime GCLOUD_PROJECT must exactly equal that ID. The ID must end in
`-academic-demo`; emulator flags/hosts must be absent. Unconfigured/mixed/other
projects fail closed. These settings belong only in a separate synthetic-data
Firebase project, never the real clinical/payment project or EXPO_PUBLIC variables.
This does not enable any real financial provider: record provider/method/demo/currency
markers are checked before simulated events. No live project was configured or tested.

Before a future separately approved hosted test: verify Node 22, deploy the reviewed
backend/Rules/indexes to that dedicated project, use synthetic approved doctors and
patients, configure Firebase Auth and mobile public configuration, and verify all
payment flows there. Hosted IAM, deployed indexes and scheduler operation remain
unverified. Deployment is outside this change. Existing financial/privacy policy and
operational limitations in CHECKPOINT_16.md still apply.

## Manual Android acceptance

After selecting an existing Node 22 runtime, build from the repository root:

```powershell
npm --prefix functions run build
```

If the main demo suite is not running, start it in a separate terminal (replace
the Node path with the installed Node 22 executable; this script does not install):

```powershell
.\scripts\Start-DemoEmulators.ps1 -Node22 '<full-path-to-Node-22-node.exe>' -JavaHome 'C:\Program Files\Android\Android Studio\jbr'
```

Do not start a second suite over occupied main ports. After a build, deliberately
restart the existing demo suite if needed to load the new callable, preserving its
fixtures. In another terminal:

```powershell
cd mobile
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS='true'
$env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST='127.0.0.1'
npx expo start --dev-client
```

For each authorized USB device/emulator using this host setting, in another terminal:

```powershell
$paymentAdb="$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $paymentAdb devices
$paymentDevice='emulator-5554' # replace with the authorized Samsung serial as needed
foreach($paymentPort in 8081,9099,8080,5001,9199){
  & $paymentAdb -s $paymentDevice reverse "tcp:$paymentPort" "tcp:$paymentPort"
}
```

Open/reload the existing development client connected to that Metro session.

1. Build Functions and start/restart the existing demo-calladoc emulator suite using
   the documented Node 22/Java setup. Preserve/export existing fixtures first if a
   restart is necessary; do not clear/import-overwrite them. Start Metro with emulator
   mode enabled. No new native dependency or APK rebuild is required by this change.
2. For USB-connected Pixel 7/A53 with the current loopback default, use authorized
   `adb -s <serial> reverse tcp:<port> tcp:<port>` for 8081, 9099, 8080, 5001 and 9199.
   Alternatively use the already configured Android emulator host override. Do not
   change live Firebase settings or expose emulator ports to the internet.
3. Sign in as a synthetic approved doctor. Profile > Consultation fee & demo payments:
   save a nonzero per-30-minute fee and future availability at least five minutes ahead.
4. Sign in as a synthetic patient. Select doctor, available time and 15/30/60-minute
   duration. Review the backend quote, enter test number 0700000000 and select Confirm
   demo payment. Expect pending reservation; no confirmed appointment yet.
5. Verify the simulated confirmation card: Pay CallADoc, correct KES amount/date/
   duration, no real money notice and no PIN field. Approve simulated payment.
   Expect server-confirmed success, then View confirmed appointment opens Appointments.
   Verify the same appointment in the doctor's account. No provider terminal command.
6. On distinct fresh future slots, test Decline simulated payment and Cancel pending
   demo payment. No appointment should be confirmed. Test natural five-minute expiry
   (or earlier booking-lead boundary); Refresh must show expiry and release the hold.
7. Start another pending payment, leave/restart the app and reopen Profile > Payment
   history > receipt. Refresh then approve there. Use history/refresh after a network
   interruption; do not start a new intent when its status is uncertain.
8. Race two synthetic patients for one slot; only one reservation should succeed.
   Tap approval repeatedly, cancel a confirmed future appointment and refresh its
   receipt to verify the existing simulated refund. Check light/dark appearance.

Native Android acceptance and hosted Firebase execution must be recorded separately;
automated rendered UI tests do not establish device results.

## Verification on 14 November 2026

- Backend payment-policy, export, booking, availability, lifecycle, durations and
  notification regressions: 307/307 passed, seven suites.
- Mobile payment UI/service, duration checkout, composed booking screen,
  appointments, scheduling and patient profile regressions: 94/94 passed, seven suites.
- Full isolated payment emulator suite: process completed successfully, exit 0.
  The unfiltered file declares 51 cases (32 ordinary plus 19 parameterized), without
  skip/todo/only markers. Includes 13 new decision-flow cases and existing payment,
  refund, concurrency, duration and clinical-access regressions. The verbose CLI
  output exceeded terminal capture; the CLI success record is in firebase-debug.log.
- Functions build and source/test TypeScript checks passed; mobile TypeScript passed.
- Focused financial/booking/lifecycle Firestore Rules: 57/57 passed, three suites,
  exit 0 (459.141 seconds). Output: functions/payment-finalisation-rules.log.
  Expected permission-denied warnings are successful denial assertions. No Rules
  were modified by this task. Isolated emulator processes shut down after testing.
- Changed-file whitespace checks passed.

The first mobile run had one five-second UI timeout and six obsolete booking-test
failures targeting the pre-payment adapter. The UI suite passed unchanged on retry;
booking tests now exercise the actual payment checkout, including duplicate taps,
conflict, logout and terminal replay. The final seven-suite run passed 94/94 with
unchanged timeout thresholds.

The first Firebase CLI start was blocked by sandbox config access before testing.
The authorized retry used a fresh unsigned CLI configuration and local emulator
cache. CLI 15.32.0 used JBR 25.0.3 and existing host Node 24.16.0 as its fallback,
despite configured Node 22. No dependencies/runtimes were installed. Node 22 parity
remains a pre-hosted-testing check. No native build, Android interaction, live Firebase
test, real financial transaction, commit or push was performed.

## Changed files

| Files | Purpose |
|---|---|
| functions/src/payments/simulation.ts | Owner-only transactional decision validation and existing reconciliation. |
| functions/src/payments/provider.ts | Optional trusted transaction guard on durable provider-event delivery. |
| functions/src/payments/policy.ts; functions/.env.example | Default local isolation plus explicit dedicated hosted-demo configuration. |
| functions/src/payments/callables.ts; functions/src/index.ts | Authenticated decision callable and export. |
| mobile/src/services/payments.ts | Narrow decision transport with existing account/session protection. |
| mobile/src/components/Payments.tsx | Simulated confirmation, processing/terminal states and history recovery. |
| mobile/src/screens/patient/PatientExperience.tsx | Appointment navigation from recovered profile receipts. |
| functions/__tests__/paymentPolicy.test.ts; functions/__tests__/exportSurface.test.ts | Configuration fail-closed tests and approved export boundary. |
| functions/emulator-checks/payments.test.ts | Thirteen added real-local-emulator decision/security/retry/refund cases. |
| mobile/__tests__/paymentsUI.test.js; mobile/__tests__/paymentsService.test.js; mobile/__tests__/bookingScreen.test.js | Decision transport, current composed booking, processing, navigation and recovery regressions. |
| docs/CHECKPOINT_16.md; docs/PAYMENT_SIMULATION_FINALISATION.md | Current-flow cross-reference, configuration, evidence and manual acceptance instructions. |

Existing unrelated uncommitted work was preserved. No package, lockfile, Firebase
Rules, indexes or native build configuration changes were needed by this task.
