import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, assertFails, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { createAvailabilityStore } from '../../src/scheduling/availabilityStore';
import { createAvailabilityHandlers } from '../../src/scheduling/availabilityHandlers';
import { fromMilliseconds as ts } from '../../src/scheduling/primitives';
import { availabilityId } from '../../src/scheduling/ids';
import { approvedDocuments, day, identity, input, now, start } from '../availabilityFixtures';

let env: RulesTestEnvironment, admin: Firestore;
function encode(value: any): any {
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    if (Object.keys(value).sort().join(',') === 'nanoseconds,seconds') return new Timestamp(value.seconds, value.nanoseconds);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
  }
  return value;
}
const id = availabilityId('doctor', day), path = 'doctorAvailability/' + id;
const mutation = (data: unknown = input()) => ({ auth: { uid: 'doctor' }, data });
function backend(clock = now) { return createAvailabilityHandlers({ ...createAvailabilityStore(admin), now: () => ts(clock) }); }
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Requires local demo emulator.');
  env = await initializeTestEnvironment({ projectId: 'demo-calladoc-rules', firestore: { host: '127.0.0.1', port: 8085,
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  admin = new Firestore({ projectId: 'demo-calladoc-rules', host: '127.0.0.1:8085', ssl: false });
});
beforeEach(async () => {
  await env.clearFirestore();
  const batch = admin.batch();
  for (const [key, value] of Object.entries(approvedDocuments())) batch.set(admin.doc(key), encode(value));
  batch.set(admin.doc('availabilitySlots/legacy'), { doctorId: 'doctor', isBooked: false });
  await batch.commit();
});
afterAll(async () => { if (env) await env.cleanup(); if (admin) await admin.terminate(); });

test.each(['doctor', 'patient', 'administrator', 'admin', 'guest', 'claim-only', 'disabled', 'pending', 'other-doctor'])('raw and legacy paths deny every operation for %s', async actor => {
  await backend().replace(mutation());
  if (actor === 'administrator' || actor === 'admin') await admin.doc('users/' + actor).set(identity(actor, actor));
  if (actor === 'disabled' || actor === 'pending') await admin.doc('users/' + actor).set(identity(actor, 'doctor', actor === 'disabled' ? { status: 'disabled' } : { verificationStatus: 'pending' }));
  if (actor === 'other-doctor') await admin.doc('users/' + actor).set(identity(actor));
  const client = actor === 'guest' ? env.unauthenticatedContext().firestore() : env.authenticatedContext(actor, { role: 'administrator', verificationStatus: 'approved' }).firestore();
  for (const [name, recordId] of [['doctorAvailability', id], ['availabilitySlots', 'legacy']]) {
    const ref = doc(client, name, recordId);
    await assertFails(getDoc(ref)); await assertFails(getDocs(collection(client, name)));
    await assertFails(setDoc(doc(client, name, 'new'), { doctorId: actor }));
    await assertFails(updateDoc(ref, { revision: 999 })); await assertFails(deleteDoc(ref));
  }
});

test('real store persists Timestamp windows/audits; no-op preserves bytes and discovery sanitizes', async () => {
  const handler = backend(); expect(await handler.replace(mutation())).toEqual({ availabilityId: id, revision: 1, changed: true });
  const before = (await admin.doc(path).get()).data()!;
  expect(before.createdAt).toBeInstanceOf(Timestamp); expect(before.updatedAt).toBeInstanceOf(Timestamp);
  expect(before.windows[0].startAt).toBeInstanceOf(Timestamp); expect(before.windows[0].endAt).toBeInstanceOf(Timestamp);
  expect(await backend(now + 1).replace(mutation({ ...input(), expectedRevision: 1 }))).toMatchObject({ changed: false, revision: 1 });
  expect((await admin.doc(path).get()).data()).toEqual(before);
  const response = await handler.discover({ auth: { uid: 'patient' }, data: { doctorId: 'doctor', fromDate: day, days: 1 } });
  expect(response.times).toHaveLength(2);
  expect(Object.keys(response.times[0]).sort()).toEqual(['availabilityId', 'availabilityRevision', 'doctorId', 'endAt', 'startAt']);
  expect(typeof response.times[0].startAt).toBe('number');
  expect((await admin.collection('availabilitySlots').get()).size).toBe(1);
  expect((await admin.collection('bookingLocks').get()).empty).toBe(true);
  expect((await admin.collection('appointments').get()).empty).toBe(true);
});

test('real create/create collision has exactly one winner and revision 1', async () => {
  const results = await Promise.allSettled([backend().replace(mutation()), backend().replace(mutation())]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const failure = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
  expect(failure.reason.code).toBe('failed-precondition');
  expect((await admin.doc(path).get()).data()?.revision).toBe(1);
});
test('real conflicting replacements from one revision have exactly one winner', async () => {
  await backend().replace(mutation());
  const results = await Promise.allSettled([[], [{ startAt: start, endAt: start + 1800000 }]].map(windows =>
    backend(now + 1).replace(mutation({ ...input(), expectedRevision: 1, windows }))));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('failed-precondition');
  expect((await admin.doc(path).get()).data()?.revision).toBe(2);
});
test('concurrent identical no-ops retain revision; stale prior revision fails', async () => {
  await backend().replace(mutation());
  const results = await Promise.all([1, 2].map(() => backend().replace(mutation({ ...input(), expectedRevision: 1 }))));
  expect(results.map(r => r.changed)).toEqual([false, false]);
  await expect(backend().replace(mutation())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect((await admin.doc(path).get()).data()?.revision).toBe(1);
});
test('real started window remains unchanged while future window is added', async () => {
  await backend().replace(mutation()); const before = (await admin.doc(path).get()).data()!;
  const windows = [...input().windows, { startAt: start + 7200000, endAt: start + 9000000 }];
  await backend(start).replace(mutation({ ...input(), expectedRevision: 1, windows }));
  const after = (await admin.doc(path).get()).data()!;
  expect(after.windows[0]).toEqual(before.windows[0]); expect(after.createdAt).toEqual(before.createdAt); expect(after.revision).toBe(2);
  await expect(backend(start + 3600000).replace(mutation({ ...input(), expectedRevision: 2, windows: [windows[1]] }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect((await admin.doc(path).get()).data()).toEqual(after);
});
test.each(['createdAt', 'window'])('persisted structural timestamp map %s fails closed', async field => {
  await backend().replace(mutation());
  await admin.doc(path).update(field === 'createdAt' ? { createdAt: ts(now) } : { windows: [{ startAt: ts(start), endAt: Timestamp.fromMillis(start + 1800000) }] });
  await expect(backend().replace(mutation({ ...input(), expectedRevision: 1 }))).rejects.toMatchObject({ code: 'failed-precondition' });
});
test('authorization is re-read on transaction retry after canonical status changes', async () => {
  const store = createAvailabilityStore(admin); let attempts = 0;
  const wrapped = createAvailabilityHandlers({ ...store, now: () => ts(now), transact: action => store.transact(async tx => {
    attempts++;
    // The failed attempt releases its locks before the next attempt starts.
    if (attempts === 2) await admin.doc('users/doctor').update({ status: 'disabled' });
    const result = await action(tx);
    if (attempts === 1) {
      // Inject gRPC ABORTED after staging the write; Firestore must roll it back.
      const error = new Error('contention') as Error & { code: number }; error.code = 10; throw error;
    }
    return result;
  }) });
  await expect(wrapped.replace(mutation())).rejects.toMatchObject({ code: 'permission-denied' });
  expect(attempts).toBe(2);
  expect((await admin.doc(path).get()).exists).toBe(false);
});
