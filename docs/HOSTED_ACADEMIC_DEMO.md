# Phase 3A remediation — restricted academic demo preparation

Historical preparation record. Admission and consent implementation now supersede
the proposal-only statements below; see HOSTED_ACADEMIC_DEMO_FINALISATION.md for
the current safeguards, verification, costs and Phase 3B prerequisites.

Baseline: 32c3c00, 137 suites / 3,897 tests previously passed. This preparation does
not rerun or replace that full baseline, approve hosted testing, or deploy anything.

## Targeted security updates

Functions overrides pin body-parser 2.x to 2.4.0, qs to 6.16.1,
fast-xml-parser to 5.12.0 and re2js to 2.8.7. Mobile pins only re2js 2.8.7 because
the other three packages are absent from its dependency tree. All selected parent
ranges accept the replacements. The XML parser requires is-unsafe ^2.0.3 and
strnum ^2.5.1, explaining the two additional transitive updates. Direct dependency
versions, React, Expo and Firebase major versions are unchanged. No audit-fix or
major migration was performed. Body-parser 1.x in development CLI dependencies is
not forced to incompatible 2.x.

## Clean local release preparation

Use installed Node 22.23.3 and installed locked dependencies, from the repository:

```powershell
& $node22 --test scripts/__tests__/academicRelease.test.cjs
& $node22 scripts/Prepare-AcademicRelease.cjs --project '<approved-id-academic-demo>'
& $node22 scripts/Check-AcademicRelease.cjs --inventory-only '<printed release path>'
```

The project value is validated locally; no project is created or contacted. A fresh
TEMP build compiles Functions outside the existing lib directory. Only compiled
modules reachable from lib/index.js, the runtime manifest and lockfile enter the
Functions payload. Relative import escapes, computed requires, undeclared runtime
dependencies and inactive verification/emulator entry points fail closed. Unreachable
legacy source is left intact. No source/test/admin scripts, environment, signing
material, backups or stale compiled modules are copied into the payload.

The runtime manifest omits development dependencies and deployment/operator scripts.
Its empty gcp-build script prevents a second cloud compilation of omitted TypeScript
sources. The original lockfile is retained for deterministic production installation.
Rules/indexes, Firebase configuration, inventory and verifier remain outside the
Functions source payload. File hashes and an exact Functions file set are checked;
the verifier also detects unlisted credentials, test outputs and byte tampering.

Root Functions, Firestore and Storage predeploy require the clean-release verifier and consequently
rejects raw working-tree deployment. Emulator project aliases, ports, source Rules,
local environment files and emulator startup scripts are unchanged. Emulator startup
does not execute this deploy-only hook. Prepared artifacts also reject deployment:
there is no environment variable or approval-file bypass. Actual admission/limits
implementation and policy approval require a reviewed future change before enabling
deployment. Inventory-only verification remains available offline. Do not bypass it
with manual uploads or copy an emulator entry as the runtime index.

The new templates in config/academic-demo contain only public/blank configuration
and the existing server-controlled simulation opt-in. They are not loaded by the
current app or Functions. No private hosted environment is created. Do not set
FUNCTIONS_EMULATOR or any emulator host in a hosted runtime. Never put server
controls or secrets in EXPO_PUBLIC variables. Use the approved project's real bucket
name, not an assumed appspot.com suffix. The existing default project is unchanged.

## Proposed admission and cost controls — not implemented

1. Private server-managed academicDemoTesters/{uid} records require enabled=true
   and an unexpired UTC expiry. No client membership writes or self-elevation.
   Admission is additional to canonical identity, role and doctor approval checks.
2. Gate registration completion and every protected callable, including custom
   transactional authorization paths. Check verified Google invitations before
   creating/linking identities or minting tokens; never trust submitted email/role
   or client claims as admission. Decide how invitations bind a new Google subject
   to an admitted UID without creating an open self-registration route.
3. Protect direct Firestore/Storage access with equivalent membership/expiry checks
   in separately reviewed academic-demo Rules. Preserve the local Rules/workflows;
   measure expression/read budgets and test every authorized and denied path.
   Preserve the narrow own-deletion-status exception and independent cleanup workers
   without restoring disabled users' clinical access.
4. Gating completeRegistration alone cannot prevent public Firebase Auth signups.
   For strict prevention of uninvited Auth account creation, approve a supported
   preprovisioned/login-only configuration or Identity Platform before-create gate.
   Otherwise explicitly accept that orphan Auth accounts can be created while
   application/data access remains denied. Private APK distribution is not admission
   control. App Check integration/enforcement is a separate decision, not assumed.
5. Proposed HTTP limits: minInstances=0, maxInstances=2, concurrency=10. Scheduled
   workers: minInstances=0, maxInstances=1, concurrency=1, retaining existing bounded
   job batches/timeouts and reconciliation behavior. Lower the Google function's
   explicit maxInstances=10 too; a global default alone would not override it.
   These are proposals in controls.proposal.json, not applied runtime settings.
6. Approve project/region, a separate demo application ID/signing identity, least-
   privilege deployer/runtime IAM and billing/budget thresholds. Budget alerts are
   not hard spending caps. Coordinate shutdown with unresolved payments/deletion jobs.

All access controls require explicit approval, implementation and affected API/Rules
tests before public hosting. No substantial registration/authorization architecture
change is introduced in this preparation. The draft hosted notice/retention/disposal
policy is in privacy/hosted-academic-demo-draft-2026-11-15.md; its proposed version
is not yet accepted by the current consent contract or displayed in the UI.

## Remaining exposure and deferred remediation

- Firebase JS's gRPC 1.9.16 chain: server-only certificate/error-message findings;
  RN module resolution does not load gRPC. Backend production gRPC is patched
  1.14.5. No application gRPC server was found. Upstream Firebase alignment or a
  tested scoped override is deferred; do not downgrade Firebase to npm's suggestion.
- React Navigation/query-string/decode-uri-component 0.2.2: malformed URL CPU DoS;
  no active navigation linking/parser use found. Fixed decoder 0.5.1 is outside
  ^0.2.2. Resolve compatibility before enabling external deep links; no forced
  Navigation major migration or unreviewed override.
- Expo fingerprint/minimatch 10.2.6: build-tool amplification with attacker-supplied
  patterns, not a patient-input path. Fixed 11.0.1 crosses the parent's major range.
  Trusted builds only; seek a supported upstream fix/backport.
- Deepmerge 4.3.1/Jest: configuration prototype poisoning; development exposure, no
  fixed version listed in the reviewed advisory. Do not process untrusted configs
  or adopt npm's obsolete Jest/Expo downgrades.
- Backend uuid 9.x through Admin/Google libraries: the vulnerable v3/v5/v6 caller-
  supplied-buffer path was not found in application use. Random UUID v4 is not that
  path. A broad Admin/transport upgrade is deferred pending compatibility review.
- Development Firebase CLI body-parser 1.20.8 remains outside the approved 2.x
  replacement; it is excluded from the production installation. A compatible 1.x
  follow-up is separate work. Tools must remain private/local and trusted.

Fixed RE2JS lookbehind, XML stop-node and qs comma-stringification modes were not
found in application use. The body-parser compressed-body advisory is important,
but reachability through the managed deployed callable parser is not established.
Patched versions and production audits are evidence, not penetration-test claims.
No findings are suppressed. InCallManager New Architecture classification remains
accepted for this checkpoint; physical audio, FCM delivery, STUN/TURN and complete
manual consultation/payment acceptance are deferred to Phase 4.

## Verification and approval gate

Verification completed with Node 22.23.3:

- Fresh Functions compilation and backend test TypeScript passed; mobile TypeScript passed.
- Affected backend Jest: 7 suites, 193 tests passed; mobile Jest: 5 suites,
  70 tests passed. No failed or skipped tests. The unrelated 3,897-test baseline
  was not rerun; existing application tests and assertions were not changed.
- New release security checks: 11 tests passed, none failed or skipped.
- Fresh production-only install: 242 packages. All 55 production exports loaded
  against dummy local emulator endpoints and matched the active source exports.
- Actual Firebase CLI archive: exactly 85 inventoried files, including 83 runtime
  JavaScript modules; no emulator-only entry, source tests or local environment.
- Resolved versions: backend body-parser 2.4.0, qs 6.16.1, fast-xml-parser 5.12.0,
  re2js 2.8.7; mobile re2js 2.8.7. Only the XML-required is-unsafe 2.0.3 and
  strnum 2.5.1 also changed. No direct dependency upgrades.
- Backend production audit: 8 moderate entries, no high/critical/low entries.
  Mobile production audit: 15 entries (10 high, 5 moderate); full mobile audit:
  23 entries (10 high, 5 moderate, 8 low). These are dependency entries including
  affected ancestors, not 23 distinct exploitable application paths. The exposure
  and mitigations above remain applicable; findings are not suppressed.
- Git whitespace and untracked-text whitespace checks passed. Interactive Metro
  and Firebase processes remained running with unchanged emulator configuration.
  All nine recovery snapshot hashes matched; no accounts or records were modified.

The hosted
project has not been created, billing has not been activated, and no cloud API is
used by release preparation. Console state remains unconfirmed after the earlier
metadata request returned HTTP 401. No real patient data is accessed.

Phase 3B requires approval of admission/strict-signup strategy, limits and budget,
project/app identity, hosted policy version and retention/disposal dates. The
current artifact is an offline verified candidate, deliberately not deployable.
