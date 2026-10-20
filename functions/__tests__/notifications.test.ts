import { Timestamp } from 'firebase-admin/firestore';
import { createNotificationHandlers } from '../src/notifications/handlers';
import { writeEvent, notificationId } from '../src/notifications/events';
import { identity, documents, terminal, id, start, end } from './consultationFixtures';
import { createAvailabilityStore } from '../src/scheduling/availabilityStore';
import { createMessageStore } from '../src/consultations/messageStore';
import { createPrescriptionStore } from '../src/prescriptions/store';
import { createVerificationStore } from '../src/profiles/verificationStore';
import { fromMilliseconds as t } from '../src/scheduling/primitives';
function encode(v: any): any {
  if (v && typeof v === 'object' && Object.keys(v).sort().join() === 'nanoseconds,seconds') return new Timestamp(v.seconds, v.nanoseconds);
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}
function fixture() {
  const data: Record<string, any> = encode(documents());
  data['users/other'] = identity('other', 'patient'); data['users/admin'] = identity('admin', 'administrator');
  let abort = false;
  function collection(path: string): any {
    const q: any = { path, filters: [] as any[], orders: [] as any[], max: 100, after: null,
      doc: (key: string) => ({ path: path + '/' + key, id: key, collection: (c: string) => collection(path + '/' + key + '/' + c) }),
      where: (field: string, op: string, value: any) => { q.filters.push([field, op, value]); return q; },
      orderBy: (field: any, dir = 'asc') => { q.orders.push([typeof field === 'string' ? field : '__name__', dir]); return q; },
      limit: (n: number) => { q.max = n; return q; }, startAfter: (d: any) => { q.after = d; return q; } };
    return q;
  }
  function snap(path: string) { return { id: path.split('/').pop(), exists: !!data[path], data: () => data[path] }; }
  const db: any = { collection, runTransaction: async (action: any) => {
    const writes: (() => void)[] = []; let writing = false;
    const tx: any = {
      get: async (ref: any) => {
        if (writing) throw Error('read after write');
        if (ref.id) return snap(ref.path);
        let paths = Object.keys(data).filter(p => p.startsWith(ref.path + '/') && !p.slice(ref.path.length + 1).includes('/'));
        const numeric = (v: any) => v instanceof Timestamp ? v.toMillis() : v;
        paths = paths.filter(p => ref.filters.every(([key, op, value]: any[]) =>
          op === '==' ? data[p][key] === value : op === '>=' ? numeric(data[p][key]) >= numeric(value) : numeric(data[p][key]) <= numeric(value)));
        paths.sort((a, b) => {
          for (const [key, dir] of ref.orders) { const x = key === '__name__' ? a : numeric(data[a][key]), y = key === '__name__' ? b : numeric(data[b][key]);
            if (x !== y) return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1); }
          return 0;
        });
        if (ref.after) paths = paths.slice(paths.findIndex(p => p.endsWith('/' + ref.after.id)) + 1);
        const docs = paths.slice(0, ref.max).map(snap); return { docs, size: docs.length };
      },
      create: (ref: any, value: any) => { writing = true; if (data[ref.path]) throw Error('duplicate'); writes.push(() => { data[ref.path] = value; }); },
      set: (ref: any, value: any) => { writing = true; writes.push(() => { data[ref.path] = value; }); },
      update: (ref: any, value: any) => { writing = true; writes.push(() => { data[ref.path] = { ...data[ref.path], ...value }; }); },
      delete: (ref: any) => { writing = true; writes.push(() => { delete data[ref.path]; }); },
    };
    const result = await action(tx); if (abort) throw Error('simulated rollback'); writes.forEach(w => w()); return result;
  }};
  return { data, db, h: createNotificationHandlers(db), abort: () => { abort = true; } };
}
const req = (uid = 'patient', data: any = {}) => ({ auth: { uid }, data });
async function event(f: ReturnType<typeof fixture>, kind: any = 'booking', source = id, uid = 'patient') {
  await f.db.runTransaction((tx: any) => writeEvent(f.db, tx, uid, kind, source, kind.startsWith('verification_') ? null : id, t(Date.now())));
  return notificationId(kind, source, uid);
}
test('bounded private inbox, read retry and ownership recheck', async () => {
  const f = fixture(), key = await event(f);
  expect(await f.h.list(req())).toMatchObject({ items: [{ id: key, kind: 'booking', read: false }], nextCursor: null });
  expect(await f.h.read(req('patient', { id: key }))).toEqual({ read: true });
  expect(await f.h.read(req('patient', { id: key }))).toEqual({ read: true });
  expect(await f.h.open(req('patient', { id: key }))).toEqual({ target: 'appointments', appointmentId: id });
  f.data['appointments/' + id].patientId = 'other';
  await expect(f.h.open(req('patient', { id: key }))).rejects.toMatchObject({ code: 'permission-denied' });
});
test('guest, disabled, claim-only and administrator denied; foreign inbox inaccessible', async () => {
  const f = fixture(), key = await event(f);
  await expect(f.h.list({ data: {} })).rejects.toMatchObject({ code: 'unauthenticated' });
  for (const uid of ['admin', 'missing']) await expect(f.h.list(req(uid))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(f.h.read(req('other', { id: key }))).rejects.toMatchObject({ code: 'permission-denied' });
  f.data['users/patient'].status = 'disabled'; await expect(f.h.list(req())).rejects.toMatchObject({ code: 'permission-denied' });
});
test('pagination is bounded and unknown fields/foreign cursors fail', async () => {
  const f = fixture(); await event(f); await event(f, 'message', 'b'.repeat(64));
  const first: any = await f.h.list(req('patient', { limit: 1 })); expect(first.items).toHaveLength(1);
  const second: any = await f.h.list(req('patient', { limit: 1, after: first.nextCursor })); expect(second.items[0].id).not.toBe(first.items[0].id);
  for (const data of [{ limit: 51 }, { limit: 0 }, { uid: 'other' }, { after: 'c'.repeat(64) }])
    await expect(f.h.list(req('patient', data))).rejects.toMatchObject({ code: 'invalid-argument' });
});
test('token binding cannot be stolen, revoked by another user, or leaked through inbox', async () => {
  const f = fixture(), token = 'synthetic-fcm-token-123456789';
  expect(await f.h.device(req('patient', { token, enabled: true }))).toEqual({ registered: true, deliveryEnabled: false });
  await expect(f.h.device(req('other', { token, enabled: true }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await f.h.device(req('other', { token, enabled: false }));
  expect(Object.keys(f.data).filter(p => p.startsWith('notificationDevices/'))).toHaveLength(1);
  expect(JSON.stringify(await f.h.list(req()))).not.toContain(token);
  await f.h.device(req('patient', { token, enabled: false })); await f.h.device(req('patient', { token, enabled: false }));
  expect(Object.keys(f.data).filter(p => p.startsWith('notificationDevices/'))).toHaveLength(0);
  await expect(f.h.device(req('patient', { token: 'ExpoPushToken[synthetic]', enabled: true }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
test('booking and cancellation writers create generic events for both authoritative participants', async () => {
  const f = fixture(), a = documents()['appointments/' + id]; delete f.data['appointments/' + id];
  await createAvailabilityStore(f.db).transact(async tx => tx.createAppointment(a));
  for (const uid of ['patient', 'doctor']) expect(f.data[`notificationInboxes/${uid}/items/${notificationId('booking', id, uid)}`]).toMatchObject({ kind: 'booking' });
  const terminalDocs = documents(); terminal(terminalDocs, 'cancelled');
  await createAvailabilityStore(f.db).transact(async tx => tx.saveTerminalAppointment(terminalDocs['appointments/' + id]));
  expect(JSON.stringify(f.data['notificationInboxes/patient/items/' + notificationId('cancellation', id, 'patient')])).not.toContain('reason');
});
test('source transaction failure leaves no inbox event', async () => {
  const f = fixture(); f.abort(); await expect(event(f)).rejects.toThrow();
  expect(Object.keys(f.data).filter(p => p.startsWith('notificationInboxes/'))).toHaveLength(0);
});
test('prescription and verification writers omit clinical and rejection content', async () => {
  const f = fixture();
  await createPrescriptionStore(f.db).transact(async tx => tx.createPrescription({ prescriptionId: id, consultationId: id, appointmentId: id,
    patientId: 'patient', doctorId: 'doctor', issuedBy: 'doctor', issuedAt: t(end), schemaVersion: 1,
    requestId: '12345678-1234-4234-8234-123456789abc', medications: [{ name: 'private', dosage: 'private', frequency: 'private', duration: 'private', instructions: 'private' }] }));
  await createVerificationStore(f.db, {} as any).transact(async tx => tx.saveRequest({ requestId: 'verification-test', doctorUid: 'doctor',
    state: 'rejected', reviewedAt: t(end), rejectionReason: 'private' } as any));
  for (const p of Object.keys(f.data).filter(p => p.startsWith('notificationInboxes/'))) expect(JSON.stringify(f.data[p])).not.toContain('private');
});
test('message event targets counterpart and never includes text', async () => {
  const f = fixture(); f.data['consultations/' + id] = encode({ consultationId: id, appointmentId: id, patientId: 'patient', doctorId: 'doctor',
    appointmentStartAt: t(start), appointmentEndAt: t(end), createdAt: t(start), closedAt: null, state: 'active', schemaVersion: 1 });
  await createMessageStore(f.db).transact(async tx => {
    await tx.consultation(id); tx.createMessage(id, { messageId: 'b'.repeat(64), senderId: 'patient', type: 'text', text: 'private message', createdAt: t(start), schemaVersion: 1 });
  });
  const rows = Object.keys(f.data).filter(p => p.startsWith('notificationInboxes/')); expect(rows).toHaveLength(1);
  expect(rows[0]).toContain('/doctor/'); expect(JSON.stringify(f.data[rows[0]])).not.toContain('private message');
});
test('refresh reminders deduplicate and require upcoming scheduled appointment', async () => {
  const f = fixture(); const a = f.data['appointments/' + id];
  const startAt = Math.ceil((Date.now() + 600000) / 1800000) * 1800000;
  a.startAt = Timestamp.fromMillis(startAt); a.endAt = Timestamp.fromMillis(startAt + 1800000);
  // Appointment validation derives availability ID from start day.
  a.availabilityId = require('../src/scheduling/ids').availabilityId('doctor', new Date(startAt).toISOString().slice(0, 10));
  await f.h.list(req()); await f.h.list(req());
  expect(Object.keys(f.data).filter(p => p.startsWith('notificationInboxes/'))).toHaveLength(1);
});
