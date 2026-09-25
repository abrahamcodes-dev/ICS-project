# CallADoc

Mobile telemedicine platform connecting patients in Kenya with verified doctors for
remote consultation, appointment scheduling, digital prescriptions, and a rule-based
health-information chatbot.

This repository is scaffolded to match the Supervisor Development Guide:
`mobile/` = presentation layer, `functions/` = application layer,
Firestore/Storage = data layer.

## Structure

```
mobile/      React Native (Expo) app
functions/   Firebase Cloud Functions (Node.js) — application logic
shared/      TypeScript types shared between mobile and functions
docs/        ERD, architecture notes, API contracts
```

## Getting started

### 1. Firebase project
```bash
npm install -g firebase-tools
firebase login
firebase use --add        # select or create your Firebase project, alias it "default"
```
Update `.firebaserc` with your real project ID.

### 2. Mobile app
```bash
cd mobile
npm install
cp .env.example .env      # fill in your Firebase config values
npx expo start
```

### 3. Cloud Functions
```bash
cd functions
npm install
npm run build
firebase emulators:start   # local dev against Firebase emulators
```

## Open decisions (see Supervisor Development Guide, Section 18)

These are intentionally left as `TODO`s in the code rather than guessed at:

- [ ] WebRTC signaling / STUN-TURN approach (`functions/src/consultations/signaling.ts`)
- [ ] Firestore security rules (`functions/firestore.rules`)
- [ ] Data model attributes beyond the four core entities (`shared/types/`)
- [ ] Doctor verification rejection/appeal flow
- [ ] Chatbot: confirm rule-based (per Ch.3) vs. AI-assisted (per Abstract) — code here assumes rule-based

## Sprint map

| Sprint | Folders touched |
|---|---|
| 1 — Foundation & Auth | `mobile/src/screens/auth`, `functions/src/auth` |
| 2 — Profiles & Verification | `mobile/src/screens/patient/HealthProfileScreen`, `.../doctor/SubmitVerificationScreen`, `.../admin`, `functions/src/verification` |
| 3 — Scheduling & Notifications | `.../doctor/SetAvailabilityScreen`, `.../patient/BookAppointmentScreen`, `functions/src/scheduling`, `functions/src/notifications` |
| 4 — Core Consultation | `.../patient/ConsultationScreen`, `.../doctor/ConsultationRoomScreen`, `functions/src/consultations` |
| 5 — Prescriptions, Ratings, Chatbot | `.../PrescriptionsScreen`, `.../RateDoctorScreen`, `.../shared/ChatbotScreen`, `functions/src/prescriptions`, `.../ratings`, `.../chatbot` |
| 6 — Integration & Evaluation | full app + `__tests__/` in both `mobile/` and `functions/` |
