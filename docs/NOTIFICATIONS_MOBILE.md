# Checkpoint 9G — private notification inbox

## Implemented event coverage

| Event | Recipients and generation |
| --- | --- |
| Booking confirmation | Both authoritative appointment participants, in booking transaction |
| Cancellation | Both participants, in cancellation transaction |
| Upcoming reminder | Current caller's scheduled appointments starting within one hour, on first-page inbox refresh; maximum 20 per refresh |
| Doctor approved/rejected | Doctor bound to the reviewed verification request, in review transaction |
| New consultation message | Other consultation participant, in new-message transaction; no event on exact replay |
| New prescription | Associated patient, in immutable prescription creation transaction |

These changes do not backfill historical events. Reminders are foreground,
refresh-driven in-app alerts, **not scheduled background/push reminders**. No
scheduler, task queue, paid service, trigger deployment or billing change was added.
The first response may precede reminder creation; the client performs at most one
extra bounded refresh to include newly created reminders.

## Persistence and authorization

`notificationInboxes/{uid}/items/{id}` contains id, uid, kind, sourceId,
appointmentId (null for verification), server-derived createdAt Timestamp, nullable
readAt Timestamp and schemaVersion 1. IDs hash `[kind, sourceId, recipientUid]`.
There is no free-form notification title/body, medical detail, rejection reason,
message text or prescription content.

Source writers derive recipients from validated canonical domain records, not
client notification payloads. Inbox creation is in the same transaction as the
source event, so rollback cannot leave a false alert. Existing mutation replays do
not repeat the source write. Read acknowledgment is idempotent.

Four callables bring the production **source** export count to 30:

- `listNotifications({limit?, after?})`: canonical active patient/doctor only;
  default 20, maximum 50, descending createdAt/document ID with an owned-document
  cursor. Client page size is 20. Full Timestamp precision is retained by snapshot
  cursors. No global listing or client-supplied recipient.
- `markNotificationRead({id})`: derives own inbox, updates only readAt.
- `openNotification({id})`: rechecks current canonical identity and appointment
  participation or verification ownership; message/prescription routes also check
  consultation binding. Returns only an allowlisted destination and optional ID.
- `setNotificationDevice({token, enabled})`: canonical active patient/doctor only;
  Android native FCM token, never an Expo push token. Another owner's token cannot
  be claimed or revoked. No token is returned through the inbox.

Firestore and Storage Rules are unchanged. The existing catch-all denies all
direct client access to inboxes and device records. All access is through the
authorized callables. Inbox ordering needs no composite index; reminders reuse
the existing participant/status/startAt scheduling indexes.

## Mobile behavior

Patient Home and Doctor workspace expose Notifications. Pending/rejected doctors
can open a verification inbox from their existing verification gate, without
gaining clinical navigation. Inbox supports loading, empty/error states, refresh,
deduplicated bounded pagination, read/unread and confirmed navigation.
Message destinations use the existing consultation gate; appointment, prescription
and verification screens retain their own authorization and eligibility checks.
Opening a closed consultation may show its existing eligibility error.

Blur/unmount and identity refresh dispose listeners/session state and ignore late
responses. Pending-doctor notification navigation returns only to verification.
No automatic navigation based on untrusted push payloads is implemented.

## Push registration versus delivery

The former scaffold obtained Expo push tokens but passed them to an FCM sender.
It is replaced by explicit permission handling and native Android device-token
registration. Native access is lazy, user-initiated and fails gracefully if
credentials/permissions are unavailable. In-app inbox access does not depend on it.

`notificationDevices/{sha256(token)}` stores owner UID, native token, Android/FCM
type, updatedAt, expiresAt (24-hour lease metadata), schemaVersion. Direct reads
are denied. No token/content is logged.

Within the running session, registration is serialized; rotation on re-registration
revokes the old token first. Uncertain registration retains revocation intent.
Sign-out waits for pending registration and confirmed revocation while authentication
is still valid; failed revocation leaves the user signed in for retry. Permission
denial attempts revocation. Another account cannot overwrite an existing binding.

**Remote delivery is disabled.** There is no active push sender, retry worker or
delivery claim. The checked-in Expo config has no Android Firebase native credential
file/configuration, and neither native FCM nor iOS push is device-verified.
No native configuration or dependency was added.

Registration intent is memory-only; after process death, an old server binding
may remain. expiresAt is metadata, not automatic deletion (no TTL infrastructure
configured). Safe durable revocation/rotation, lease enforcement, invalid-token
cleanup and a retry-aware delivery worker must be reviewed before enabling push.
A token registration response explicitly reports `deliveryEnabled: false`.
No background/exactly-once push delivery guarantee is claimed.

## Validation and remaining work

Functions build passed under Node 22. Focused backend notification/event tests and
directly affected booking, cancellation, verification, message, prescription and
export tests passed **312/312** across seven suites.

Mobile tests passed **53/53** across six suites. An initial Jest dynamic-import
failure in the new permission/logout path was corrected using lazy native require
and a normal logout-helper import; only affected suites were repeated. Mobile
TypeScript and whitespace checks passed.

Rules execution, real transaction concurrency, native permission/token behavior,
Android inbox/navigation and actual delivery remain unverified. No emulator was
launched, no Firebase deployment/push occurred and no billing setting changed.
Existing Rules tests deny unknown paths; the emulator is unavailable for execution.

For local testing, the new callables/source writers must be available in the
authorized emulator environment. Create synthetic events after loading this code,
verify recipients and unread state, retry source mutations, change accounts, test
pending-doctor navigation, and refresh within an hour of a scheduled appointment.
Do not use real medical messages or production credentials for testing.
