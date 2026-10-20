# Checkpoint 9C — mobile scheduling

This checkpoint connects the existing transactional scheduling backend to the
patient and approved-doctor interfaces. It does not deploy Firebase, change Rules,
implement payments, or claim Android device verification.

## Architecture and security

`schedulingService.ts` uses the existing connected `functions` instance from
`firebaseConfig.ts`. Its account-scoped sessions validate response DTOs and reject
late responses after disposal/logout. UI request generations discard results from
old pages, dates and mounted screens. Canonical backend identity remains the
authority; route parameters, local clocks and token role claims do not authorize.

All mutations reuse `replaceDoctorAvailabilityDay`, `bookAppointment` and
`cancelAppointment` without changing their semantics. Client scheduling writes
remain denied. The obsolete direct-write `appointmentService.ts` and
`useAppointments.ts` are not used by this workflow.

Two additional **read-only** callables are exported (21 production-source exports
in total; source export is not deployment):

| Callable | Input | Response and authorization |
| --- | --- | --- |
| `listApprovedDoctors` | `{limit?: number, after?: string}` | Active canonical patient only. `{items: [{uid, professionalName, specialty}], nextCursor: string \| null}`. Default 10, maximum 20 results. |
| `getOwnDoctorAvailabilityDay` | `{utcDate: string}` | Active currently approved canonical doctor, UID derived from Auth. `{day: null}` or `{day: {utcDate, timeZone, revision, windows: [{startAt, endAt}]}}`. |

Both use read-only Firestore transactions. Directory queries scan at most 40
public-projection IDs, ordered by document ID, per invocation. Ineligible doctors
are omitted; no refill loop runs. Each returned doctor must pass the existing
private/public/approved-request binding validator. Malformed approval bindings
fail the page closed. The continuation cursor is the last consumed ID, including
excluded records; a short/empty page may still have a cursor. A final empty page
is possible after an exactly full scan. Private professional/credential fields
are never returned. Own-day reads validate real stored Timestamp values, complete
schema, doctor/date ownership, and revision. Missing differs from malformed.

No Firestore/Storage Rules or indexes are changed. Public doctor collection lists,
raw availability reads and booking-lock access remain denied to clients.

## Doctor workflow

1. Sign in as an active approved doctor. Pending/rejected doctors remain in their
   verification workflow and cannot enter availability management.
2. Open **Schedule → Edit availability**.
3. Enter a **UTC scheduling date**. Load the saved windows, time-zone metadata and
   revision, or revision 0 for a new day.
4. Add/edit/remove windows, at most eight. Enter UTC `HH:00` or `HH:30`; `24:00`
   is accepted only as an end. Windows are sorted and must not overlap.
5. Check the device-local previews. New days use UTC metadata; existing day
   metadata is preserved because the backend makes it immutable.
6. **Review replacement → Confirm availability replacement** submits the entire
   day with `expectedRevision`. Success reloads the authoritative saved day.
7. On conflict or uncertain save, reload before editing/resubmitting. The UI does
   not silently overwrite another revision. Started windows are immutable and
   existing reservations must remain covered; the backend enforces both.

The editor shows separately paginated appointment records for that UTC day.
The main Schedule tab filters appointments by the selected **device-local** date.
Consultations retains the existing appointment-ID route and eligibility checks.

## Patient workflow

1. Open **Doctors**. The directory provides loading/empty/error states, refresh and
   bounded continuation pages. Search is explicitly limited to loaded results.
2. Select a doctor. The existing authorized public-profile get supplies only the
   professional name and specialty; no ratings, fees or qualifications are invented.
3. Enter a local calendar date. The service requests the overlapping permitted UTC
   partitions through `getAvailableAppointmentTimes` and filters slots to the local
   day. Select a returned time.
4. Review doctor, local date/time, time zone and 30-minute duration, then confirm.
   Only a validated callable response can display confirmation.
5. Open **Appointments**. Upcoming/active and history views use bounded pages with
   stable timestamp/document-ID ordering. History includes all statuses and does
   not relabel elapsed `scheduled` records as completed.
6. Before an appointment starts, choose **Cancel appointment**, optionally enter a
   reason, and confirm. Success refreshes the list. Existing consultation entry
   remains available only within the established appointment/grace window.

## Retries, pagination and time

- A booking UUID belongs to one logical doctor/time choice. Concurrent taps share
  one pending request. A timeout retains that UUID for retry on the confirmation
  screen. Changed intent gets a new UUID. No alternate slot is silently booked.
- Retry keys are held in memory, not persisted across app termination or screen
  remount. After leaving an uncertain booking, check appointments before starting
  another booking. Terminal replay is presented as history, not new success.
- An uncertain cancellation keeps its reason fixed for retry; the user may refresh
  to inspect authoritative state. Backend exact-replay/lock-release rules remain.
- Appointment pages contain at most 20 rows and use snapshot `startAfter`, never
  offsets. Upcoming uses owner/status/start ascending; history and selected-day
  reads use owner/start descending. Document ID breaks equal-time ties. The existing
  four appointment composites cover these shapes; no new composite is introduced.
- Home previews subscribe to the next 50 scheduled starts, including a 45-minute
  lookback for active consultation windows, rather than the last 50 history rows.
  Main lists are paginated snapshots; refresh to see changes after loading a page.
  Pagination is not a frozen database snapshot across requests.
- UTC grid and duration are fixed at 30 minutes. Backend time enforces a minimum
  five-minute lead and rolling 90-day booking horizon. Availability editing is
  bounded by UTC calendar day +90. Discovery clips to allowed UTC partitions.
- Local-day boundaries use calendar advancement, not a fixed 24-hour addition,
  so DST days can be 23/25 hours. Quarter-hour-offset zones still use the UTC grid.
  No arbitrary-zone recurrence or multi-day atomic replacement is implemented.
- Device time is a presentation hint. Clock skew may affect visible candidates;
  backend time still decides whether any mutation is allowed.

## Local demonstration prerequisites

Use Node 22 for Functions and the existing Android development client. Build the
current Functions source, then use the existing root emulator configuration with
the explicit project `demo-calladoc`; never rely on the live `.firebaserc` default.
See `MOBILE_FIREBASE_EMULATORS.md` for the process-local Expo flag and startup steps.

The demo requires synthetic Auth users plus canonical patient/doctor identities
and a consistent approved doctor profile/public projection/verification request.
Prefer completing the local verification workflow. These screens do not seed or
bypass approval. Local Auth, Firestore and Functions must be available. Production
Functions/index availability is not established by local tests.

Automated integration uses only the existing guarded
`demo-calladoc-integration` configuration and its separate ports. It must not be
repointed at the interactive `demo-calladoc` project or production.

If Firebase CLI has a cached login, it can inject account credentials into Functions
discovery. The existing integration guard correctly refuses that environment.
Run the gate with a fresh **process-local** `XDG_CONFIG_HOME` directory to keep the
CLI unsigned; do not log out the user's CLI, delete credentials, or relax the guard.
For example, in a dedicated PowerShell session with Node 22 selected:

```powershell
$env:XDG_CONFIG_HOME = Join-Path $env:TEMP ('calladoc-test-cli-' + [guid]::NewGuid().ToString('N'))
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '120'
# From functions/; uses only its established guarded emulator configuration:
node scripts/integrationGate.cjs scheduling.integration.test.ts
```

## Validation

Recorded during this implementation (not historical device claims):

- Functions Node 22.23.3 build and source/test TypeScript: passed.
- Focused Functions scheduling/read/store/export tests: **416/416**, seven suites.
- Mobile TypeScript: passed.
- Focused mobile scheduling, navigation and date tests: **75/75**, ten suites.
- Date cases include Nairobi, Kathmandu, UTC, New York DST spring/fall boundaries,
  and discovery horizon clipping.
- Targeted Firestore Rules: **180/180**, five suites (availability, booking,
  lifecycle, appointment reads and doctor profiles).
- Isolated scheduling integration: **39/39**, one suite, including the new read
  callables and the selected-day appointment query. All 21 exports loaded.
- Git whitespace checks: passed.

The first integration attempt had **39 failures** because the Functions safety
guard rejected CLI-injected cached account credentials before loading any callable;
requests therefore returned 404. A fresh process-local unsigned CLI configuration
resolved the environment issue. The successful retry used the same demo project,
guard, test suite and application source. No safety check was bypassed. Java/Storage
emulator Unsafe deprecation warnings and expected Rules denial logs remain local
tooling warnings, not passing authorization paths failing their tests.

Initial development checks exposed a store typing error and a Jest Expo mock that
replaced required native preset helpers. Both were corrected before the passing
results above. No existing booking policy or security rule was changed to pass tests.

## Outstanding verification

**Android workflow testing remains pending.** No Android emulator was launched and
no native rebuild was performed for 9C. Test directory pagination, UTC/local labels,
availability revision conflicts, booking/cancellation and logout/re-entry on the
Android development client. Exercise two patients competing for a slot, network
loss around confirmation and a doctor editing booked coverage. Verify layout and
keyboard behavior on-device. Automated emulator tests do not establish production
index readiness, two-device calling, or PDF runtime rendering.
