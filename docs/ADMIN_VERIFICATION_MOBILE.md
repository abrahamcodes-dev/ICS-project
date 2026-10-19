# Checkpoint 9B — Administrator doctor verification

Implementation is ready for automated review, not yet device-verified. The PDF spike
and its standalone development entry remain separate. The normal administrator route
now uses the same installed native renderer; it does not import the synthetic harness.

## Queue and authorization

`listPendingDoctorVerifications` is the only new callable (19 total production source
exports). A read-only Firestore transaction reads the canonical `users/{uid}` identity
and requires an active `administrator`; token role claims and client role fields grant
no authority. It queries only `verificationRequests.state == submitted`, ordered by
ascending document ID. Default limit is 10, maximum 20, with one lookahead document.
The cursor is the final returned request ID. It works even if that request is reviewed
before loading the next page. There are no offsets or client collection queries.

Ordering is deterministic, not chronological. Refresh starts a new page; new requests
sorting before the current cursor appear after refresh. The mobile list deduplicates
request IDs. This is a paged view of a changing queue, not a frozen export.

Only request/doctor IDs, revision, the submitted professional snapshot, submitted time
and credential references are returned. No identity email, phone, audit records or
download URLs are returned. Corrupt request documents fail the page closed. The query
uses the automatic state index (which includes document ID ordering); no composite
index or security-rule changes were introduced. Actual emulator query execution remains
part of workflow testing.

## Reviewing evidence

Select a request to see professional name, specialty, registration number, issuing
authority, submission time, revision and credential categories. Selecting one document:

1. Checks the active administrator session.
2. Reads only that request and credential record by ID under existing Firestore Rules.
3. Checks request/doctor/credential ownership, revision, submitted/attached state,
   canonical path, category, generation and checksum-reference bindings.
4. Uses Firebase Storage `getBytes(ref, 5242880)`. The SDK supplies authentication and
   uses the existing emulator configuration. Storage Rules validate the attached slot,
   object generation, type and size. No `getDownloadURL`, signed URL, external viewer,
   service-account credential or unauthenticated HTTP fetch is used.
5. Checks the returned size and writes only the selected PDF/JPEG/PNG to private cache.
   PDF uses `trustAllCerts={false}`, caching off and annotations disabled; images use
   React Native `Image` with a local file URI.

Close, background, logout, session replacement and unmount invalidate pending results
and trigger best-effort file deletion. A late write deletes its own file and cannot
reopen the viewer. Firebase `getBytes` is not cancellable through its public Promise:
an in-flight network read may finish after close, but its result cannot be displayed or
written by a stale selection. No document text, bytes, paths or tokens are logged.
Abrupt process death can leave private cache data; this is not guaranteed secure erasure.
Native rendering and native image-cache behavior still need Android testing.

## Decisions

The dashboard calls the existing `reviewDoctorVerification` with request ID, exact
submitted profile revision, decision and (for rejection) a required normalized reason
of 1–1000 characters without control characters. Confirmation and an immediate in-flight
lock prevent double taps. Backend transaction authorization, evidence checks, immutable
review state, replay/conflict checks, profile publication and audit creation are unchanged.
After a successful response the row is removed locally. A network error can be ambiguous:
refresh to confirm; an exact retry uses the same existing backend idempotency contract.
Different reviewers or changed/conflicting decisions remain rejected by the backend.

## Validation and Android workflow

Focused tests cover queue canonical authorization, bounded pagination and Firestore query
construction; existing verification transaction tests cover approval/rejection and audit
behavior. Mobile tests mock Firebase and native rendering to cover access bindings, file
cleanup, delayed results, duplicate decisions, loading/errors, pagination and the UI.
Mocked tests do not prove native binary download/render behavior or Storage Rules execution.

Recorded automated results for this implementation:

- Functions TypeScript build under cached Node 22.23.3: PASS.
- `verificationQueue.test.ts` and `verificationQueueStore.test.ts`: 25/25 PASS.
- Existing `verificationWorkflow.test.ts`, `exportSurface.test.ts` and
  `integrationEntry.test.ts`: 99/99 PASS.
- Mobile `adminVerification.test.js`: 27/27 PASS.
- Mobile `adminVerificationUI.test.js`: 14/14 PASS. An initial cold-render timeout
  passed on an unchanged rerun; no timeout or assertion was weakened.
- Mobile TypeScript and `git diff --check`: PASS.

The initial queue fixture accidentally changed both the document ID and stored request
ID in the mismatch test. Keeping the document ID independent corrected that test.

No native configuration changed in 9B, so the PDF spike's JDK 17 APK can be used without
another native rebuild. No deployment or emulator launch was performed by this checkpoint.

For the separately approved Android test:

1. Build Functions under Node 22.23.3; start the local Firebase suite with existing rules
   and the demo project. Use the documented mobile emulator mode (`demo-calladoc`), not
   production credentials or live resources. Reload Functions so the new queue export is
   available. See `MOBILE_FIREBASE_EMULATORS.md`.
2. Provision a canonical active administrator through the existing approved operator
   process in the local demo environment. Public registration cannot create administrators.
3. Use 9A with a synthetic doctor and synthetic PDF/JPEG/PNG credentials to submit a
   request. Sign in as the administrator through the normal app entry.
4. Refresh/paginate the queue, inspect professional details, and open each format. Verify
   rendering, no broad-storage permission prompts, close/background/logout cleanup and
   denied reads for unrelated or disabled identities. Exercise network failure during a
   download and verify that stale results never reopen the viewer.
5. Reject with a reason; confirm the doctor's rejected state and unchanged audit semantics.
   Submit a fresh revision, then approve and confirm verified profile publication. Test
   concurrent reviewers, duplicate taps and refresh after a lost decision response.

9A and 9B must not be called fully verified until these workflows run on Android. Live
backend availability is a separate prerequisite: no Firebase deployment is authorized.
