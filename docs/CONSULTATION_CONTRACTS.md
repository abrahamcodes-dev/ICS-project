# Consultation and text-message contracts

C5B defines the pure policy; C5C-F implement persistence, callables, participant
reads and closure reconciliation. There are 13 active production exports.
See CONSULTATION_LIFECYCLE.md, CONSULTATION_MESSAGES.md and CONSULTATION_READS.md
for adapter behavior and C5H remediation. The prior C5G regression predates
remediation; full regression must be rerun before release.

## Authoritative contracts

`shared/types/consultationContracts.d.ts` is SDK-independent; the existing
`consultation.ts` path re-exports its types. Old mode/status/optional ISO timestamp
contracts are superseded. Inactive legacy handlers are not activated or adapted.

`consultations/{appointmentId}` has exactly consultationId, appointmentId,
patientId, doctorId, appointmentStartAt, appointmentEndAt, state, createdAt,
closedAt and schemaVersion=1. IDs agree; participants differ; the interval is
valid. Participant/time snapshots are immutable and must match the authoritative
appointment. Creation is lazy, activation equals creation, and lifecycle is
absent -> active -> closed. Active has closedAt=null; closed has a timestamp.
There is no reopening or explicit close callable.

The minimum trusted appointment projection has exactly appointmentId, patientId,
doctorId, startAt, endAt and status (scheduled/cancelled/completed/no_show).
Adapters first validate actual C4 records and document-path binding, then
project these six fields. This projection does not replace the full C4 validator.

All domain times are exact seconds/nanoseconds values, copied and frozen.
Adapters decode/encode real Firestore Timestamp instances. ISO strings,
client clocks and plain-map persistence are not substitutes. No Firebase SDK is
imported by the new pure modules. Node crypto supplies SHA-256, not Firebase.

## Time and effective closure

PRE_START_GRACE_MS=0; POST_END_GRACE_MS=900000 (15 minutes).
New creation/sending requires scheduled and startAt <= trustedNow < endAt+900000.
Start is inclusive, appointment end remains eligible, deadline is exclusive.
Terminal status overrides grace. Comparisons preserve nanoseconds.

An active stored record never independently authorizes sending. Reconciliation
closes at the earlier of expiry and a safely supplied terminal decision time.
Terminal metadata is a separate trusted adapter input, not client data or a
persisted status copy. Validate it against now, creation and C4 lifecycle timing:
cancellation before start, outcomes at/after end. Invalid supplied metadata fails;
it does not silently fall back. A cancellation predating a purported room's
creation is inconsistent and fails closed.

If terminal metadata is unavailable, use the first trusted observation capped by
expiry. That fallback is observation time, not a claimed clinical event time.
Opening, sending and exact replay can persist closure atomically; subsequent calls preserve it.
Already-closed records never reopen or rewrite their first closure. Backward
clocks fail. Expiry alone always closes at end+grace even when observed later.
No timer, scheduler, notification or exact-time database write is promised.

## Authorization

Pure inputs are canonical identities resolved by trusted handlers.
Reuse C2 identity validation. History requires active patient/doctor participant;
no administrator/claim-only authority. History ignores current doctor approval,
counterpart status and send-window expiry. Binding/schema corruption still fails.

New creation/sends require both participants active with matching roles and the
doctor approved. Caller and participant identity snapshots must agree.
Transactions additionally enforce the C4 approval/profile/public-projection/
review binding; this pure module cannot prove it. No client-supplied boolean or
custom claim establishes that binding. Approval loss suspends new sends in both
directions, not historical access. Restoration only permits sending within the
original eligible window and never reopens a closed record.

## Requests, text and message identity

Open input is exactly {appointmentId}. Send input is exactly
{consultationId,messageRequestId,text}. Unknown fields fail, including forged
sender, role, timestamps, state, media and payment fields.

UUIDs follow existing strict lowercase canonical RFC-variant versions 1-8 policy;
uppercase/noncanonical values are rejected, not silently case-normalized.
Consultation ID equals the deterministic 64-lowercase-hex appointment ID.
Message ID is SHA256(JSON.stringify([consultationId,authenticatedSenderUid,
normalizedMessageRequestId])). Ordered array encoding prevents tuple ambiguity.

Raw text is a string, at most 16000 UTF-16 units before normalization. CRLF/CR
become LF. Outer whitespace is trimmed; internal spaces, tabs and newlines remain.
Normalized text is 1-4000 UTF-16 units. Blank input, NUL, DEL, C0 controls other
than TAB/LF (after CR normalization), and unpaired surrogates fail. Forbidden
controls are checked before trim so edge characters cannot evade validation.
Multilingual text, valid emoji and literal markup remain unchanged. Render plain
text later; this is not HTML sanitization or medical-content moderation.

Messages under consultations/{id}/messages/{messageId} contain exactly messageId,
senderId,type='text',text,createdAt,schemaVersion=1. Parent path supplies room
identity. No senderRole, profile, names, phone or appointment snapshots are copied.
Messages are immutable: no edit/delete C5 API. Retention is separately designed.

## Plans and exact retries

planOpen returns create/return/close with validated consultation data. Existing
rooms require history authorization, preserve creation and return effective
history state; absent rooms require new-operation eligibility. Transactions
read deterministic absence and use create preconditions so concurrent opens converge.

planSend returns create with message+rateState, or replay with the existing message
and rateState=null. Null means no rate write, NOT deletion. Read the exact parent
path and derived message ID; verify document ID bindings in the persistence adapter.
Stored messages must be canonical and have consistent sender/ID/time binding.
Identical normalized text returns the original committed message/time; changed
text or binding fails. Replay needs history authorization, not current send
eligibility. It may succeed after expiry/approval loss but never for disabled
callers. Replay creates nothing and consumes no additional rate allowance.

No rejected operation mutates its inputs or advances rate state. All returned
records and nested timestamps are copied/frozen. Pure results do not establish
that a write committed; handlers return success only after commit.

## Private rate state and transaction obligation

Per consultation+sender private state is exactly consultationId,senderId,
lastAcceptedAt,schemaVersion=1. No client read/write. The first new message is
eligible; subsequent new messages require now >= lastAcceptedAt+1000ms. Wrong
state key, malformed state or a backward clock fails. Distinct senders/rooms
have distinct state documents. Missing state means first use and must be read
transactionally; arbitrary privileged deletion is outside this invariant.

A pure planner cannot prevent two callers independently planning against the same
snapshot. The send transaction reads consultation, authoritative appointment,
canonical identities,
approval binding, derived message and private rate document in one transaction,
then atomically creates the message and replaces rate state. Transaction retries
reread state/time. This ensures simultaneous new sends inside one interval cannot
both commit. No process-local counter is sufficient. Never persist a plan from a
failed transaction. Read dependencies before writes; no external side effects in
retry callbacks. Trusted time must be refreshed per retry after all authorization/rate reads.
C5H remediation enforces one decision-time sample after the required reads in
each transaction attempt, including a separate history-only replay branch.

## Boundaries

Persistence, callables, participant reads and bounded mobile listeners are implemented.
C5G passed 1,138 Functions, 531 Firestore Rules, 56 Storage, 58 mobile and 59
integration tests before remediation. C5H fixes the clock and mobile-session/cursor
gaps with focused regression coverage; full regression remains pending.
Legacy startConsultation remains inactive and uses an obsolete schema; do not export it.

No media/signaling, payments, prescriptions, ratings, chatbot, notifications, final
chat UI, retention/deletion or production deployment is included in C5.
