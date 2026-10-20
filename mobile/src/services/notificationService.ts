import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebaseConfig';
import { onIdentityRefresh } from './authService';
import type { NotificationPage, NotificationTarget, NotificationKind } from '@shared/types/notificationContracts';
export { registerForPushNotifications } from './notificationDevice';
export const notificationLabels: Record<NotificationKind, string> = {
  booking: 'Appointment booked', cancellation: 'Appointment canceled', reminder: 'Appointment starts within an hour',
  verification_approved: 'Verification approved', verification_rejected: 'Verification review completed: rejected',
  message: 'New consultation message', prescription: 'New prescription available',
};
export function createNotificationSession(uid: string) {
  let disposed = false;
  const stop = onIdentityRefresh(() => { disposed = true; });
  function check() { if (disposed || auth.currentUser?.uid !== uid) throw new Error('Session changed.'); }
  function id(value: string) { if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid notification ID.'); }
  async function call(name: string, data: unknown): Promise<any> { check(); const r = await httpsCallable(functions, name)(data); check(); return r.data; }
  return {
    dispose() { disposed = true; stop(); },
    async list(after?: string): Promise<NotificationPage> {
      if (after) id(after);
      let d = await call('listNotifications', { limit: 20, ...(after ? { after } : {}) });
      // One bounded refresh includes reminders created during the initial request.
      if (!after && d?.remindersCreated === true) d = await call('listNotifications', { limit: 20 });
      if (!d || !Array.isArray(d.items) || d.items.length > 20 || (d.nextCursor !== null && typeof d.nextCursor !== 'string')) throw new Error('Invalid inbox response.');
      if (d.nextCursor !== null) { id(d.nextCursor); if (d.nextCursor === after) throw new Error('Invalid cursor.'); }
      const items = d.items.map((n: any) => {
        id(n.id); if (!Object.hasOwn(notificationLabels, n.kind) || !Number.isFinite(n.createdAt) || typeof n.read !== 'boolean') throw new Error('Invalid notification.');
        return { id: n.id, kind: n.kind, createdAt: n.createdAt, read: n.read };
      });
      return { items, nextCursor: d.nextCursor };
    },
    async read(key: string) { id(key); const d = await call('markNotificationRead', { id: key }); if (d?.read !== true) throw new Error('Read not confirmed.'); },
    async open(key: string): Promise<NotificationTarget> {
      id(key); const d = await call('openNotification', { id: key });
      if (!d || !['appointments','consultation','prescriptions','verification'].includes(d.target)) throw new Error('Invalid destination.');
      if (d.target === 'consultation') id(d.appointmentId);
      return { target: d.target, ...(d.appointmentId ? { appointmentId: d.appointmentId } : {}) };
    },
  };
}
