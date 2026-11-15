# Phase 2A: stabilisation preparation

Subsequent results: [Phase 2B regression evidence and SDK 57 finalisation](REGRESSION_2026-11-15.md).

Prepared 15 November 2026. No full regression suite, deployment, commit or staging
is part of preparation. Existing application work and the interactive demo remain
in place. Remaining manual payment acceptance is deferred to the E2E phase.

## Repository protection

`.gitignore` excludes local environment variants (with `.env.example` exceptions),
emulator exports/backups, private administrative/signing files, local regression
directories and generated outputs. Ignoring a previously tracked secret would not
remove it from history: inspect the exact staged diff before any future commit.
Do not force-add the ignored `emulator-demo-backup/`, `.env` files or native APKs.

The historical `1df9abf:calladoc-starter.zip` was inspected in memory without
extracting/executing it or rewriting history: 118 entries, 86 files examined,
no encrypted/unsupported entries. No private-key blocks, tested token patterns or
administrative credential filenames were found. Its only environment template was
`calladoc/mobile/.env.example`, with zero populated assignments. Archive SHA-256:
`b359ae2cc88569a1fbba7090786f8ea71c6026c32f024eb545f755274751cb82`.
This focused review is not a guarantee that every historical blob is secret-free.

## Disposable worktree

Select installed Node 22.23.3, then from the development repository root:

```powershell
$node22='C:\Users\eyoel\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
& $node22 --version
& $node22 scripts/Prepare-RegressionWorkspace.cjs
```

The helper always creates a NEW `calladoc-regression-*` TEMP directory. It copies
eligible tracked and intended untracked files, preserving byte content and recording
SHA-256 hashes. It excludes local environments, exports, signing/administrative
credentials, generated output and personal `.vscode` settings. Both installed
node_modules trees are captured in hashed TAR archives, excluding generated native
Android/iOS build directories and dependency caches. The runner materialises
independent directories before approved execution, never junctions to development
dependencies. This also survives temporary node_modules directory cleanup. No
package installer or test is executed. The completion marker is written last;
partial copies cannot be used by the new runner. Preserve the source tree unchanged.

The original `functions/scripts/integrationGate.cjs` is unchanged and still rejects
Functions `.env*` files except `.env.example`. Its check succeeds in the disposable
copy because private environment files were never copied. No active environment
file is deleted, renamed or read for configuration. Re-prepare after any intended
source/configuration change; do not treat an old copy as current.

## Explicit emulator isolation

All hosts below are 127.0.0.1. Every test project starts with `demo-`. Existing
project names, data ports, predeploy-denial checks and core runtime guards remain.
Additional auxiliary ports are explicit to avoid the interactive Hub/Eventarc/Tasks.

| Suite/project | Auth | Firestore / WebSocket | Functions | Storage | Hub / Logging | Eventarc / Tasks |
|---|---|---|---|---|---|---|
| Interactive `demo-calladoc` (never a regression target) | 9099 | 8080 / 9150 | 5001 | 9199 | 4400 / 4500 | 9299 / 9499 |
| Core `demo-calladoc-integration` | 9105 | 8105 / 9155 | 5105 | 9205 | 4425 / 4525 | 9305 / 9505 |
| Payments `demo-calladoc-payments-tests` | 9106 | 8106 / 9156 | 5106 | - | 4426 / 4526 | 9306 / 9506 |
| Google `demo-calladoc-google-test` | 9107 | 8107 / 9157 | - | - | 4427 / 4527 | - |
| Consent/attachments/deletion `demo-calladoc-features-tests` | 9108 | 8108 / 9158 | 5108 | 9208 | 4428 / 4528 | 9308 / 9508 |
| Firestore `demo-calladoc-rules` | - | 8085 / 9165 | - | - | 4435 / 4535 | - |
| Storage `demo-calladoc-credentials` | - | 8095 / 9166 | - | 9195 | 4415 / 4515 | - |

Consent, attachment and deletion checks keep their scenarios but now import a
fail-closed Node/project/endpoint guard and use only the new feature project. Their
former interactive 9099/8080/5001/9199 destinations are no longer accepted. The
feature runner is restricted to a completed disposable copy, rejects `.env` files,
checks ports and generates a guarded nondeployable Functions entry in ignored lib/.
It does not change application authorization, payment policy, Rules or schemas.

`Run-Regression.cjs` removes inherited Firebase/Google/client configuration and
emulator overrides, supplies the exact demo project, selects Node 22 on child PATH,
uses a fresh unsigned CLI directory and refuses occupied test ports. It never
attaches to existing manual test services or stops their processes. All test data
creation/deletion is scoped to disposable test projects. No real provider is used.

## Commands for the next approved regression phase

Preparation runs only `plan`. Obtain separate approval before the execution phases.
In a fresh PowerShell session, select the directory printed by the preparation tool:

```powershell
Set-Location '<prepared regression workspace>'
$node22='C:\Users\eyoel\AppData\Local\npm-cache\_npx\52027bd8fc0022aa\node_modules\node\bin\node.exe'
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:PATH=(Split-Path $node22)+';'+$env:JAVA_HOME+'\bin;'+$env:PATH
& $node22 scripts/Run-Regression.cjs plan
```

After approval, run sequentially and retain exact output/exit codes:

```powershell
& $node22 scripts/Run-Regression.cjs mobile-types
& $node22 scripts/Run-Regression.cjs mobile-jest
& $node22 scripts/Run-Regression.cjs backend-build
& $node22 scripts/Run-Regression.cjs backend-types
& $node22 scripts/Run-Regression.cjs backend-jest
& $node22 scripts/Run-Regression.cjs rules
& $node22 scripts/Run-Regression.cjs storage
& $node22 scripts/Run-Regression.cjs integration
& $node22 scripts/Run-Regression.cjs payments
& $node22 scripts/Run-Regression.cjs google
& $node22 scripts/Run-Regression.cjs features
```

The runner prints the actual underlying commands in its plan. Build precedes
payment emulator execution; core/feature gates also build their own guarded entry.
Core integration includes its four suites; `features` includes all three newly
isolated checks. Ordinary Jest excludes the emulator suites by existing configs.

Expo Doctor is not currently installed in the project tree. After approval for the
tool acquisition, run inside the disposable copy (no application dependency upgrade):

```powershell
Push-Location mobile
npx.cmd expo-doctor
Pop-Location
```

In the ORIGINAL repository, before future staging/commit:

```powershell
git diff --check
git status --short --untracked-files=all
# Only after separately approved staging:
git diff --cached --check
```

Do not run npm ci/install against the live development tree as part of regression.
Prepared copies archive the currently installed versions independently. The Windows
built-in tar.exe is used; no archive tool is downloaded. For standalone Expo Doctor
work after approval, `node scripts/RegressionDependencies.cjs mobile` materialises
mobile dependencies without running tests. Pinning and
fresh-install reproducibility are a separate later check, not an installation
performed during preparation.

## Recovery and current data

Use [snapshot-safe local recovery](MOBILE_FIREBASE_EMULATORS.md). Snapshot creation
exports only and writes its completion marker last. Idle clients during export;
cross-service exports are not atomic. Never stop services after a failed snapshot.
The startup helper requires a verified manifest/checksum set for recovery and
refuses occupied main ports. No old Storage data is restored by snapshot creation.

During preparation the current snapshot contained five Auth accounts, including
Dr. James Mwangi, and one Storage blob. The existing Firebase and Metro processes
were not restarted; source environment files and older backups were not altered.
These counts are a preparation observation, not an acceptance-test result.

## Static security/contract review and deliberate exclusions

The active backend entry graph does not reach the legacy
`functions/src/verification/reviewVerification.ts` or `auth/onUserCreate.ts`.
The former has an administrator-authorization TODO and must never be re-exported.
They remain removal/quarantine candidates after reference review; nothing was deleted.

Static source/test parsing and relative-import resolution found no unexpected
broken relative import. The apparent `../index.js` in integrationEntry.cjs is
deliberate: the core gate copies it to lib/c6-emulator/, where it resolves the
compiled lib/index.js. No duplicate exact Firestore index definitions were found.
These checks do not replace the deferred full TypeScript/Jest/emulator regressions.

The coupled scheduling/payment/deletion paths share duration/cell locks, saved fee
snapshots and unresolved-payment guards. Registration requires explicit versioned
patient consent; the affected fixtures include it. Private attachment and financial
client writes remain denied by the existing Rules. No application policy or shared
contract was changed during Phase 2A. Real-provider, deployment/IAM/index and legal
policy readiness remain unverified.

Keep required referenced assets: consult-doctor-transparent.png, google-g.png,
role-patient.png and welcome-doctor.png. The two unreferenced original doctor images
are optional design-source candidates, not required runtime assets: recommend
omitting them from product commits unless source provenance is intentionally kept.
Personal `.vscode/settings.json` only names a Live Server workspace: recommend
omitting it unless the team adopts that setting. No asset/editor file was deleted.

Historical test counts retain their original dates. This preparation does not
claim new full regression passes, manual payment acceptance, live Firebase success,
performance/load compliance, participant SUS results or clinical validation.
