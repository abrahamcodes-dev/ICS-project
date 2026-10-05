import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { createAvailabilityStore } from '../../src/scheduling/availabilityStore';
import { createAvailabilityHandlers } from '../../src/scheduling/availabilityHandlers';
import { createBookingHandler } from '../../src/scheduling/bookingHandler';
import { availabilityId, bookingLockId } from '../../src/scheduling/ids';
import { fromMilliseconds as ts } from '../../src/scheduling/primitives';
import { fitsAvailability } from '../../src/scheduling/intervals';
import { planAppointmentTransition, scheduledLocks } from '../../src/scheduling/policy';
import { approvedDocuments, day, identity, input, now, start } from '../availabilityFixtures';

let env: RulesTestEnvironment, admin: Firestore;
const uuid = '12345678-1234-4234-8234-123456789abc';
const data = (doctorId = 'doctor', bookingRequestId = uuid, startAt = start) => ({ doctorId, bookingRequestId, startAt });
const booking = (uid = 'patient', doctorId = 'doctor', key = uuid, startAt = start) => ({ auth: { uid }, data: data(doctorId, key, startAt) });
const availabilityKey = availabilityId('doctor', day);
function encode(value: any): any {
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    if (Object.keys(value).sort().join(',') === 'nanoseconds,seconds') return new Timestamp(value.seconds, value.nanoseconds);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
  }
  return value;
}
function dependencies() { return { ...createAvailabilityStore(admin), now: () => ts(now) }; }
const book = () => createBookingHandler(dependencies());
const availability = () => createAvailabilityHandlers(dependencies());
const replace = (windows: { startAt: number; endAt: number }[], revision = 1) =>
  availability().replace({ auth: { uid: 'doctor' }, data: { ...input(), windows, expectedRevision: revision } });
async function counts(appointments: number, locks: number) {
  expect((await admin.collection('appointments').get()).size).toBe(appointments);
  expect((await admin.collection('bookingLocks').get()).size).toBe(locks);
}
async function consistent() {
  const store = dependencies();
  await store.transact(async tx => {
    for (const doc of (await admin.collection('appointments').get()).docs) {
      const appointment = (await tx.appointment(doc.id))!;
      if (appointment.status !== 'scheduled') continue;
      const available = (await tx.availability(appointment.availabilityId))!;
      expect(fitsAvailability({ startAt: appointment.startAt, endAt: appointment.endAt }, available.windows, available.utcDate)).toBe(true);
      for (const entry of scheduledLocks(appointment)) expect(await tx.lock(entry.lockId)).toEqual(entry.lock);
    }
  });
}
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Requires local demo emulator.');
  env = await initializeTestEnvironment({ projectId: 'demo-calladoc-rules', firestore: { host: '127.0.0.1', port: 8085,
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  admin = new Firestore({ projectId: 'demo-calladoc-rules', host: '127.0.0.1:8085', ssl: false });
});
beforeEach(async () => {
  await env.clearFirestore();
  const docs = approvedDocuments();
  docs['users/patient2'] = identity('patient2', 'patient');
  docs['users/doctor2'] = identity('doctor2');
  docs['doctorProfiles/doctor2'] = { ...docs['doctorProfiles/doctor'], uid: 'doctor2', approvedRequestId: 'approved2' };
  docs['doctorPublicProfiles/doctor2'] = { ...docs['doctorPublicProfiles/doctor'], uid: 'doctor2', approvedRequestId: 'approved2' };
  docs['verificationRequests/approved2'] = { ...docs['verificationRequests/approved'], requestId: 'approved2', doctorUid: 'doctor2' };
  const batch = admin.batch();
  for (const [path, value] of Object.entries(docs)) batch.set(admin.doc(path), encode(value));
  await batch.commit();
  for (const uid of ['doctor', 'doctor2']) await availability().replace({ auth: { uid }, data: input() });
});
afterAll(async () => { if (env) await env.cleanup(); if (admin) await admin.terminate(); });

test('persisted appointment and reservations have exact schema and real Timestamps', async () => {
  const response = await book()(booking());
  const value = (await admin.doc('appointments/' + response.appointmentId).get()).data()!;
  expect(Object.keys(value).sort()).toEqual(['appointmentId', 'patientId', 'doctorId', 'availabilityId', 'availabilityRevision', 'startAt', 'endAt',
    'doctorDisplay', 'status', 'cancellation', 'outcome', 'schemaVersion', 'createdAt', 'updatedAt'].sort());
  for (const field of ['startAt', 'endAt', 'createdAt', 'updatedAt']) expect(value[field]).toBeInstanceOf(Timestamp);
  expect(value.endAt.toMillis() - value.startAt.toMillis()).toBe(1800000);
  expect(value.doctorDisplay).toEqual({ professionalName: 'Doctor Name', specialty: 'Medicine' });
  for (const snapshot of (await admin.collection('bookingLocks').get()).docs) {
    const lock = snapshot.data();
    expect(Object.keys(lock).sort()).toEqual(['resourceType', 'resourceId', 'appointmentId', 'startAt', 'endAt', 'schemaVersion', 'createdAt'].sort());
    for (const field of ['startAt', 'endAt', 'createdAt']) expect(lock[field]).toBeInstanceOf(Timestamp);
  }
  await counts(1, 2); await consistent();
});
test.each(['patient', 'patient2', 'doctor', 'doctor2', 'administrator', 'admin', 'guest', 'claim-only'])('appointment gets are participant-only; writes, unbounded lists and locks denied for %s', async actor => {
  const result = await book()(booking());
  if (actor === 'administrator' || actor === 'admin') await admin.doc('users/' + actor).set(identity(actor, actor));
  const client = actor === 'guest' ? env.unauthenticatedContext().firestore() : env.authenticatedContext(actor, { role: 'administrator' }).firestore();
  for (const [name, key] of [['appointments', result.appointmentId], ['bookingLocks', bookingLockId('doctor', 'doctor', start)]]) {
    const ref = doc(client, name, key);
    if (name === 'appointments' && ['patient', 'doctor'].includes(actor)) await assertSucceeds(getDoc(ref));
    else await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(client, name)));
    await assertFails(setDoc(doc(client, name, 'new'), { patientId: actor }));
    await assertFails(updateDoc(ref, { status: 'cancelled' })); await assertFails(deleteDoc(ref));
  }
});
test('doctor conflict: two patients, exactly one atomic booking', async () => {
  const results = await Promise.allSettled([book()(booking()), book()(booking('patient2'))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'already-exists', message: 'Scheduling conflict. Choose another time.' });
  await counts(1, 2); await consistent();
});
test('patient conflict: two doctors, exactly one atomic booking', async () => {
  const results = await Promise.allSettled([book()(booking()), book()(booking('patient', 'doctor2', uuid.replace('12345678', '22345678')))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('already-exists');
  await counts(1, 2); await consistent();
});
test('simultaneous same UUID retries create once and replay once', async () => {
  const results = await Promise.all([book()(booking()), book()(booking())]);
  expect(results.map(r => r.replayed).sort()).toEqual([false, true]);
  expect(results[0].appointmentId).toBe(results[1].appointmentId); await counts(1, 2); await consistent();
});
test.each([0, 1, 2])('booking versus availability removal race %i preserves coverage', async iteration => {
  const actions = iteration % 2 ? [() => replace([]), () => book()(booking())] : [() => book()(booking()), () => replace([])];
  const results = await Promise.allSettled(actions.map(action => action()));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('failed-precondition');
  const appointments = (await admin.collection('appointments').get()).size;
  const windows = (await admin.doc('doctorAvailability/' + availabilityKey).get()).data()!.windows;
  if (appointments) { expect(windows).toHaveLength(1); await counts(1, 2); }
  else { expect(windows).toEqual([]); await counts(0, 0); }
  await consistent();
});
test('coverage-preserving update succeeds; empty/removing replacements fail without revision changes', async () => {
  await book()(booking());
  await expect(replace([{ startAt: start, endAt: start + 1800000 }])).resolves.toMatchObject({ revision: 2 });
  await expect(replace([], 2)).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(replace([{ startAt: start + 1800000, endAt: start + 3600000 }], 2)).rejects.toMatchObject({ code: 'failed-precondition' });
  expect((await admin.doc('doctorAvailability/' + availabilityKey).get()).data()?.revision).toBe(2); await consistent();
});
test('occupied discovery is sanitized and stale response cannot authorize booking', async () => {
  const discover = () => availability().discover({ auth: { uid: 'patient2' }, data: { doctorId: 'doctor', fromDate: day, days: 1 } });
  expect((await discover()).times.map(t => t.startAt)).toEqual([start, start + 1800000]);
  await book()(booking());
  expect((await discover()).times).toEqual([{ doctorId: 'doctor', startAt: start + 1800000, endAt: start + 3600000, availabilityId: availabilityKey, availabilityRevision: 1 }]);
  await expect(book()(booking('patient2'))).rejects.toMatchObject({ code: 'already-exists' }); await counts(1, 2);
});
test.each(['cancelled', 'completed', 'no_show'] as const)('seeded terminal %s replay does not recreate reservations', async status => {
  const result = await book()(booking()), store = dependencies();
  const original = (await store.transact(tx => tx.appointment(result.appointmentId)))!;
  const entries = scheduledLocks(original), at = status === 'cancelled' ? start - 1 : start + 1800000;
  // Admin fixture only: 4D exports no lifecycle persistence.
  const terminal = planAppointmentTransition(original, { uid: 'doctor', role: 'doctor' }, { status }, ts(at), entries.map(e => e.lock)).appointment;
  const batch = admin.batch(); batch.set(admin.doc('appointments/' + result.appointmentId), encode(terminal));
  for (const entry of entries) batch.delete(admin.doc('bookingLocks/' + entry.lockId));
  await batch.commit();
  expect(await book()(booking())).toEqual({ ...result, status, replayed: true }); await counts(1, 0);
});
test('ABORTED transaction retries once with no duplicate creates', async () => {
  const store = dependencies(); let attempts = 0;
  const handler = createBookingHandler({ ...store, transact: action => store.transact(async tx => {
    attempts++; const result = await action(tx);
    if (attempts === 1) { const error = new Error('injected contention') as Error & { code: number }; error.code = 10; throw error; }
    return result;
  }) });
  expect((await handler(booking())).replayed).toBe(false); expect(attempts).toBe(2); await counts(1, 2); await consistent();
});
test('failure after staged writes rolls back all three documents', async () => {
  const store = dependencies();
  const handler = createBookingHandler({ ...store, transact: action => store.transact(async tx => {
    await action(tx); throw new Error('private internal failure');
  }) });
  await expect(handler(booking())).rejects.toMatchObject({ code: 'internal', message: 'Booking failed. Please retry later.' }); await counts(0, 0);
});
test.each(['structural-time', 'missing-appointment', 'foreign-patient-lock'])('real corrupt reservation %s fails closed', async corruption => {
  const result = await book()(booking());
  if (corruption === 'structural-time') await admin.doc('bookingLocks/' + bookingLockId('doctor', 'doctor', start)).update({ startAt: ts(start) });
  if (corruption === 'missing-appointment') await admin.doc('appointments/' + result.appointmentId).delete();
  if (corruption === 'foreign-patient-lock') await admin.doc('bookingLocks/' + bookingLockId('patient', 'patient', start)).update({ appointmentId: 'a'.repeat(64) });
  await expect(replace(input().windows)).rejects.toMatchObject({ code: 'failed-precondition' });
  expect((await admin.doc('doctorAvailability/' + availabilityKey).get()).data()?.revision).toBe(1);
});
