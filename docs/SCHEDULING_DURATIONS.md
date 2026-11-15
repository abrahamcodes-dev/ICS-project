# Scheduling enhancement — 15, 30 and 60 minutes

Updated requirements and implementation, 4 November 2026. Local Firebase
Emulators and simulated payments only. This supersedes fixed 30-minute scheduling
assumptions in Checkpoint 16; historical records are not migrated.

## Requirements

1. Patient duration choices are exactly **15, 30 and 60 minutes**, defaulting to
   30 for existing callers and saved navigation links.
2. Doctors configure availability and **one base price per 30 minutes**.
3. Fifteen minutes costs half the base, 30 costs the base, and 60 costs twice it.
4. Starting times are offered at 15-minute intervals.
5. The complete selected interval must fit uninterrupted availability. Adjacent
   windows are continuous; an actual gap cannot be crossed. Continuous availability
   across adjacent UTC partitions is supported.
6. Both doctor and patient capacity are exclusive for the full half-open interval
   `[startAt, endAt)`. Confirmed appointments and pending/uncertain payment holds
   block every overlapping duration. An appointment may start exactly when another
   ends.
7. Server pricing uses bounded integer minor units. For a 15-minute price, **round
   half a minor unit upward**, never to a whole shilling. Formula:
   `floor(baseMinor / 2) + baseMinor % 2`. Thus a 101-minor-unit base costs
   51 / 101 / 202 minor units for 15 / 30 / 60 minutes. A 60-minute price is twice
   the base, not four rounded 15-minute prices. Explicit zero remains free.
8. Duration, base-rate snapshot, calculated amount and rounding-rule version are
   bound to the existing checkout intent. Paid confirmation, cancellation,
   reconciliation and refunds use the saved amount; no price recalculation occurs
   after a fee change. A UUID replay with another duration is rejected.
9. Existing 30-minute appointments, locks, payment reservations and payment records
   remain valid without backfill or destructive migration.
10. Patient booking displays duration, localized start/end, the 30-minute base rate
    and authoritative selected-duration quote before payment. Client amounts are
    never authoritative.
11. Availability edits preserve all occupied coverage. Consultation access uses
    actual `endAt` plus the existing 15-minute grace; reminders retain the actual
    appointment timestamps and deduplicate normally.
12. Focused unit, UI, emulator, rules and backward-compatibility tests cover these
    contracts. Native results are reported separately.

## Architecture and compatibility

`scheduling/durations.ts` owns the duration enum, 15-minute cells and integer price
rule. Appointment and original booking-lock schemas stay unchanged: duration is
derived from their timestamps. Validators now accept only the three supported
lengths and quarter-hour starts. Missing request duration means 30 minutes.

The original two start locks remain. New bookings additionally create private
`schedulingCellLocks/{resourceCellHash}` records for **every** occupied quarter-hour
of both resources. They carry the original validated full-interval lock envelope.
All conflicting cells and original locks are read before an atomic create. Legacy
30-minute locks are recognized at their original start and at the preceding
quarter-hour when checking an interior cell. No historical lock is rewritten.

Terminal transitions validate original ownership, pre-read the additional cells,
and delete only cells owned by that exact appointment/interval in the same
transaction as the existing terminal decision and any refund intent. A stale
terminal replay cannot delete replacement locks. Missing cells are compatible with
legacy records; conflicting cell ownership fails closed.

New payment reservations have private `holdVersion: 2` and hold every quarter-hour
of both resources. Existing reservations with no version retain their original
two-start-hold interpretation. Uncertain payment expiry never releases capacity on
its own. Reconciliation rechecks the complete interval and its ownership before
confirmation, releases only its own hold keys and refunds late/unavailable
successes through the existing provider workflow.

Coverage is checked separately for every UTC partition intersected by the selected
interval, including the next day when needed. Each partition edit protects the
intersection of every booked/held interval with that day. Adjacent windows are
merged for coverage/discovery calculations only; stored windows, revision checks,
started-window protection and IANA-zone conversion remain intact. Availability
selection now supports quarter-hour boundaries, including 15-minute windows.

Server quotes are returned by the existing `getConsultationFee` operation with the
selected duration and `totalMinor`. Checkout revalidates the quote revision and
computes the price again server-side. New payments store `durationMinutes`,
`baseAmountMinor`, `roundingRule: half-up-minor-v1`, actual start/end and immutable
amount. Old 30-minute payment views infer duration/base from their existing fields;
stored amounts are not rewritten. The original provider amount/currency/payment-ID
checks, callback deduplication, audit trail and refund identities remain intact.

The patient selects duration on the existing doctor availability screen. Typed
navigation carries it into checkout; existing links fall back to 30. Checkout
requires an authoritative selected-duration quote (it cannot substitute a base
quote for a missing 15-/60-minute quote). Doctor fee editing explicitly says
“per 30 minutes.” No additional profile-completion or payment-provider screen is
introduced. UI-12 tokens, scrolling and existing safe-area/keyboard primitives are
reused; no dependencies or native changes are needed.

## Clinical, privacy and deletion safeguards

The Firestore appointment/signaling envelopes recognize exactly 15/30/60-minute
timestamp intervals and quarter-hour starts, with existing participant, canonical
identity, lifecycle and field validation retained. A doctor chat-history regression
hit the 1,000-expression rule limit during development. The appointment validator
now uses exact epoch-millisecond duration membership and a cached canonical actor.
Redundant `hasAll` walks were removed only where every required field is directly
read and validated, so missing keys fail closed; `hasOnly` still rejects extra
fields. A rules regression removes each required appointment field and verifies
denial. Timestamp arithmetic uses
[`Timestamp.toMillis()`](https://firebase.google.com/docs/reference/rules/rules.Timestamp#tomillis),
with explicit nanosecond rejection for slot boundaries. Tests caught and corrected
an initial timestamp-accessor mismatch before release. No private-data grants were added.
The additional cell collection inherits default deny for all client reads/writes.

Chat/call access continues to use actual appointment end plus the unchanged grace.
The mobile upcoming subscription and deletion guard look back 75 minutes to cover
a 60-minute consultation plus grace. Deletion examines actual end times rather
than assuming the first candidate has the same duration as every other booking;
a full ambiguous scan fails closed. Pending-payment deletion restrictions remain.
Consent, attachments, doctor verification and clinical-history ownership remain
under their existing authorization rules. No clinical record or financial audit
is destroyed by this enhancement.

## Verification and remaining limits

Final validation:

| Check | Actual result |
|---|---|
| Functions build and final TypeScript validation | Passed. |
| Mobile TypeScript | Passed. |
| Focused backend unit/regression run | **233 passed / 7 suites**, covering durations/prices, booking/availability, reminder deduplication for every duration, prescriptions, attachments and deletion policy. |
| Mobile scheduling/profile/auth/deletion run | **85 passed / 6 suites**. |
| Final checkout/payment UI/service run | **31 passed / 3 suites**; overlaps the four duration-checkout tests above. |
| Booking/payment emulator run | **34 passed**: prior payment regressions plus all durations, pricing, mixed-duration holds/races, legacy records and cross-midnight coverage. |
| Clinical privacy emulator run | **3 passed**, one per duration, including updated doctor identities and authorized/unauthorized appointment/message reads. |
| Final boundary/care emulator recheck | **2 passed**: cross-midnight recheck and 60-minute active-care deletion guard. The cross-midnight case overlaps the 34-case run; **38 distinct emulator cases** passed across the focused runs. |
| Final appointment/message/audio-video signaling rules run | **133 passed / 3 suites**, including the missing-required-field regression, closed-call history and updated identities. |
| Additional rules coverage | Lifecycle, consultation and financial/cell-privacy suites passed during targeted runs; the fixed-grid expectation and earlier rule regressions were corrected and affected checks rerun. |
| `git diff --check` and new-file whitespace validation | Passed. |

Counts from overlapping runs are not summed as distinct tests. Initial failures
included old 30-minute-only expectations, the Rules expression limit and the
timestamp-accessor mismatch described above. They were corrected and relevant
checks passed; no unresolved automated assertion failure remains.

Synthetic emulator tests use only `demo-calladoc-payments-tests` on its isolated ports;
rules tests use `demo-calladoc-rules` on 8085. Main emulator data is not reset.
Clinical boundary tests inject only their fixture clock; no host clock is changed.

Pixel 7 verification remains pending while Metro at `127.0.0.1:8081` refuses
connections. Samsung remains intentionally disconnected. No Android rebuild,
networking change, dependency upgrade, production access, deployment or Git
publication is part of this work. The Node 22 parity, real Daraja integration,
approved financial/retention policies, reconciliation operations and manual-review
limitations from [Checkpoint 16](CHECKPOINT_16.md) still apply.

Once Metro/main emulators are available: configure a synthetic doctor's 30-minute
rate; inspect 15/30/60-minute availability and start/end labels; confirm an odd
minor-unit half-rate quote; exercise demo success/cancel/refund using the existing
operator script; verify conflict rejection and light/dark layouts. Never use
established clinical records merely for screenshots.

## Files

- New backend: `functions/src/scheduling/{durations,cellLocks}.ts`.
- Backend integration: scheduling constants, validation, policy, intervals,
  reservation guards, booking/availability/lifecycle handlers and transaction
  adapter; payment engine, quotes and reservation reader; deletion guard;
  `functions/firestore.rules`.
- Shared contracts: `shared/types/{scheduling,payments}.d.ts`.
- Mobile: scheduling/payment/local-availability/appointment-read services,
  Payments component, patient availability/booking screens, typed route parameters
  and doctor availability explanatory text.
- Tests: new `functions/__tests__/durations.test.ts` and
  `mobile/__tests__/durationCheckout.test.js`; expanded payment emulator and
  notification tests; updated scheduling, local-time, UI and rules regression
  expectations for the intentional quarter-hour contract.
- Documentation: this document and the current-behavior link in Checkpoint 16.
