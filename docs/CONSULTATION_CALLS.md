# Consultation call signaling

The five signaling bindings are explicitly exported by `functions/src/index.ts`
as of C7B; this source change does not deploy them. C6A contracts and C6B policy are shared by the C6C start and C6D
lifecycle stores/handlers, including C6E ICE publication. C6F adds participant
signaling reads; controls and receipts remain backend-only.
Checkpoint 6 delivers backend signaling, not a completed mobile voice/video
feature. Local integration continues to use the guarded demo emulator entry.

## Requests and responses

- `startConsultationCall`: `{consultationId, requestId, mode, offer}` where mode
  is `audio` or `video` and offer is `{type: 'offer', sdp}`. Either bound participant
  may initiate; the other becomes the recipient. The consultation must already
  exist. Call ID is SHA256(JSON.stringify([consultationId, authenticatedUid,
  canonicalRequestUuid])). There is at most one nonterminal call and eight
  successful call creations per consultation; exact retries consume no attempt.
- `respondToConsultationCall`: `{consultationId, callId, requestId, action}`.
  `action: 'accept'` additionally requires `answer: {type: 'answer', sdp}`;
  `action: 'reject'` forbids an answer. Only the bound recipient may respond.
- `endConsultationCall`: `{consultationId, callId, requestId}`. The initiator may
  cancel while ringing; either participant may hang up an accepted call.
- `getConsultationCall`: `{consultationId, callId?}`. An omitted call ID selects
  the current pointer and returns `{call: null}` if there is no current call.
  An explicit inaccessible/missing ID receives generic `permission-denied`.
  Historical ended calls remain retrievable by explicit ID.

Mutation responses are `{call, replayed}`; retrieval returns `{call}`. These are
metadata only, preserving seconds/nanoseconds. No SDP, private receipts, approval
records or reusable eligibility flag is returned. Accepted is a signaling state,
not evidence that media connected.
Request UUIDs use canonical lowercase RFC-variant form, versions 1 through 8,
matching the shared request-ID validator. Offer and answer SDP are
preserved unchanged, start with `v=0` followed by a newline, and are limited to
65,536 UTF-8 bytes. Validation is structural, not a full SDP parser. Unknown
fields, client timestamps and client-supplied participant identities are rejected.

## Documents

Under `consultations/{consultationId}`:

- `calls/{callId}`: approved immutable bindings/mode and lifecycle metadata.
- `calls/{callId}/descriptions/offer`: immutable initiator SDP from C6C.
- `calls/{callId}/descriptions/answer`: immutable recipient SDP from C6D.
- `callControl/state`: private active pointer and successful-creation count.
- `callReceipts/start_{callId}`: existing private C6C start receipt.
- `callReceipts/respond_{digest}` and `callReceipts/end_{digest}`: private request
  receipts. Digest is SHA256(JSON.stringify([operation, authenticatedUid,
  canonicalRequestUuid])); the enclosing path scopes it to the consultation.
- `callReceipts/answer_{callId}`: private immutable copy of the successful
  acceptance receipt, linking the fixed answer path to its original request.
  Both receipt copies and the answer are created atomically with acceptance.

No new client authority fields or shared wire/schema fields are introduced.
Receipt fingerprints bind the complete validated request. Answer integrity
checks include recipient ownership, exact acceptance time, original fingerprint
and matching request receipt. Orphan/mismatched answer state fails closed.

## Transactions and lifecycle

Every request authenticates against canonical active identity and authoritative
appointment/consultation bindings. New starts and acceptances additionally check both
active participants and the complete current doctor approval binding. Historical
retrieval, exact replay and safe rejection/termination do not require counterpart
activity or current doctor approval. Administrators have no bypass.

All required reads precede one decision-time sample per transaction attempt.
Acceptance is permitted only while ringing, before ring timeout and consultation
expiry. Stored timestamps are actual Firestore Timestamps. Offer and answer are
create-only. State transitions update only the applicable lifecycle fields.
New starts, acceptances and ICE require a scheduled appointment and a decision
time at or after appointment start and strictly before appointment end plus 15
minutes. Ringing expires after 60 seconds, capped by that consultation deadline.
Reconciliation uses the earliest applicable consultation closure, expiry or ring
timeout; expiry wins a tie with ring timeout. It runs lazily during callables,
including retrieval and replay, rather than through a timer or background job.

Expiry/terminal reconciliation uses the existing C6B policy. Required closure
writes commit before an otherwise valid operation returns its denial. Invalid
authority or corrupt aggregate data aborts rather than repairing data.
Ended states never reopen. Ending a call does not complete an appointment or
close an otherwise eligible consultation. Attempt count never changes in C6D.
Clearing an ended pointer checks its call ID, so replaying an old call cannot
clear a newer active call. Retrieval also reconciles a stale current pointer.

Exact retries acknowledge an original successful operation and return current
reconciled metadata, without rewriting its answer or receipt. Changed-payload
retries conflict. A new request UUID cannot overwrite a previous answer.
Replay after expiry can close metadata but cannot restore live eligibility.

## Verification and boundaries

Focused tests use the real Firestore adapter with the existing optimistic SDK
double: competing writes retry, staged failures roll back, and reads after writes
fail. C6G adds backend transaction/transport emulator tests. C6F exercises read
and write authorization in the local Rules emulator. No SDP is logged by these handlers.

No mobile call service, media connectivity, native permissions/UI, STUN/TURN
provisioning, notifications, scheduled cleanup or
production deployment is included. Signaling authorization cannot terminate an
already-established peer-to-peer media stream.

## C6E ICE publication

`publishConsultationIce` accepts `{consultationId, callId, requestId, candidates}`.
Each candidate has `candidate`, `sdpMid`, `sdpMLineIndex` and optional
`usernameFragment`, exactly as defined by C6A. The candidate string is nonempty,
starts with `candidate:`, and is bounded to 2,048 UTF-8 bytes. Routing requires a
non-null mid (up to 256 bytes) or integer line index (0–65,535). An optional
username fragment is nonempty and at most 256 bytes. Empty/null end-of-candidates
events stay local. Validation is structural, not a complete ICE grammar parser.

New batches require an accepted call, active consultation within its window,
both active canonical participants and current full doctor approval. Either
participant may publish only as themselves; sender, sequence and timestamp are
backend assigned. No client timestamps or additional authority fields are accepted.
All reads finish before the single authoritative clock sample. Candidate creates,
receipt creation and sender-state update commit atomically. Expiry or terminal
appointment reconciliation persists before denying a new batch and cannot reopen
the call. Failed authorization/corrupt state aborts without repairing the aggregate.

Limits are 1–32 candidates per batch, 128 per sender per call, and at least one
second between successful new batches from a sender, compared at nanosecond
precision. Rate/quota failures return `resource-exhausted` without allocating
receipt or candidate state. Retries do not consume quota or advance rate state.

Additional paths under `consultations/{consultationId}`:

- `calls/{callId}/candidates/{candidateId}`: immutable C6A candidate document;
  sender sequence starts at 1 and increases per candidate. ID is SHA256 of
  JSON.stringify([consultationId, callId, authenticatedUid, requestId, batchIndex]),
  with a zero-based index in the validated batch.
- `calls/{callId}/iceSenderState/{uid}`: private sender ID, count, last batch
  Timestamp and schemaVersion. A bounded candidate inventory (maximum 256,
  reading one extra to detect overflow) checks ownership, sequences and counters
  so a deleted/reset counter cannot restore quota.
- `callReceipts/ice_{digest}`: private immutable batch receipt. Digest is SHA256
  of JSON.stringify(['ice', authenticatedUid, requestId]); the consultation path
  scopes UUID reuse. Receipt contains sender, UUID, call ID, complete validated
  request fingerprint, ordered candidate IDs and schemaVersion.

Exact retries verify the persisted batch against its receipt and return original
IDs with current reconciled call metadata: `{call, replayed, candidateIds}`.
No candidate contents, SDP, receipts or private state are returned or logged.
Changed payload/order or reuse for another call conflicts with `already-exists`.
Deduplication is by logical request UUID and batch index, not global candidate
content: repeated content under a new UUID (or at another batch index) consumes
quota. This preserves the C6A ordered batch without inventing normalization.

As with other C6 mutations, historical exact replay acknowledges an earlier
success after closure/expiry and may persist reconciliation; it publishes
nothing and grants no live access. The caller must still be an active canonical
participant, but counterpart activity/current approval is not required for that
acknowledgment. New ICE after closure/expiry fails with `failed-precondition`.

Private ICE paths are backend implementation details; no shared wire fields
were added. C6F permits authorized participant signaling reads while keeping
controls/receipts private and direct writes denied. Focused optimistic-store tests cover authorization,
retry conflicts, quota/rate races, rollback, corrupt state and decision-time
expiry. C6G also exercises real emulator concurrency; media connectivity has not
been tested.

## C6F direct Firestore reads

All paths below are relative to `consultations/{consultationId}`. All direct
client creates, updates and deletes are denied, including for administrators.

| Path | Participant get | List/query |
| --- | --- | --- |
| `calls/{callId}` | Allowed | Denied |
| `calls/{callId}/descriptions/offer` | Allowed | Denied |
| `calls/{callId}/descriptions/answer` | Allowed when present and consistent with acceptance | Denied |
| `calls/{callId}/candidates/{candidateId}` | Allowed | Bounded to 1–128 documents under one call; no offsets |
| `calls/{callId}/iceSenderState/{uid}` | Denied | Denied |
| `callControl/state` | Denied | Denied |
| `callReceipts/{receiptId}` (start/respond/end/answer/ICE) | Denied | Denied |
| Other description IDs, nested/unknown paths, global/collection-group queries | Denied | Denied |

Authorization reuses C5's strict canonical identity helper and checks the
authoritative appointment/consultation binding, then the call's identity,
schema, participants and lifecycle envelope. Only the bound patient with patient role
or doctor with doctor role can read. Claims, including administrator claims,
grant nothing. Missing parents, malformed signaling envelopes and mismatched
participant bindings fail closed.

Historical reads do not depend on counterpart activity, current doctor approval,
an active call/consultation or the current time being inside the messaging/call
window. Reads do not reconcile metadata or authorize new signaling writes.
Disabled callers lose access. Private controls and receipts are never returned
through these Rules, even to participants.

The C6 contracts did not prescribe a client query shape. C6F chooses a maximum
page size of 128, matching the per-sender candidate limit. Clients can listen to
a bounded call-scoped query, optionally constrain `senderId`, and paginate using
a snapshot cursor. Recommended ordering is `sequence ASC, documentId ASC` to
break ties between senders. Order is presentation, not authorization; no new
composite index is added. Call IDs come from the existing callables; call and
description collections cannot be enumerated.

As in C5, candidate lists authorize against the parent documents,
including empty queries. They rely on immutable backend-validated child writes;
Rules are not schema filters for each returned candidate. Direct child gets
also validate the envelope, ownership and timestamp binding. To stay within
Firestore's 1,000-expression limit, C6 read Rules do not repeat the full
appointment display/availability validation or transition-specific end-reason
checks. Existing C5 Rules are unchanged. Full SDP/ICE payload validation,
receipt fingerprints, quota and sequence integrity remain backend
responsibilities. Rules do not validate media connectivity or prevent a trusted
Admin SDK writer from bypassing them.

## C6G local integration gate

Run `npm --prefix functions run test:integration -- consultationCalls.integration.test.ts`
under Node 22 with process-local `FUNCTIONS_DISCOVERY_TIMEOUT=120`. Omit the
filename for the complete integration suite. The project remains fixed to
`demo-calladoc-integration` with the existing localhost emulator ports.

The gate builds normal Functions output, then generates an ignored
`functions/lib/c6-emulator` package from `scripts/integrationEntry.cjs`. This
entry loads the same 18 production exports, with no additional bindings, only after
checking Node 22, `FUNCTIONS_EMULATOR=true`, `GCLOUD_PROJECT` and
`GOOGLE_CLOUD_QUOTA_PROJECT` against the demo project, the demo Firebase
configuration and exact local Auth/Firestore/Storage endpoints. If present,
`GOOGLE_CLOUD_PROJECT` must also match the demo project.
Credential-file/token environment variables are rejected. The gate removes
inherited credential variables and refuses Functions `.env` files.

Normal `src/index.ts`, package `main` and production build inputs do not import
the entry. The integration-only Firebase config selects the generated package
and has an unconditional failing Functions predeploy command. It cannot be used
to deploy these test exports. No package installation is needed; the generated
entry resolves the existing compiled code and installed dependencies.

Integration tests use real Auth tokens, callable HTTP transport and Firestore
transactions. Expiry fixtures create valid historical records using injected
test clocks locally; no clock override is exposed through the emulator entry or
callables. These tests cover signaling persistence and security, not SDP/ICE
interoperability or actual audio/video connectivity.
