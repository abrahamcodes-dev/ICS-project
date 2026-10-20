import { createHash } from 'crypto';
import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { NotificationKind } from '../../../shared/types/notificationContracts';
import type { DomainTimestamp } from '../../../shared/types/profiles';
import { safeId, timestamp } from '../profiles/domainValidation';
export const notificationId = (kind: NotificationKind, source: string, uid: string) =>
  createHash('sha256').update(JSON.stringify([kind, safeId(source), safeId(uid)])).digest('hex');
export const inbox = (db: Firestore, uid: string) => db.collection(`notificationInboxes/${safeId(uid)}/items`);
/** Called only by successful authoritative transaction writers. No push or clinical content. */
export function writeEvent(db: Firestore, tx: Transaction, uid: string, kind: NotificationKind,
  sourceId: string, appointmentId: string | null, at: DomainTimestamp) {
  const t = timestamp(at), id = notificationId(kind, sourceId, uid);
  tx.create(inbox(db, uid).doc(id), { id, uid: safeId(uid), kind, sourceId: safeId(sourceId), appointmentId,
    createdAt: new Timestamp(t.seconds, t.nanoseconds), readAt: null, schemaVersion: 1 });
}
