# C8 UI integration and functional test gate

## Implemented navigation

- Guest: Login and patient/doctor registration, with an explicit link between forms.
- Account recovery: loading, missing identity completion, identity errors, disabled
  account and unapproved-doctor status screens. Clinical guards remain unchanged.
- Patient: Home, linked Doctors, Doctor Profile, Appointments and Profile. Existing
  stack headers provide Back. Home/menu actions use typed routes.
- Approved doctor: Home, Schedule, Consultations and Profile in persistent native
  bottom tab controls inside the existing stack. Opening a consultation hides the
  workspace and releases its listeners; Back returns to the selected tab.
- Both roles: the same C7 consultation screen, with themed eligibility/loading,
  incoming/outgoing/connecting/terminal states, local/remote video and media controls.
  End/reject use a prominent destructive button. No successful call is simulated.

## Shared design

`mobile/src/ui/design.tsx` owns semantic light/dark colors, typography, spacing,
Screen, Card, Copy, Action, Field, Notice, Loading and Brand. System appearance
selects the palette. Controls have minimum touch heights, explicit labels and
disabled state; text scales normally. Cards respect reduced motion. Scrollable
safe-area containers handle narrow screens and longer content. Auth uses keyboard
avoidance and explicit password visibility. Consultation video sizes scale with
content width, with a smaller local preview and labeled native RTCViews.

Native stack headers remain for clinical routes. Legacy booking, health editing,
availability and verification routes now show themed informational screens rather
than developer scaffold instructions. Other future-feature routes remain outside
the presentation flow. This is not a redesign of administrator or future features.

## Honest limitations

Full doctor directory listing is forbidden by current rules; only linked doctors
are shown. Booking, doctor availability management, verification submission and
health/profile editing remain unconnected. Patient navigation is stack-based;
doctor navigation has four bottom tabs. Appointment views are bounded to 50 records.
Public profile verification is current at read time. No private patient information,
ratings, availability or credential claims are fabricated.

## Android walkthrough and prerequisites

1. Have the existing native Android development build installed. From `mobile`, run
   `npx expo start --dev-client`; press `a` for an emulator, or open its development
   URL on a reachable physical device. Expo Go cannot validate native WebRTC.
2. Use an approved available backend with email/password authentication, registration
   and call callables, existing Rules/indexes and synthetic authorized test records.
   This checkpoint performs no deployment or emulator wiring.
3. Sign in as an active patient; inspect Home, linked Doctors, Appointments and
   Profile. Verify empty/error/disabled states without creating fake appointments.
4. Sign in separately as an active approved doctor; inspect all four bottom tabs.
   Verify pending/disabled accounts cannot enter the workspace.
5. Both participants open the same scheduled appointment during its eligible window.
   One starts a call; the other stays foregrounded and accepts the discovered call.
   Validate actual audio/video before recording an end-to-end result.
6. Test light/dark mode, small displays, large fonts, keyboard entry, TalkBack,
   permission denial, Back, backgrounding, logout and network interruption.

No device visual or two-peer media verification is claimed by mocked UI tests.
STUN/TURN configuration, secure TURN credential provisioning, physical Android/iOS
behavior and network-condition tests remain outstanding. Local native module loading
alone does not establish internet call connectivity. See AUTH_UI.md, PATIENT_UI.md,
DOCTOR_UI.md and CONSULTATION_CALLS.md for detailed boundaries.
