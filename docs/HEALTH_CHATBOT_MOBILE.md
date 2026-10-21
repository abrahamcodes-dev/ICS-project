# 9H - Local health information assistant

## Architecture and access

`mobile/src/services/chatbotService.ts` is a synchronous, deterministic English
rule engine. Normalization handles case, punctuation and Unicode compatibility
characters. Emergency phrases take priority, then medication/diagnosis boundaries,
then ordered information rules and a conservative fallback. There are no external
AI calls, Firebase reads/writes, analytics, transcript logging or persistence.

The existing guest and patient Chatbot routes render `ChatbotScreen.tsx`.
Login exposes **Health assistant (no sign-in needed)** without altering AuthForm.
Patient Home exposes **Health assistant**. Guests can return to Login; active
patients can open the existing Doctors directory. These actions do not book a
visit or bypass scheduling authorization.

The old unexported Functions chatbot and its shared scaffold types remain inactive;
the mobile client no longer invokes `matchChatbotRule`. Its symptom advice and
interaction logging are not reused. No backend, Rules or dependencies changed.

## Supported intents and safety

- General information: nutrition, hand hygiene, sleep routine and stress support.
- Pregnancy/infant concerns and symptoms: professional-care guidance only.
- Medication and diagnosis requests: explicit refusal to choose treatments or doses.
- Greetings/help, consultation navigation and unrecognized-question fallback.
- Emergency phrases: immediate professional help, without waiting for an appointment.

The assistant does not examine, diagnose, prescribe, assess individual risk or
claim that a problem is harmless. It does not choose medicines or provide dosing.
An always-visible disclaimer and emergency notice supplement keyword matching.
No location-specific emergency number is guessed. Self-harm phrases direct users
to immediate professional assistance without providing harmful details.

This is **not a triage system**: spelling, context and unrecognized expressions can
cause missed matches; negated emergency phrases deliberately still trigger a
warning. False positives are possible. No multi-turn clinical inference occurs.
English-only input is requested, not reliably detected. Content needs clinical
review before real patient reliance.

General response references checked during implementation:

- [WHO healthy diet](https://www.who.int/news-room/fact-sheets/detail/healthy-diet)
- [NHS handwashing](https://www.nhs.uk/live-well/best-way-to-wash-your-hands/)
- [NHS sleep routines](https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-fall-asleep-faster-and-sleep-better/)
- [NHS stress support](https://www.nhs.uk/every-mind-matters/mental-health-issues/stress/)
- [NHS emergency warning signs](https://www.nhs.uk/nhs-services/urgent-and-emergency-care-services/when-to-call-999/)

These references support general content, not validation of the matching algorithm
or endorsement of CallADoc. UK emergency telephone numbers are not copied into the app.

## Session boundaries

Questions are limited to 500 characters; conversations to 20 turns before reset.
The UI uses existing accessible, themed design components. Reset clears input,
messages and errors. Blur/unmount, logout/account changes and backgrounding discard
conversation state. Backgrounding disables input until the app is active again.
No async response can arrive from a previous session because matching is local
and synchronous. No private medical record access is available to guests.

Users are asked not to enter identifying information. Memory-only does not prevent
OS keyboard history, screenshots or shoulder surfing; this is not a secure record
storage interface.

## Focused validation

Commands:

```sh
npm --prefix mobile run typecheck
npm --prefix mobile test -- --runInBand --runTestsByPath __tests__/healthChatbot.test.js __tests__/healthChatbotUI.test.js __tests__/patientExperience.test.js __tests__/authNavigation.test.js
git diff --check
```

Tests cover intent determinism, emergency priority, dosing/diagnosis refusal,
unknown and invalid inputs, guest/patient entry, care navigation, reset, account
switch/logout, blur/background cleanup, listener disposal and bounded history.
Mobile TypeScript passed. The four focused suites passed **62/62** (34 engine,
9 chatbot UI, 7 patient workflow and 12 authentication navigation tests).
The initial UI run had two failures because the Jest AppState fixture was not
foreground; after setting that fixture explicitly and strengthening cleanup
assertions, only the affected nine-test suite was rerun and passed.
Whitespace checks passed. Backend tests were skipped because no backend changed;
no emulator execution or Android build was performed.

## Android verification still required

1. Launch the existing Android development client and Metro through the documented
   local setup; no native rebuild or Firebase deployment is required for this UI.
2. Signed out, open the assistant from Login. Test general topics and an unknown
   question offline. Confirm emergency wording with a synthetic chest-pain query.
3. Test medication/diagnosis refusals, reset, keyboard scrolling, TalkBack and both themes.
4. Background/return, leave/reopen and sign in as a patient; old text must disappear.
5. Open from Patient Home and choose Find a doctor. The real directory/booking flow
   still needs the authorized Firebase backend/emulators; the assistant itself does not.

No Android interaction, clinical usability or emergency-detection accuracy is
claimed as verified by the mock/unit tests.
