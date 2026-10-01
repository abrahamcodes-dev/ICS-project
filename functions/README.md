# Functions local development

Use Node **22.23.3** (pinned in `.nvmrc`). The Functions runtime is Node 22;
the system Node used for mobile development does not need to change.
The initial lockfile was generated with npm **11.13.0**.

From this directory, with Node 22 selected:

```sh
node --version
npm ci
npm run build
npm test -- --runInBand
```

`npm ci` restores the committed dependency tree. `npm run build` typechecks
the backend and emits JavaScript to the ignored `lib/` directory. The existing
unit tests import pure matching logic and need no Firebase credentials,
emulators, or production access.

On Windows without a Node version manager, an isolated npm-cached runtime can
run the installed npm CLI without changing the system Node installation:

```powershell
npm.cmd exec --yes --package=node@22.23.3 -- node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" ci
npm.cmd exec --yes --package=node@22.23.3 -- node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build
npm.cmd exec --yes --package=node@22.23.3 -- node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" test -- --runInBand
```

Adjust the npm CLI path if Node is installed elsewhere. The first execution
downloads the isolated runtime. These commands do not deploy Firebase resources.

Checkpoint 2A only establishes the build and existing unit tests. Identity
registration, authorization rules, and administrator provisioning are unchanged.
The canonical role remains `administrator`. Editable profile information and its
access model belong to Checkpoint 3.

## Checkpoint 2C registration

`completeRegistration` is the sole exported backend public identity creation
operation. The legacy `onUserCreate.ts` file remains but is no longer exported.
Removing an export locally does not retire an already deployed trigger; any
future rollout must explicitly account for deployed resources.

The callable requires Firebase authentication and fetches the Auth record through
the Admin SDK. Public input permits only `role` and `fullName`; additional fields
are rejected. Identity UID/email come from authenticated context and the Auth
record. Disabled Auth accounts and accounts without a usable email are rejected.

Each identity is read and conditionally created with `transaction.create()` in
one Firestore transaction. Policy evaluation occurs inside the transaction on
every retry. Existing valid same-role identities are returned without writes.
Timestamps are backend-generated canonical UTC ISO strings for both persistence
and the response, matching the approved policy contract. No Firestore Timestamp
or client timestamp is mixed into these records.

Tests mock Auth and Firestore, including transaction retry behavior; they do not
validate actual Firestore concurrency through an emulator. No production service
is accessed. Mobile registration still writes directly; integration with the new
callable awaits its substep. Unrelated callable exports remain unchanged.

## Checkpoint 2D Firestore rules

Run `npm run test:rules` with Node 22 selected. This starts only Firestore on
127.0.0.1:8085 using `firebase.rules-test.json` and the fixed demo project
`demo-calladoc-rules`. Java 21 or newer and an initial emulator download are
required. Tests refuse to run without the expected loopback emulator address.
`npm test -- --runInBand` remains the separate, Firebase-free unit suite.

Authenticated clients may get only their own identity (including disabled or
incomplete identities); all identity listing and client mutations are denied,
including fullName edits and administrator clients. Editable profiles are deferred
to Checkpoint 3. Helpers require a matching UID, active status, canonical role,
and a valid verification state for doctors. Clinical doctor privileges require
approved verification. Repeated identity lookups use the same document path so
Firestore can cache rule reads.

Availability is read-only for active patients, administrators, and approved
doctors. All availability writes and all access to appointments, consultations,
prescriptions, ratings, chatbotInteractions, verification and unknown collections
are closed until their checkpoint policies are designed. Feature source remains.

These rules do not secure Admin SDK callables: those bypass rules, and the existing
verification/review callable still requires the upcoming backend security review.
Storage rules are unchanged and still consult an administrator token claim rather
than the protected Firestore identity; address that in the Storage security step.
No rules or Functions are deployed by these tests.

## Checkpoint 2E administrator boundary

Only completeRegistration remains exported; public registration still accepts
only patient/doctor. onUserCreate and local provisioning are not exported.
Removing source exports does not remove already deployed functions: a future
approved rollout must retire any legacy deployed endpoints explicitly.

The authorization module reads users/{uid} with Admin SDK and reuses the canonical
schema validator. It rejects missing/malformed identities, UID mismatch, unknown
roles (including admin), and malformed doctor verification. Active guards reject
disabled identities; administrator and approved-doctor guards enforce those roles.
requireIdentity alone validates structure; privileged operations must use an active
role guard. Request data and custom claims are never role authority.

### Operator provisioning (requires separate production approval)

Build with Node 22 first. The local tool uses Application Default Credentials and
operator IAM authorization. Example placeholders, not executed in this checkpoint:

node scripts/provisionAdmin.cjs --project PROJECT_ID --uid AUTH_UID --full-name "Full Name" --operator "Operator identifier" --dry-run

Dry-run is the default and still reads the selected Auth/Firestore project.
Only --apply permits writes. Credentials are never command-line arguments.
Keep least-privilege operator credentials outside the repository.
The supplied operator identifier is attribution, not verified IAM identity;
retain Cloud Audit Logs for independent operator attribution.

The target must exist in Auth, be enabled, and have a verified usable email.
Creation uses administrator, active, schemaVersion 1 and backend-generated ISO
timestamps. Existing patients/doctors, disabled/malformed records and mismatched
details are refused. A matching administrator is returned unchanged. No claims
are set. A transaction creates the identity and administratorProvisioningAudit
event together (project, target UID, operator, timestamp). Retries reevaluate
existing data; create preconditions prevent overwrites. Dry runs and idempotent
results write nothing. Auth and Firestore are not jointly transactional: avoid
concurrent Auth changes while provisioning. IAM operators bypass rules; the audit
collection is not tamper-proof against those operators.

### Export audit

| Export | Finding / action |
| --- | --- |
| completeRegistration | Retained unchanged: authenticated Auth lookup and transactional policy. |
| submitCredentials | Inactive: authentication only; writes workflow fields into strict identity schema. |
| reviewVerification | Inactive: missing administrator/target/workflow checks; incompatible identity fields. |
| setAvailability | Inactive: lacks approved-doctor and schedule validation. |
| bookAppointment | Inactive: lacks active-patient and doctor/slot consistency checks. |
| startConsultation | Inactive: lacks appointment ownership/state checks. |
| issuePrescription | Inactive: lacks approved-doctor and consultation participant checks. |
| rateDoctor | Inactive: lacks consultation eligibility; adds noncanonical identity field. |
| matchChatbotRule | Inactive: unauthenticated Admin writes, caller-supplied userId, unbounded input. |

All implementations remain. Storage still uses request.auth.token.role for
administrator reads rather than Firestore identity authorization. Storage rules
and claims remain unchanged; resolve in Checkpoint 3. Firestore client identity
writes remain denied. No deployment or real provisioning occurred.

Tests inject Auth/Firestore mocks and cover authorization, operator arguments,
conflicts, atomic audit queuing, dry run, idempotency and retry policy. No production
credentials are used. The transaction adapter is unit-tested; this does not prove
live IAM permissions or cross-service atomicity.

## Checkpoint 2G schema review

Rules now check identity field sets, schema version, string field types, names,
timestamp representation and ordering before granting protected collection access.
Role/status/UID/doctor checks remain fail-closed; own identity reads intentionally
remain possible for diagnosing incomplete or disabled accounts. Full calendar
validation of ISO timestamp strings happens in backend/mobile JavaScript; rules
validate representation/order, not a JavaScript Date round-trip. All identity
writes remain backend-only. Stored email is an Auth-derived creation snapshot;
subsequent email-change synchronization is outside Checkpoint 2.
