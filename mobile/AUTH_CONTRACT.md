# Mobile authentication contract (Checkpoint 2F)

registerUser accepts email/password, fullName and the public patient/doctor role.
It validates public input before account creation, creates Firebase Auth once,
then calls completeRegistration with only role/fullName and reads users/{uid}.
UID/email/status/verification/timestamps/schema are never supplied by the client.
The callable response and loaded identity are parsed against the canonical schema.
No client identity writes or automatic Auth account deletion remain.

If setup fails after account creation, RegistrationIncompleteError reports that
completion could not be confirmed. The Auth account is preserved. Retry
completeUserRegistration for the signed-in account (or log into that account after
restart); never retry by creating another account. Backend idempotency handles
a prior callable commit whose response was lost. Permanent conflicts still need
operator assistance; retrying does not bypass backend validation.

AuthContext exposes:
- initializing: initial Auth observation pending;
- signedOut: no Firebase Auth user;
- loadingIdentity: signed in, identity read pending;
- identityMissing: signed in, document absent;
- ready: valid canonical identity loaded, including status and doctor verification;
- identityError: failed read, malformed identity, or Auth observation failure.

firebaseUid distinguishes Auth presence from identity availability. user contains
only parsed identity data. refreshIdentity supports retrying reads, and successful
or failed completion requests a refresh automatically. logout signs out through
Firebase and clears local identity via the Auth observer/refresh. Generation
checks discard stale reads after logout, account changes, refreshes, or unmount.

ready does not itself mean an active account or approved doctor. RootNavigator
only enters role stacks for active identities, and doctors must be approved.
It renders no new UI for incomplete/error/disabled/unapproved states; those screens
remain future frontend work. Existing Login/Register screens are unchanged.

Client parsing/navigation is not a security boundary. Firestore rules and callable
authorization remain authoritative. administrator is recognized; admin and unknown
roles fail validation. Doctor pending/approved/rejected values remain intact.
The parsing contract must evolve deliberately with later schema changes.

No Auth persistence was added. The memory-persistence warning remains deferred.
No callable or rules were deployed; end-to-end registration requires a separately
approved backend rollout. Tests use Firebase mocks and never production.

Verification found pre-existing mobile typecheck blockers: moduleResolution=node
conflicts with inherited customConditions, TypeScript 6 deprecates node10/baseUrl,
Jest/Node ambient types are not available under the current configuration, and
the existing notification service references missing expo-notifications.
These unrelated issues were not repaired in Checkpoint 2F.

## Checkpoint 2G baseline verification

The earlier TypeScript blockers are resolved: tsconfig inherits Expo's bundler
resolution, removes deprecated baseUrl, and explicitly loads Jest/Node types.
npm run typecheck is the normal check. expo-notifications is installed through
Expo's SDK compatibility command solely to satisfy the existing service import.
No notification behavior or platform setup was implemented.
