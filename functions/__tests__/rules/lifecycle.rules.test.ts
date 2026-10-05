import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { createAvailabilityStore } from '../../src/scheduling/availabilityStore';
import { createAvailabilityHandlers } from '../../src/scheduling/availabilityHandlers';
import { createBookingHandler } from '../../src/scheduling/bookingHandler';
import { createLifecycleHandlers } from '../../src/scheduling/lifecycleHandlers';
import { fromMilliseconds as ts } from '../../src/scheduling/primitives';
import { bookingLockId } from '../../src/scheduling/ids';
import { approvedDocuments, day, identity, input, now, start } from '../availabilityFixtures';

let env: RulesTestEnvironment, admin: Firestore, id: string;
const uuid = '12345678-1234-4234-8234-123456789abc';
const bookRequest = (uid = 'patient') => ({ auth: { uid }, data: { doctorId: 'doctor', startAt: start, bookingRequestId: uuid } });
function encode(value: any): any {
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    if (Object.keys(value).sort().join(',') === 'nanoseconds,seconds') return new Timestamp(value.seconds, value.nanoseconds);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
  }
  return value;
}
const deps = (clock = now + 1000) => ({ ...createAvailabilityStore(admin), now: () => ts(clock) });
const lifecycle = (clock = now + 1000) => createLifecycleHandlers(deps(clock));
const cancel = (uid = 'patient', reason?: string) => ({ auth: { uid }, data: { appointmentId: id, ...(reason === undefined ? {} : { reason }) } });
const outcome = (status = 'completed') => ({ auth: { uid: 'doctor' }, data: { appointmentId: id, outcome: status } });
const discover = (clock = now + 1000) => createAvailabilityHandlers(deps(clock)).discover({ auth: { uid: 'patient2' }, data: { doctorId: 'doctor', fromDate: day, days: 1 } });
const read = async () => (await admin.doc('appointments/' + id).get()).data()!;
const locks = async () => (await admin.collection('bookingLocks').get()).docs.map(doc => ({ id: doc.id, ...doc.data() }));
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Requires local demo emulator.');
  env = await initializeTestEnvironment({ projectId: 'demo-calladoc-rules', firestore: { host: '127.0.0.1', port: 8085,
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  admin = new Firestore({ projectId: 'demo-calladoc-rules', host: '127.0.0.1:8085', ssl: false });
});
beforeEach(async () => {
  await env.clearFirestore(); const documents = approvedDocuments(); documents['users/patient2'] = identity('patient2', 'patient');
  const batch = admin.batch();
  for (const [path, value] of Object.entries(documents)) batch.set(admin.doc(path), encode(value));
  await batch.commit();
  await createAvailabilityHandlers(deps(now)).replace({ auth: { uid: 'doctor' }, data: input() });
  id = (await createBookingHandler(deps(now))(bookRequest())).appointmentId;
});
afterAll(async () => { if (env) await env.cleanup(); if (admin) await admin.terminate(); });

test.each(['cancelled', 'completed', 'no_show'])('%s stores trusted terminal metadata and releases both locks', async status => {
  const clock = status === 'cancelled' ? now + 1000 : start + 1800000;
  const before = await read();
  const result = status === 'cancelled' ? await lifecycle(clock).cancel(cancel('patient', '  plans changed  ')) : await lifecycle(clock).outcome(outcome(status));
  expect(result).toEqual({ appointmentId: id, status, replayed: false }); const after = await read();
  expect(after.createdAt).toEqual(before.createdAt); expect(after.updatedAt).toEqual(Timestamp.fromMillis(clock));
  if (status === 'cancelled') {
    expect(after.cancellation).toEqual({ cancelledBy: 'patient', cancelledAt: Timestamp.fromMillis(clock), reason: 'plans changed' }); expect(after.outcome).toBeNull();
  } else {
    expect(after.outcome).toEqual({ recordedBy: 'doctor', recordedAt: Timestamp.fromMillis(clock) }); expect(after.cancellation).toBeNull();
  }
  expect(await locks()).toEqual([]); expect((await admin.collection('appointments').get()).size).toBe(1);
  const replay = status === 'cancelled' ? await lifecycle(clock + 86400000).cancel(cancel('patient', 'plans changed')) : await lifecycle(clock + 86400000).outcome(outcome(status));
  expect(replay.replayed).toBe(true); expect(await read()).toEqual(after); expect(await locks()).toEqual([]);
});
test('book -> hidden slot -> cancel -> rediscovery -> another patient rebooks -> stale retry preserves new locks', async () => {
  expect((await discover()).times.map(time => time.startAt)).toEqual([start + 1800000]);
  await lifecycle().cancel(cancel()); expect(await locks()).toEqual([]);
  expect((await discover()).times.map(time => time.startAt)).toEqual([start, start + 1800000]);
  const replacement = await createBookingHandler(deps())(bookRequest('patient2')); expect(replacement.appointmentId).not.toBe(id);
  const owned = await locks(); expect(owned).toHaveLength(2);
  expect(await lifecycle().cancel(cancel())).toMatchObject({ replayed: true }); expect(await locks()).toEqual(owned);
  expect((await read()).status).toBe('cancelled'); expect((await admin.collection('appointments').get()).size).toBe(2);
});
test('reserved coverage removal denied until cancellation, then removal succeeds', async () => {
  const replace = () => createAvailabilityHandlers(deps()).replace({ auth: { uid: 'doctor' }, data: { ...input(), windows: [], expectedRevision: 1 } });
  await expect(replace()).rejects.toMatchObject({ code: 'failed-precondition' });
  await lifecycle().cancel(cancel()); expect(await replace()).toMatchObject({ changed: true, revision: 2 });
  expect((await discover()).times).toEqual([]); expect((await read()).status).toBe('cancelled');
});
test.each(['completed', 'no_show'])('%s releases historical locks but cannot make past starts bookable', async status => {
  const clock = start + 1800000; await lifecycle(clock).outcome(outcome(status)); expect(await locks()).toEqual([]);
  expect((await discover(clock)).times).toEqual([]);
  await expect(createBookingHandler(deps(clock))(bookRequest('patient2'))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(await locks()).toEqual([]);
});
test('patient cancel versus doctor cancel establishes exactly one conflicting decision', async () => {
  const results = await Promise.allSettled([lifecycle().cancel(cancel()), lifecycle().cancel(cancel('doctor'))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('failed-precondition');
  expect((await read()).status).toBe('cancelled'); expect(await locks()).toEqual([]);
});
test('completion versus no-show establishes exactly one terminal outcome', async () => {
  const handler = lifecycle(start + 1800000);
  const results = await Promise.allSettled([handler.outcome(outcome()), handler.outcome(outcome('no_show'))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('failed-precondition'); expect(await locks()).toEqual([]);
  expect(['completed', 'no_show']).toContain((await read()).status);
});
test('simultaneous duplicate completion gives one transition and one replay', async () => {
  const handler = lifecycle(start + 1800000); const results = await Promise.all([handler.outcome(outcome()), handler.outcome(outcome())]);
  expect(results.map(r => r.replayed).sort()).toEqual([false, true]); expect(await locks()).toEqual([]);
  expect((await read()).updatedAt).toEqual(Timestamp.fromMillis(start + 1800000));
});
test.each([start - 1, start, start + 1800000])('cancel versus completion at %p respects disjoint timing windows', async clock => {
  const handler = lifecycle(clock); const results = await Promise.allSettled([handler.cancel(cancel()), handler.outcome(outcome())]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(clock === start ? 0 : 1);
  expect((await read()).status).toBe(clock === start ? 'scheduled' : clock < start ? 'cancelled' : 'completed');
  expect(await locks()).toHaveLength(clock === start ? 2 : 0);
});
test('cancellation versus competing booking cannot delete the replacement reservation', async () => {
  const [cancelled, competing] = await Promise.allSettled([lifecycle().cancel(cancel()), createBookingHandler(deps())(bookRequest('patient2'))]);
  expect(cancelled.status).toBe('fulfilled');
  if (competing.status === 'rejected') {
    expect(competing.reason.code).toBe('already-exists'); await createBookingHandler(deps())(bookRequest('patient2'));
  }
  const owned = await locks(); expect(owned).toHaveLength(2);
  expect(await lifecycle().cancel(cancel())).toMatchObject({ replayed: true }); expect(await locks()).toEqual(owned);
  expect((await admin.collection('appointments').get()).size).toBe(2);
});
test.each(['pending', 'rejected'])('active %s doctor remains authorized under 4B lifecycle policy', async verificationStatus => {
  await admin.doc('users/doctor').update({ verificationStatus }); await admin.doc('doctorPublicProfiles/doctor').delete();
  await expect(lifecycle().cancel(cancel('doctor'))).resolves.toMatchObject({ status: 'cancelled' });
});
test('rejected active doctor can record outcome without publication binding', async () => {
  await admin.doc('users/doctor').update({ verificationStatus: 'rejected' }); await admin.doc('doctorPublicProfiles/doctor').delete();
  await expect(lifecycle(start + 1800000).outcome(outcome())).resolves.toMatchObject({ status: 'completed' }); expect(await locks()).toEqual([]);
});
test.each(['missing-doctor', 'missing-patient', 'malformed-doctor', 'malformed-patient', 'foreign-reference', 'wrong-resource', 'wrong-time', 'companion-mismatch'])('corrupt %s leaves appointment and remaining locks untouched', async corruption => {
  const doctor = admin.doc('bookingLocks/' + bookingLockId('doctor', 'doctor', start));
  const patient = admin.doc('bookingLocks/' + bookingLockId('patient', 'patient', start));
  if (corruption === 'missing-doctor') await doctor.delete();
  if (corruption === 'missing-patient') await patient.delete();
  if (corruption === 'malformed-doctor') await doctor.update({ startAt: ts(start) });
  if (corruption === 'malformed-patient') await patient.update({ unexpected: true });
  if (corruption === 'foreign-reference') await doctor.update({ appointmentId: 'a'.repeat(64) });
  if (corruption === 'wrong-resource') await doctor.update({ resourceId: 'foreign' });
  if (corruption === 'wrong-time') await doctor.update({ startAt: Timestamp.fromMillis(start + 1800000), endAt: Timestamp.fromMillis(start + 3600000) });
  if (corruption === 'companion-mismatch') await patient.update({ appointmentId: 'b'.repeat(64) });
  const before = await read(), reservations = await locks();
  await expect(lifecycle().cancel(cancel())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(await read()).toEqual(before); expect(await locks()).toEqual(reservations);
});
test('failure after staging terminal write and deletions rolls back all changes', async () => {
  const store = deps(), before = await read(), reservations = await locks();
  const handler = createLifecycleHandlers({ ...store, transact: action => store.transact(async tx => {
    await action(tx); throw new Error('private failure');
  }) });
  await expect(handler.cancel(cancel())).rejects.toMatchObject({ code: 'internal', message: 'Appointment decision failed. Please retry later.' });
  expect(await read()).toEqual(before); expect(await locks()).toEqual(reservations);
});
test('transaction retry rereads canonical identity; disabling actor rolls back first attempt', async () => {
  const store = deps(); let attempts = 0;
  const handler = createLifecycleHandlers({ ...store, transact: action => store.transact(async tx => {
    attempts++;
    if (attempts === 2) await admin.doc('users/patient').update({ status: 'disabled' });
    const result = await action(tx);
    if (attempts === 1) { const error = new Error('contention') as Error & { code: number }; error.code = 10; throw error; }
    return result;
  }) });
  await expect(handler.cancel(cancel())).rejects.toMatchObject({ code: 'permission-denied' });
  expect(attempts).toBe(2); expect((await read()).status).toBe('scheduled'); expect(await locks()).toHaveLength(2);
});
