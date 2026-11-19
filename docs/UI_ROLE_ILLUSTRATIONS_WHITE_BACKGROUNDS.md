# UI checkpoint 2 — role illustrations and white backgrounds

Local UI implementation only. No Firebase operations, clinical changes, builds,
installations, staging, commits or pushes. No new dependencies.

## Role artwork

The supplied transparent PNGs are copied byte-for-byte into `mobile/assets`:

| Asset | Dimensions | SHA-256 |
| --- | --- | --- |
| `calladoc_patient_pink.png` | 1030 × 771 | `db5a97cf8383efedc2c77f1f315a1fa01e48f873f4abe9d4e29b4823fc55b23e` |
| `calladoc_doctor_pink.png` | 1354 × 1162 | `49cbfdbbb983506d6695843516382f791f3121df8c6fb373caf2b7a3c10eee9c` |

Role cards use these actual image assets with contain sizing, original aspect
ratios and 100% of their padded illustration column. There is no recoloring,
tint, oversized/negative positioning or colored illustration backdrop. This
preserves the supplied patient's pink sweater, doctor's pink scrubs and white
coat. Existing card titles, descriptions, blue arrows, minimum heights, touch
targets and role-specific Register navigation are unchanged.

## White presentation

The existing shared light palette is now the application palette under light,
dark and unspecified OS appearance. Navigation uses the matching light theme;
main backgrounds and native header surfaces are `#FFFFFF`. Using the whole light
palette preserves dark, readable text instead of putting dark-theme light text
on white. The status bar uses dark icons. Login and registration outer canvases
now use the background token rather than the functional card surface token.

Decorative layers removed:

- Welcome screen's detached shapes around the approved stethoscope PNG.
- Login's absolute circle/wave backdrop.
- Account-access and role-selection page ornaments.
- Colored circle behind each role illustration and behind the assistant mascot.
- Decorative circle in the patient's Consult a doctor card.

Preserved: the welcome PNG (including artwork embedded inside the approved PNG),
assistant mascot, functional Consult a doctor illustration/card, avatar controls,
functional card fills, buttons, input fields, borders, shadows, status/notification
colors, clinical alerts, blue branding and the blue KIS/EN language button.

The previous dark palette export remains for compatibility; it is not selected
by normal application or navigation rendering. No separate appearance preference
or native theme/configuration change was introduced.

## Usability exceptions and pending Android acceptance

No ordinary guest, authentication, patient or doctor screen needs a non-white main
canvas. Functional media and overlay surfaces remain exceptions: video stages and
camera previews keep their dark media background/light labels; modal dimming stays
translucent; document content/native renderer surfaces are not recolored. Whitening
these indiscriminately could impair media legibility or modal separation. System
dialogs, keyboards and native startup/splash rendering remain OS/native controlled.

Actual Android visual acceptance is **PENDING**. A separately approved APK build
is required to check:

1. Full pink role illustrations on Pixel 7, 320 dp phones and larger displays,
   including intrinsic PNG whitespace, large fonts and landscape layout.
2. Clear doctor white-coat outlines, no essential image clipping or colored circles,
   and intact card descriptions/arrows/touch targets.
3. White page/header/status-bar presentation under both OS appearances, with readable
   fields, cards, alerts, notifications, chat bubbles and functional media stages.
4. Welcome stethoscope artwork and Get Started; KIS/EN switching, TalkBack native
   back labels and Doctor Profile restoration after controlled locale recreation.

No actual device acceptance is inferred from component tests.

## Exact checkpoint file inventory

1. `mobile/assets/calladoc_patient_pink.png` — new approved asset.
2. `mobile/assets/calladoc_doctor_pink.png` — new approved asset.
3. `mobile/App.tsx` — dark status-bar icons for white presentation.
4. `mobile/src/ui/theme.ts` — uniform readable white application/navigation theme.
5. `mobile/src/screens/auth/OnboardingScreens.tsx` — role assets/contain layout and
   removal of decorative page/illustration backgrounds.
6. `mobile/src/screens/auth/LoginLayout.tsx` — white canvas, no decorative backdrop.
7. `mobile/src/screens/auth/RegistrationLayout.tsx` — white canvas.
8. `mobile/src/screens/patient/PatientHomeDashboard.tsx` — remove only decorative circle.
9. `mobile/__tests__/onboardingUI.test.js` — new asset references and responsive
   contain/no-tint/no-backdrop/navigation assertions.
10. `mobile/__tests__/theme.test.js` — white presentation across OS appearances,
    preserved input state/authentication/routes.
11. `mobile/__tests__/design.test.js` — readable white-presentation expectations;
    semantic contrast and control checks remain intact.
12. `mobile/__tests__/whiteBackgrounds.test.js` — new canvas/decorative-layer and
    functional-color preservation coverage.
13. `docs/UI_ROLE_ILLUSTRATIONS_WHITE_BACKGROUNDS.md` — this evidence.

## Verification and preservation

Node 22.23.3; **103/103 tests PASS, 8 suites; 0 failed/skipped**:

```text
cd mobile
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath __tests__/onboardingUI.test.js __tests__/whiteBackgrounds.test.js __tests__/theme.test.js __tests__/design.test.js __tests__/languageSwitcher.test.js __tests__/localeRestoration.test.js __tests__/localeRestorationNavigation.test.js __tests__/nativeLocale.test.js
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node ../scripts/Audit-MobileLocalization.cjs
```

Mobile TypeScript PASS. Translation audit PASS: all 1,006 catalogue keys preserved,
no unlocalized static JSX. Whitespace and approved-asset byte-identity checks PASS.
No full regression suite was run.

The pre-checkpoint preservation snapshot verifies **36 other pre-existing changed
files unchanged**, including all RTBF services/tests, translations, shared language
control and UI checkpoint 1 evidence. In the four overlapping UI/test files, changes
are confined to this presentation scope; the RTBF recovery import/entry and welcome
stethoscope asset reference remain intact. Both unrelated file hashes still match:

- `docs/CHECKPOINT_1_ANDROID_APK.md`:
  `617688552188d556fb928ac8e3bc41a1197f6cd94508427552530fe289d63ede`
- `mobile/__tests__/consultationService.test.js`:
  `1420190ed0b6fb2138981b823f3b038eb47425ffef2571c65ab14d144f89f1f1`

Existing APKs, native locale code, Doctor restoration logic, authentication,
consultation services, consent and hosted/emulator data were not modified.
