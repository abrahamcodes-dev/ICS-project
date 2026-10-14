# C8A authentication UI

Login and public patient/doctor registration use the existing authService and
AuthContext. Firebase Authentication is followed by backend `completeRegistration`;
there are no client identity writes, administrator registration or demo credentials.
Interrupted registration retains the Auth account and offers identity completion.
Re-enter the same name and role used for the original attempt. Backend role and
retry validation remain authoritative. Identity loading errors offer refresh and
sign-out; disabled users and unapproved doctors cannot enter clinical navigators.
Doctor verification submission UI remains unfinished; registration alone does not
approve a doctor. A backend must be available before identity completion can work.

The shared design primitives provide system light/dark colors, typography, spacing,
cards, labeled fields, accessible buttons, loading/errors and a native geometric
stethoscope/wireless brand mark. Auth screens use a scrollable, keyboard-aware,
safe-area layout capped at 480 logical pixels. Card entry fades respect reduced
motion. Passwords are hidden by default, never logged, and not trimmed. Firebase
password policy remains authoritative beyond the local six-character minimum.
No local visual mockup was found; no new design/native dependency was added.

## Android demonstration

Use the existing installed CallADoc development build and an authorized Firebase
environment with email/password sign-in, the registration callable, identity rules
and required indexes already available. From the repository root run:

```powershell
cd mobile
npx expo start --dev-client
```

Start the Android emulator and press `a` in Expo's terminal, or open the development
build on a physical device on the same reachable network and open the displayed
development URL. Do not use Expo Go for native calling. Sign in with your authorized
test account, or choose Create an account and Patient/Doctor. For interrupted setup,
complete the existing account instead of registering again. Approved doctors and
active patients route to their existing home screens and My appointments.

This change does not deploy Firebase, alter persistence, wire local emulators,
complete booking/verification forms, or verify two-device calling. Device visual,
keyboard, screen-reader and real authentication checks remain necessary. Existing
STUN/TURN and physical-device calling prerequisites still apply.
