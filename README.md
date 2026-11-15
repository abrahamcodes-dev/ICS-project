# CallADoc

CallADoc is a telemedicine prototype for patients and doctors in Kenya. The current
worktree includes registration and role routing, doctor verification, scheduling,
consultation messaging/calling, prescriptions, ratings, in-app notifications and a
deterministic English health-information assistant. Newer privacy, attachment,
account-deletion and simulated-payment features have separate checkpoint evidence.
Implementation and historical test results do not establish full native acceptance,
clinical approval or production readiness.

## Structure and prerequisites

| Path | Purpose |
|---|---|
| `mobile/` | React Native/Expo presentation and native development client |
| `functions/` | Firebase callable/application logic, Rules, indexes and tests |
| `shared/` | Shared TypeScript contracts |
| `docs/` | Contracts, checkpoint evidence, limitations and local procedures |
| `scripts/` | Local startup, snapshot and regression preparation |

Use Node **22.23.3** (`functions/.nvmrc`) for Functions and regression preparation.
The machine default may be Node 24; explicitly select the installed Node 22 binary
and put its directory first on the test shell PATH. No runtime installer is run by
the preparation scripts. Native Android builds use the documented **JDK 17** setup.
Firebase emulators require **Java 21+**; Android Studio **JBR 25.0.3** is available
on the development machine. Keep these Java settings process-local.

For a new checkout, install the locked dependencies separately (not during an audit
or against the running development environment):

```powershell
npm.cmd --prefix mobile ci
npm.cmd --prefix functions ci
```

The package lockfiles define resolved versions. The inspected worktree uses Expo
57, React Native 0.86.3, Firebase JS 12.19.0 and local Firebase CLI 15.32.0. Use the
local CLI instead of an unrelated global CLI. Windows/Android is the documented
development environment; iOS execution is not verified.

## Local Android development

Use the explicit synthetic **demo-calladoc** project. `.firebaserc` contains another
default project; do not use an unqualified Firebase command or change live settings
to run local development. No Firebase login is needed for the demo workflow.

See [Android emulator setup and snapshot-safe recovery](docs/MOBILE_FIREBASE_EMULATORS.md)
before starting or restarting anything. Existing Auth/Firestore/Storage state must
be exported before stopping the suite. The startup helper accepts a verified
`-ImportPath`, or explicit `-Fresh` only for an intentionally new empty environment.
It refuses occupied service ports. Never reuse an outdated pre-fixture snapshot.

The native modules require an Expo **development build**, not Expo Go. Initial or
dependency-changing Android builds use `npx expo run:android --device` under JDK 17;
starting Metro alone cannot add native modules. Payment UI changes themselves add
no native dependency.

With Node 22 selected, in `mobile/`:

```powershell
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATORS='true'
$env:EXPO_PUBLIC_FIREBASE_EMULATOR_HOST='127.0.0.1'
$env:EXPO_NO_DOTENV='1'
node --dns-result-order=ipv4first node_modules/expo/bin/cli start --dev-client --localhost --port 8081 --max-workers 1
```

Configure ADB reverse forwarding for the selected emulator/USB device as documented.
The host override also supports `10.0.2.2` for an Android Studio emulator. Fully reload
the app when changing Firebase mode/host. Do not combine Expo `--offline` with
`--localhost`; they are mutually exclusive CLI host options.

`mobile/.env.example` documents public client configuration. `functions/.env.example`
documents server configuration. Keep real `.env` variants private. Demo mode ignores
live Firebase client settings; server credentials and client secrets never belong
in `EXPO_PUBLIC_*` variables.

## Regression preparation

[Stabilisation preparation and regression commands](docs/STABILISATION_PREPARATION.md)
describe the disposable test copy, isolated projects and exact commands. Preparation
includes intended untracked files, excludes environments/backups, captures installed
dependencies in hashed archives for independent extraction and runs **no regression tests**. The original core
integration gate remains unchanged and continues rejecting local environment files.

## Current limitations

- Remaining manual payment acceptance is deferred to full end-to-end testing.
  Payments are explicitly simulated; no real M-Pesa STK request, PIN or settlement.
- Remote push is disabled; the implemented notification inbox is not proof of
  scheduled/background delivery.
- Patient health-profile editing and general prescription instructions remain
  unsupported in the current presentation workflow.
- Google real-account/device acceptance, comprehensive recovery/accessibility and
  cross-network media acceptance remain separate from mocked/emulator checks.
- Privacy notices/consent and financial/clinical retention policies are development
  drafts. Account deletion retains specified shared records; it is not blanket erasure.
- No measured 50-user capacity, two-second response target, participant SUS result
  or independent clinical validation is claimed.

Consult feature reports, especially `docs/CHECKPOINT_13.md` through `CHECKPOINT_16.md`,
`docs/GOOGLE_SIGN_IN.md`, `docs/SCHEDULING_DURATIONS.md` and
`docs/PAYMENT_SIMULATION_FINALISATION.md`, for the evidence and open limitations.
