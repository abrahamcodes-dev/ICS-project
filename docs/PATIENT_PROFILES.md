# Patient profile persistence (Checkpoint 3C)

## Authorization and scope

`functions/firestore.rules` permits direct document gets, creates and updates at
`patientProfiles/{uid}` and `patientHealthProfiles/{uid}` only when the caller UID
matches the path and `users/{uid}` is a valid active patient identity. Identity
calendar dates and Unicode trim/length semantics are checked as well as the
existing schema, UID, role and status checks. Missing, malformed, disabled and
nonpatient identities receive no access.
Other patients, all doctors and administrators cannot access either collection.
Collection listing and document deletion are denied, including for the owner.

Health documents and all editable fields are optional. Reading a missing own
document is allowed and does not create it. No identity schema, other collection
permission, Storage rule, callable, mobile service or UI is changed by 3C.

## Writes and timestamps

The exact 3B fields are enforced, including `uid` equal to the path and
`schemaVersion: 1`. Unknown and identity/security fields are rejected.

- Create: use Firestore `serverTimestamp()` for both `createdAt` and `updatedAt`.
  Rules require real Timestamp values equal to `request.time`.
- Update: retain the existing `createdAt` Timestamp and use `serverTimestamp()`
  for `updatedAt`. Rules enforce immutable creation time, update time equal to
  `request.time`, and nondecreasing history.
- ISO strings and plain `{seconds, nanoseconds}` maps are not persisted timestamps
  and are rejected. SDK Timestamp values satisfy the SDK-independent 3B shape.
- To clear omitted editable fields, use a full `setDoc` replacement containing
  UID, schema version, existing creation time, server update time and only the
  newly supplied optional fields. Merge/update writes retain unspecified fields.
  Explicit null and blank values are rejected.

Rules enforce timestamp equality, not which client API produced the value. Clients
must use server transforms to reliably meet it; arbitrary past/future times fail.
Checkpoint 2 identity timestamps remain ISO strings.

## Validation agreement

Persisted text must already be normalized using the 3B semantics: trimmed,
nonblank, no ASCII controls/DEL. The pure validators normalize external input;
rules reject unnormalized writes instead of changing their contents. Lengths
count UTF-16 units, including two units per supplementary Unicode character.

Display name is at most 200 units; phone at most 32 with the approved character
set and at least three digits; gender at most 50. Each health list allows at most
20 nonblank strings of at most 200 units. Empty lists are valid. Aggregate regex
validation plus a join/split equality check validates all entries, rejects
nonstring entries and embedded separators, and stays below the Rules expression
limit even with all three lists full. Emulator tests cover maximum creates and
updates, every list position and Unicode boundaries.

DOB must be a real `YYYY-MM-DD` date, including Gregorian leap-year checks, no
later than the UTC date of server `request.time`. This matches the pure validator
when its trusted today argument uses that date. Year `0000` remains accepted,
as in 3B. No age minimum is introduced. There is no known relaxation of the 3B
patient field constraints. Real server timestamps and normalized writes are
intentional persistence requirements beyond the input-only validators.

## Verification

`functions/__tests__/rules/patientProfiles.rules.test.ts` uses only
`demo-calladoc-rules` at `127.0.0.1:8085`. It covers ownership, absent documents,
invalid identities, all denied roles, timestamp mutation, exact schema, clearing
fields, date/text/phone/list boundaries and agreement with normalized 3B inputs.
The existing identity rules suite also runs unchanged.

Use `npm run test:rules` in `functions` under the documented Node 22 runtime.
If the verified local demo emulator already occupies the configured port, run
the complete Jest rules suite directly with `FIRESTORE_EMULATOR_HOST` set to
`127.0.0.1:8085` and `--config jest.rules.config.js --runInBand`.

No production access or deployment is part of this checkpoint. Doctor access to
patient health information, patient screens, retention/deletion policies and
doctor verification workflows remain deferred.
