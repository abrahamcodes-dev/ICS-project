# Checkpoint 1 — English / Kiswahili

## Implementation

The mobile interface now uses a central typed catalogue (`mobile/src/i18n`),
without a new package or a translation service. English interface phrases are
stable keys; `tr()` checks keys and required interpolation arguments at compile
time. Both catalogues have 965 entries. Explicit JSX messages and labels were
migrated across authentication, onboarding, consent, all role workspaces,
verification, scheduling, payments, calls/chat, attachments, prescriptions,
ratings, notifications and account controls. Structured status codes use a
display-only mapping. Existing backend identifiers and route names are retained.

The English / Kiswahili selector is available on Welcome, login/registration and
shared scrolling screens, including patient and doctor profiles and the admin
workspace. There is no new administrator-settings route. Language names remain
in their own language. AsyncStorage key `calladoc.language.v1` is device-scoped,
independent of Firebase identity, sign-out and role. Startup waits for the saved
preference; late reads cannot override a new choice and writes are serialized.
Write failures report that the visible choice was not saved. No language value
is written into hosted account or clinical records.

Mounted components subscribe to the language store without navigation remounts,
authentication refreshes or changing pending operation IDs. Controlled notices
and module descriptors can resolve either language again after switching.
Dynamic clinical values are interpolated verbatim. Original messages,
prescription names/doses/instructions, doctor-authored professional information,
ratings/comments, filenames and uploaded content are not translated. Specialty
chip presentation is separate from its original search value.

Dates and times use `en-KE` or `sw-KE`, retaining the existing display time-zone
options and device-local scheduling semantics. Africa/Nairobi availability and
UTC instants are unchanged. The explicit date formatter defaults to Nairobi;
06:00 UTC on 17 November remains 09:00 EAT. Currency uses the selected locale
with the same KSh/KES labels and integer minor units; input parsing and fee
revision checks are unchanged. Native system/file-picker/Google account dialogs
follow platform language settings rather than this JavaScript preference.

English and Kiswahili privacy notices are presentation equivalents, not new
legal policy, approval or consent versions. The original English notices and
all backend acknowledgement/version requirements remain authoritative pending
owner/legal language review. Sharing stays disabled under the existing policy.
Account deletion/privacy functionality and retention policy were not expanded.

## Local health assistant

The existing English rule engine and knowledge base remain local and retain
their safety evaluation. An authored Kiswahili layer recognizes common Kenyan
phrasing for greetings, headache, fever, malaria, cough, stomach/diarrhoea,
nutrition, mental wellbeing, sleep, maternal/child health, diabetes, blood
pressure and consultations. Medication/dose and diagnosis requests receive
explicit boundaries. Unknown questions admit missing prepared coverage.
This is intentionally a smaller curated answer set than the English knowledge
base; it is not a translated version of every English knowledge entry/follow-up.
Unrecognized Kiswahili topics safely fall back instead of inventing a response.

English and Kiswahili emergency safety nets take precedence, including mixed
language, poisoning/overdose, breathing difficulty, chest pain, heavy bleeding,
loss of consciousness and self-harm keywords. Negations do not suppress safety
alerts. Emergency status survives language changes; users are told to seek
immediate professional help rather than wait for this assistant or a booking.
No external AI, translation, patient-record access, network calls or analytics
were added. Conversation lifecycle and original user questions are preserved.

The Kiswahili wording needs a qualified Kenyan medical/Kiswahili review before
clinical use. Primary terminology references checked during preparation include
[CDC's Swahili maternal warning-sign card](https://www.cdc.gov/hearher/docs/pdf/other-languages/HearHer_Women_Palmcard_5x7_Swahili-h.pdf)
and [Washington Department of Health's Swahili emergency-sign material](https://doh.wa.gov/sw/you-and-your-family/illness-and-disease-z/heart-disease/heart-attack/stroke-and-heart-attack-signs-and-symptoms-swahili).
These references do not constitute review or endorsement of this implementation.
Keyword matching can miss emergencies and is not triage or diagnosis.

## Layout and remaining acceptance

Shared actions already support wrapping, minimum touch heights and text scaling;
language controls use wrapping rows and 48-point minimum targets. Specialty
tiles no longer force English line breaks, navigation titles are localized,
and doctor calendar weekday labels come from the selected locale. Clinical
content and filenames retain existing intentional line limits/viewers.

The pending-doctor branch previously placed its notification action outside a
safe-area container. It now uses SafeAreaView; no Android native tree or plugin
configuration changed. This is a targeted fix, not proof that every reported
header/status-bar overlap is resolved on-device.

Outstanding manual acceptance after an approved replacement APK:

1. Switch before login, restart, sign out and change roles; confirm preference
   and entered drafts survive as intended without reauthentication for switching.
2. Inspect all role screens, consent dialogs and long labels at large font size,
   on a narrow screen, in light/dark modes and with TalkBack. Check the reported
   Android top-inset issue, native header titles and the keyboard composer.
3. Validate date/weekday/month rendering under Hermes, Nairobi scheduling,
   KES 1,500 display and unchanged original prescription/message text.
4. Review medical, consent and payment Kiswahili for natural Kenyan usage,
   comprehension and unchanged safety/legal meaning.

No claim of fully verified native visual coverage or formal usability/clinical
evaluation is made. Unknown future/backend diagnostic messages can fall back
to their original text; these are not silently machine-translated. Internal
development-only PDF spike UI, OS dialogs and authored clinical data are outside
the static interface audit. This limitation must remain visible rather than
claiming an exhaustive runtime translation guarantee.

## Verification and recovery

`scripts/Audit-MobileLocalization.cjs` audits static JSX text/literal display
props and catalogue/interpolation parity. It reports 965 keys, 60 TSX files and
zero raw alphabetic JSX text/literal display props. Dynamic descriptors are
reviewed separately; this metric alone is not a full coverage claim.

Focused tests cover storage/restoration races and write failures, live switching
with draft preservation, explicit doctor registration acknowledgement, patient
simulated-payment decisions, doctor fee minor units/revision, administrator
authorization/approval, and bilingual assistant intents/emergency boundaries.
Existing affected UI and scheduling/consent/English-assistant suites are run in
the existing disposable workspace with Node 22.23.3. A 30-second UI test timeout
handles known cold renders; assertions remain intact. An obsolete avatar test
now explicitly expects the optional fifth registration argument already present
in the committed registration implementation; no auth behavior was changed.

Commands (Node 22.23.3 first on PATH):

```powershell
node scripts/Audit-MobileLocalization.cjs
node mobile/node_modules/typescript/bin/tsc --noEmit -p mobile/tsconfig.json
node scripts/Sync-AcademicChecks.cjs "$env:TEMP\calladoc-phase3a-cYg7rZ\checks"
Set-Location "$env:TEMP\calladoc-phase3a-cYg7rZ\checks\mobile"
$tests = Get-ChildItem __tests__ -Name | Where-Object {
  $_ -match 'UI\.test|^(localization|localizationUI|kiswahiliHealth|healthChatbot|healthChatbotFinal|chatbotEvaluation|doctorWorkspace|appointmentsScreen|schedulingAppointments|schedulingService|schedulingDates|patientConsent)\.test'
}
node node_modules/jest/bin/jest.js --runInBand --testTimeout=30000 --runTestsByPath ($tests | ForEach-Object {'__tests__/'+$_})
```

Successful unrelated backend/Rules suites are not rerun. No hosted changes,
bookings, payments, account changes, deployments, dependency changes, APK builds,
installations, commits or pushes are part of this checkpoint. The working tree
also contains the previous approved Rules fix/evidence and an unrelated
consultation-service test edit; those must not be swept into a localization
commit. Existing standalone/local APKs and emulator data remain separate.

Final results on 16 November 2026: mobile TypeScript passed; the static audit
passed (965 keys / 60 TSX files). The final affected regression run passed
27/27 suites and 474/474 tests in 18.37 seconds, with no skips. One additional
saved-template switching regression was then added and the updated localization
suite passed 7/7 in 1.491 seconds: 475 distinct tests across the same 27 suites
are verified. Earlier failures were a missing display-helper import, unintended
English prescription-label capitalization, the obsolete explicit-undefined
avatar expectation and an initial five-second cold UI timeout; all were resolved
without weakening assertions or changing authentication/security behavior.

Proposed commit boundaries: previous Rules fix/evidence separately; typed
localization and integrated UI migration together; bilingual assistant; focused
regression evidence/documentation (or combine tests with their implementation
where needed for a consistent checkpoint). Owner approval is needed before
committing or building/installing the replacement hosted APK. No Firebase
deployment is needed for this mobile-only implementation.
