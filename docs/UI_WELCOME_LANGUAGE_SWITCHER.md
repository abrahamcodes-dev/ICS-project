# UI checkpoint 1 — welcome illustration and language button

Local implementation only. No build, installation, device interaction, Firebase
operation, staging, commit or push.

## Welcome illustration

`mobile/assets/welcome-healthcare.png` is an unchanged copy of the owner's approved
1245 × 1263 transparent PNG. SHA-256:
`96599708e01255d5cbe6b71e5aada1332e71603c122eca4d6d3752779ab069bb`.
It is an illustration inside the existing welcome screen, not a screen image.
The clipboard, stethoscope and blue styling remain intact. Branding, translated
copy, Get Started and the AccountAccess destination are unchanged. Other screens'
doctor artwork is intentionally retained.

The illustration uses contain sizing, its original aspect ratio and 100% of the
padded content width. Negative positioning/oversizing were removed. The existing
scrolling layout accommodates short Android displays and larger font settings.
The language toolbar occupies normal layout space above scrolling welcome content.

## Reusable language control

`LanguageSwitchButton` displays KIS in English and EN in Kiswahili. Its blue
background is `#1266C8`, with white text and a minimum 56 × 48 dp touch target.
TalkBack receives the destination-language label, “Switch to Kiswahili” or
“Badilisha kwenda Kiingereza”, instead of just the abbreviation. Pending writes
disable/coalesce presses. Persistence failure produces a localized alert rather
than expanding or overlapping the native header.

All changes use the existing `setLanguage` API. The AsyncStorage preference,
native AppCompat synchronization, startup behavior, and one-use Doctor workspace
restoration mechanism are unchanged. Mounting a control does not select a language.

- Patient, Doctor and administrator native stacks supply the same button through
  `headerRight`. No back button, screen identifier or initial route is replaced.
- Headerless screens use `LanguageToolbar` in normal layout flow inside their safe
  area, above scrolling/keyboard-aware content. Existing shared Screen callers gain
  it without individual workflow changes.
- Welcome, account access, role selection, login, registration and guest chatbot
  layouts explicitly reuse that toolbar.
- `LanguageSelector` remains an adapter for existing callers. Both it and the
  toolbar suppress fallback controls when React Navigation reports a visible
  header, preventing a duplicate below the header.

The public `HeaderShownContext` comes from the already installed
`@react-navigation/elements` **1.3.31**, the same resolved instance used by the
installed native stack. No dependencies, lockfiles, native modules or native
configuration were changed for this UI checkpoint.

## Deliberate exceptions and device review

No button is injected into immersive call surfaces, private PDF/native document
viewers, clinical editing/time-picker modal sheets, system permission/authentication
dialogs, or the unfinished RTBF deletion modal. Their existing controls and drafts
are preserved. Return to the underlying screen to select a language. Adding a
switch inside these surfaces requires separate lifecycle review because Android
locale changes can recreate the Activity.

The existing preservation mechanism restores Doctor workspace tabs, not arbitrary
navigation stacks or unsaved clinical drafts. This checkpoint does not expand that
mechanism. Prefer selecting language before beginning a draft/consultation. Actual
device acceptance must check:

1. Artwork, branding and Get Started on small phones, Pixel 7, landscape/tablet,
   dark mode and larger fonts, with no essential illustration clipping.
2. One top-right button on guest/authentication, patient/doctor workspaces,
   appointments, notifications, settings and administrator screens; long native
   titles remain readable and native/custom back controls do not overlap it.
3. Immediate KIS/EN changes, persistence after restart/sign-out and readable
   destination labels with TalkBack.
4. Doctor Profile remains selected in both switch directions; AppCompat native
   back descriptions remain “Sogeza juu” / “Navigate up”, with controlled recreation
   and no authentication loss.

These are **PENDING device acceptance**, not claimed passes. No existing APK was
replaced. A separately authorized replacement build is required for standalone
device verification.

## Changed files for this checkpoint

- `mobile/assets/welcome-healthcare.png`
- `mobile/src/i18n/react.tsx`
- `mobile/src/i18n/messages.ts` (four UI keys in both catalogues)
- `mobile/src/ui/design.tsx`
- `mobile/src/navigation/PatientNavigator.tsx`
- `mobile/src/navigation/DoctorNavigator.tsx`
- `mobile/src/navigation/AdminNavigator.tsx`
- `mobile/src/screens/auth/OnboardingScreens.tsx`
- `mobile/src/screens/auth/LoginLayout.tsx`
- `mobile/src/screens/auth/RegistrationLayout.tsx`
- `mobile/src/screens/shared/ChatbotScreen.tsx`
- `mobile/__tests__/languageSwitcher.test.js`
- `mobile/__tests__/onboardingUI.test.js`
- `mobile/__tests__/localizationUI.test.js`
- `docs/UI_WELCOME_LANGUAGE_SWITCHER.md`

## Focused verification

Node 22.23.3; only directly related checks:

```text
cd mobile
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath __tests__/languageSwitcher.test.js __tests__/onboardingUI.test.js __tests__/localizationUI.test.js __tests__/localization.test.js __tests__/nativeLocale.test.js __tests__/localeRestoration.test.js __tests__/localeRestorationNavigation.test.js
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node ../scripts/Audit-MobileLocalization.cjs
```

Distinct final suite results: **83/83 tests PASS across 7 suites, 0 failed/skipped**.
Only affected suites were rerun after changes. The initial new switcher tests used
an unsuitable memo-wrapped Pressable selector; corrected test selectors retain the
same label/style/behavior assertions. No application failure was hidden.

Mobile TypeScript and translation/static checks PASS; catalogue contains 1,006
keys with no unlocalized static JSX. Whitespace and approved-asset byte identity
checks PASS. Render tests cover 320 × 568, 412 × 915 and 800 × 1280 dimensions;
these inspect component/layout inputs, not actual Android pixels.

The pre-UI preservation snapshot verifies 24 other pre-existing changed files
byte-for-byte unchanged. The two overlapping source files preserve all RTBF
translation entries and the recovery entry/import. No RTBF implementation or test
was edited. Both unrelated pre-existing files retain their original hashes:

- `docs/CHECKPOINT_1_ANDROID_APK.md`:
  `617688552188d556fb928ac8e3bc41a1197f6cd94508427552530fe289d63ede`
- `mobile/__tests__/consultationService.test.js`:
  `1420190ed0b6fb2138981b823f3b038eb47425ffef2571c65ab14d144f89f1f1`
