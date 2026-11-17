# Completed consultation history — accepted mobile checkpoint

Implemented and installed in place on 17 November 2026. **Patient and Doctor completed-history device acceptance PASSED.** The owner subsequently approved two local commits for the mobile update and final evidence; pushing remains unapproved. See the final acceptance section in [release evidence](POST_CONSULTATION_RELEASE.md).

## Behaviour and authorization

- Patient appointment cards and Doctor workspace → Consultations → History expose **View consultation history** for owned completed appointments. Expand the card/actions where applicable. The existing standalone appointments route also supplies this action.
- Both navigators use a separate `ConsultationHistory` route with a localized title. Completed appointments remain ineligible for the active consultation action; its timing/status restriction is unchanged.
- The history reader fetches the appointment and existing consultation from the server only. It validates participant/role binding, completed appointment status, closed room state, matching IDs, participants and appointment times. Missing, inconsistent, active or unauthorized records fail closed. It never invokes `openConsultation`, reconciles a room, or writes records.
- The existing bounded message session supplies pagination and retry. No individual-message document read is introduced; the documented direct single-message-read Rules expression-budget TODO remains unchanged.
- Explicit read-only chat omits the message field, send/retry controls and attachment composer, with a separate send-handler guard. The history screen does not mount calls, consultation options, prescription creation or completion controls.
- Existing attachment messages retain their original content and use the existing private attachment viewer and participant-bound retrieval. No patient medical-profile/history read, new consent scope, public file URL or upload capability is added. Backend admission, authorization and consent controls remain authoritative and unchanged.
- Identity refresh removes private content; route blur unmounts the history view. English/Kiswahili changes update the visible view without reopening the room.
- Initial entry requires connectivity for server-authorized appointment/room reads. Once mounted, message caching follows the existing session behaviour; a cached message is not proof of renewed authorization.

## Local verification

Node 22.23.3; existing disposable `Sync-AcademicChecks.cjs` workspace and locked dependencies. No Firebase requests or emulator operations were required.

**9 distinct Jest suites, 124 distinct tests passed; no failed/skipped/TODO tests in these runs.**

| Run | Suites | Tests |
| --- | --- | --- |
| `consultationHistory`, `consultationHistoryScreen`, `consultationChat`, `schedulingAppointments`, `callUI` | 5 | 78 passed |
| Updated `consultationHistoryScreen`/`consultationChat`, plus `patientExperience`, `consultationAttachmentsUI`, `consultationAttachmentsService`, `localization` | 6 | 66 passed |

The second run supersedes 20 overlapping tests from the first; it includes two additional tests in those suites. Totals above count each test once. The doctor callback initially collided with the existing history-tab state name during TypeScript verification; the callback alias was corrected. Final mobile `tsc --noEmit` passed.

Localization audit: **989 catalogue keys, 62 TSX files, no unlocalized static JSX reported**. This static check does not establish device layout or medical-language acceptance. Git whitespace checks passed.

## Historical pre-release approval gate (completed)

At the initial local implementation checkpoint, build and installation required separate approval. Those approved steps are now complete. The replacement APK was installed in place with the existing package and signing certificate, preserving app data and both rollback APKs. Both participants passed completed-history entry, all five existing messages, private attachment rendering, normal reload and bounded pagination, with no clinical mutation controls. No new clinical records were created.

No additional Rules or Functions deployment was required by this mobile-only update. Read-only hosted checks confirmed all **nine tracked record hashes and five message hashes unchanged**, including **granted consent revision 5**. Hosted authorization remains **28/28 PASSED** (Patient 13/13, Doctor 15/15, previously confirmed separate receipts). These hosted authorization checks were not repeated or relabelled as device tests.

The Doctor's authorized summary showed appointment-linked patient name/avatar and appointment details only. Patient information displayed the restricted medical-information notice; optional patient medical history was not exposed. This verifies the device UI restriction, not a fresh direct-SDK negative-access test. Patient English/Kiswahili history labels and header layout were inspected; language preference and patient session survived restart. The Doctor remains signed in, in English.

**PENDING, not failed:** Doctor Kiswahili device checks; fresh direct-SDK negative authorization checks; active-appointment device testing. Active-path behaviour retains focused automated regression coverage; no new hosted appointment was created. Full bilingual, spoken accessibility and every-workflow device acceptance are not claimed. The separate Consultation Options summary panel was not exercised through the completed-history route, which deliberately excludes clinical options.

The current APK hash, signing/installation verification, validator correction, preservation timestamps and non-secret receipt locations are recorded in [final release evidence](POST_CONSULTATION_RELEASE.md). Local emulator data, original native configuration and unrelated working-tree edits remain preserved. No staging, commit or push is performed by evidence finalisation.
