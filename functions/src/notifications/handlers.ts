import { createHash } from 'crypto';
import { FieldPath, Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { createAuthorization } from '../shared/authorization';
import { safeId, strictRecord, DomainValidationError, fail } from '../profiles/domainValidation';
import { digestId } from '../scheduling/ids';
import { consultationTransaction } from '../consultations/consultationStore';
import { authorizeHistory } from '../consultations/policy';
import { bindConsultation, validateAppointmentProjection } from '../consultations/domain';
import { validateAppointment } from '../scheduling/validation';
import { inbox, notificationId, writeEvent } from './events';
const kinds = ['booking', 'cancellation', 'reminder', 'verification_approved', 'verification_rejected', 'message', 'prescription'];
function notification(d: DocumentData | undefined, id: string, uid: string) {
  if (!d || d.id !== id || d.uid !== uid || d.schemaVersion !== 1 || !kinds.includes(d.kind)
    || !(d.createdAt instanceof Timestamp) || (d.readAt !== null && !(d.readAt instanceof Timestamp))) fail('notification-binding');
  safeId(d.sourceId);
  if (d.kind.startsWith('verification_')) { if (d.appointmentId !== null) fail('binding'); } else digestId(d.appointmentId);
  if (notificationId(d.kind, d.sourceId, uid) !== id) fail('binding');
  return d;
}
type Request = { auth?: { uid: string }; data: unknown };
/** All inbox/device paths are backend-only under existing catch-all Rules. */
export function createNotificationHandlers(db: Firestore) {
  async function work(request: Request, operation: 'list' | 'read' | 'open' | 'device') {
    let data: Record<string, unknown>;
    try {
      const keys = operation === 'list' ? ['after', 'limit'] : operation === 'device' ? ['token', 'enabled'] : ['id'];
      data = strictRecord(request.data, keys, operation === 'list' ? [] : keys);
      if (operation === 'list') {
        if (data.after !== undefined) digestId(data.after);
        if (data.limit !== undefined && (!Number.isInteger(data.limit) || (data.limit as number) < 1 || (data.limit as number) > 50)) fail();
      } else if (operation === 'device') {
        if (typeof data.token !== 'string' || data.token.length < 20 || data.token.length > 4096
          || /[\s\u0000-\u001f]/.test(data.token) || /^(Expo|Exponent)PushToken/.test(data.token) || typeof data.enabled !== 'boolean') fail();
      } else digestId(data.id);
    } catch { throw new HttpsError('invalid-argument', 'Invalid notification request.'); }
    try {
      return await db.runTransaction(async tx => {
        const actor = await createAuthorization(async uid => (await tx.get(db.collection('users').doc(uid))).data()).requireActive(request.auth);
        if (!['patient', 'doctor'].includes(actor.role)) fail('role');
        const uid = actor.uid, collection = inbox(db, uid);
        if (operation === 'device') {
          const token = data.token as string, hash = createHash('sha256').update(token).digest('hex');
          const ref = db.collection('notificationDevices').doc(hash), stored = (await tx.get(ref)).data();
          if (stored && stored.uid !== uid) {
            if (!data.enabled) return { registered: false, deliveryEnabled: false }; // Never delete another owner's binding.
            throw new HttpsError('failed-precondition', 'Device belongs to another account. Revoke it from that account first.');
          }
          if (data.enabled) tx.set(ref, { uid, token, platform: 'android', transport: 'fcm', updatedAt: Timestamp.now(),
            expiresAt: Timestamp.fromMillis(Date.now() + 86400000), schemaVersion: 1 });
          else if (stored) tx.delete(ref);
          return { registered: data.enabled, deliveryEnabled: false };
        }
        if (operation === 'list') {
          const size = (data.limit as number | undefined) ?? 20;
          let query = collection.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(size);
          if (data.after) {
            const cursor = await tx.get(collection.doc(data.after as string));
            if (!cursor.exists) throw new HttpsError('invalid-argument', 'Refresh notifications to restart pagination.');
            notification(cursor.data(), cursor.id, uid); query = query.startAfter(cursor);
          }
          const page = await tx.get(query);
          // First-page refresh creates at most 20 upcoming reminders, using the existing appointment index.
          const reminders: { id: string; at: Timestamp }[] = [];
          if (!data.after) {
            const now = Date.now();
            const upcoming = await tx.get(db.collection('appointments').where(`${actor.role}Id`, '==', uid)
              .where('status', '==', 'scheduled').where('startAt', '>=', Timestamp.fromMillis(now))
              .where('startAt', '<=', Timestamp.fromMillis(now + 3600000)).orderBy('startAt').limit(20));
            const readers = consultationTransaction(db, tx);
            for (const row of upcoming.docs) {
              const a = validateAppointment(await readers.appointment(row.id));
              if (a.appointmentId !== row.id || a[actor.role === 'patient' ? 'patientId' : 'doctorId'] !== uid) fail('binding');
              if (!(await tx.get(collection.doc(notificationId('reminder', row.id, uid)))).exists)
                reminders.push({ id: row.id, at: new Timestamp(a.startAt.seconds, a.startAt.nanoseconds) });
            }
          }
          const items = page.docs.map(row => { const d = notification(row.data(), row.id, uid);
            return { id: row.id, kind: d.kind, createdAt: d.createdAt.toMillis(), read: d.readAt !== null }; });
          const now = Timestamp.now();
          for (const r of reminders) if (r.at.toMillis() >= now.toMillis()) writeEvent(db, tx, uid, 'reminder', r.id, r.id, now);
          return { items, nextCursor: page.size === size ? page.docs[page.size - 1].id : null, remindersCreated: reminders.length > 0 };
        }
        const ref = collection.doc(data.id as string), row = await tx.get(ref), d = notification(row.data(), row.id, uid);
        if (operation === 'open') {
          if (d.kind.startsWith('verification_')) {
            const v = (await tx.get(db.collection('verificationRequests').doc(d.sourceId))).data();
            if (actor.role !== 'doctor' || !v || v.doctorUid !== uid || v.requestId !== d.sourceId
              || !['approved', 'rejected'].includes(v.state)) fail('binding');
          } else {
            const readers = consultationTransaction(db, tx), a = validateAppointment(await readers.appointment(d.appointmentId));
            if (a.appointmentId !== d.appointmentId) fail('binding');
            const projection = validateAppointmentProjection({ appointmentId: a.appointmentId, patientId: a.patientId, doctorId: a.doctorId,
              startAt: a.startAt, endAt: a.endAt, status: a.status });
            authorizeHistory(projection, actor);
            if (d.kind === 'message' || d.kind === 'prescription') bindConsultation(await readers.consultation(a.appointmentId), projection);
          }
        }
        if (d.readAt === null) tx.update(ref, { readAt: Timestamp.now() });
        if (operation === 'read') return { read: true };
        return { target: d.kind.startsWith('verification_') ? 'verification' : d.kind === 'message' ? 'consultation'
          : d.kind === 'prescription' ? 'prescriptions' : 'appointments', ...(d.appointmentId ? { appointmentId: d.appointmentId } : {}) };
      });
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      if (e instanceof DomainValidationError) throw new HttpsError('permission-denied', 'Notification unavailable.');
      throw new HttpsError('internal', 'Notification operation could not be confirmed.');
    }
  }
  return { list: (r: Request) => work(r, 'list'), read: (r: Request) => work(r, 'read'),
    open: (r: Request) => work(r, 'open'), device: (r: Request) => work(r, 'device') };
}
