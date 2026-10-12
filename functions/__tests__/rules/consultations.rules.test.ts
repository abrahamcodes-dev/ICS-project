import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { createConsultationStore } from '../../src/consultations/consultationStore';
import { createOpenConsultationHandler } from '../../src/consultations/openHandler';
import { documents, request, terminal, start, end, deadline, id, path } from '../consultationFixtures';
import { fromMilliseconds as t } from '../../src/scheduling/primitives';
let env: RulesTestEnvironment, db: Firestore;
function encode(value: any): any {
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    if (Object.keys(value).sort().join(',') === 'nanoseconds,seconds') return new Timestamp(value.seconds, value.nanoseconds);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  }
  return value;
}
const backend = (clock = start) => createOpenConsultationHandler({ ...createConsultationStore(db), now: () => t(clock) });
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Requires local demo emulator');
  env = await initializeTestEnvironment({ projectId: 'demo-calladoc-rules', firestore: { host: '127.0.0.1', port: 8085,
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  db = new Firestore({ projectId: 'demo-calladoc-rules', host: '127.0.0.1:8085', ssl: false });
});
beforeEach(async () => {
  await env.clearFirestore(); const batch = db.batch();
  for (const [key, value] of Object.entries(documents())) batch.set(db.doc(key), encode(value));
  await batch.commit();
});
afterAll(async () => { if (env) await env.cleanup(); if (db) await db.terminate(); });
test('real persistence exact schema/Timestamps, retry unchanged, C4 untouched', async () => {
  const before = (await db.doc('appointments/' + id).get()).data();
  const first = await backend()(request()); const stored = (await db.doc(path).get()).data()!;
  expect(Object.keys(stored).sort()).toEqual(['consultationId', 'appointmentId', 'patientId', 'doctorId', 'appointmentStartAt', 'appointmentEndAt', 'state', 'createdAt', 'closedAt', 'schemaVersion'].sort());
  for (const key of ['appointmentStartAt', 'appointmentEndAt', 'createdAt']) expect(stored[key]).toBeInstanceOf(Timestamp);
  expect(await backend(start + 1)(request('doctor'))).toEqual(first);
  expect((await db.doc(path).get()).data()).toEqual(stored);
  expect((await db.doc('appointments/' + id).get()).data()).toEqual(before);
  for (const name of ['bookingLocks', 'doctorAvailability', 'messages']) expect((await db.collection(name).get()).empty).toBe(true);
});
test('simultaneous patient/doctor opens read absence and converge on one document', async () => {
  const store = createConsultationStore(db); let observations = 0; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const handler = createOpenConsultationHandler({ ...store, now: () => t(start), transact: action => store.transact(tx => action({ ...tx,
    consultation: async key => {
      const found = await tx.consultation(key);
      if (!found && observations < 2) { observations++; if (observations === 2) release(); await gate; }
      return found;
    },
  })) });
  const results = await Promise.all([handler(request()), handler(request('doctor'))]);
  expect(observations).toBe(2); expect(results[0]).toEqual(results[1]);
  expect((await db.collection('consultations').get()).docs.map(d => d.id)).toEqual([id]);
});
test('transaction retry refreshes time and rolls back first staged creation', async () => {
  const store = createConsultationStore(db); let attempts = 0, clocks = 0;
  const handler = createOpenConsultationHandler({ ...store, now: () => { clocks++; return t(attempts === 1 ? start : deadline); },
    transact: action => store.transact(async tx => {
      attempts++; const result = await action(tx);
      if (attempts === 1) throw Object.assign(new Error('retry'), { code: 10 });
      return result;
    }) });
  await expect(handler(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(attempts).toBeGreaterThanOrEqual(2); expect(clocks).toBeGreaterThanOrEqual(2);
  expect((await db.doc(path).get()).exists).toBe(false);
});
test('transaction retry rereads disabled identity', async () => {
  const store = createConsultationStore(db); let attempts = 0;
  const handler = createOpenConsultationHandler({ ...store, now: () => t(start), transact: action => store.transact(async tx => {
    attempts++; if (attempts === 2) await db.doc('users/doctor').update({ status: 'disabled' });
    const result = await action(tx); if (attempts === 1) throw Object.assign(new Error('retry'), { code: 10 }); return result;
  }) });
  await expect(handler(request())).rejects.toMatchObject({ code: 'permission-denied' });
  expect(attempts).toBeGreaterThanOrEqual(2); expect((await db.doc(path).get()).exists).toBe(false);
});
test('failure after staging create rolls back without partial room', async () => {
  const store = createConsultationStore(db);
  const handler = createOpenConsultationHandler({ ...store, now: () => t(start), transact: action => store.transact(async tx => {
    await action(tx); throw new Error('synthetic failure');
  }) });
  await expect(handler(request())).rejects.toMatchObject({ code: 'internal' }); expect((await db.doc(path).get()).exists).toBe(false);
});
test('expiry reconciliation uses Timestamp and preserves every immutable field', async () => {
  await backend()(request()); const before = (await db.doc(path).get()).data()!;
  const result = await backend(deadline + 1)(request());
  expect(result).toMatchObject({ state: 'closed', closedAt: deadline, canSend: false });
  expect((await db.doc(path).get()).data()).toEqual({ ...before, state: 'closed', closedAt: Timestamp.fromMillis(deadline) });
  expect(await backend(deadline + 10)(request('doctor'))).toEqual(result);
});
test('terminal decision before expiry determines closure; disabled counterpart retains history', async () => {
  await backend()(request()); const data = documents(); terminal(data, 'completed', end + 1);
  await db.doc('appointments/' + id).set(encode(data['appointments/' + id]));
  await db.doc('users/doctor').update({ status: 'disabled' });
  expect(await backend(deadline + 1)(request())).toMatchObject({ state: 'closed', closedAt: end + 1, canSend: false });
});
test('failed closure transaction leaves prior active room unchanged', async () => {
  await backend()(request()); const before = (await db.doc(path).get()).data(); const store = createConsultationStore(db);
  const handler = createOpenConsultationHandler({ ...store, now: () => t(deadline), transact: action => store.transact(async tx => {
    await action(tx); throw new Error('synthetic rollback');
  }) });
  await expect(handler(request())).rejects.toMatchObject({ code: 'internal' }); expect((await db.doc(path).get()).data()).toEqual(before);
});
test.each(['createdAt', 'appointmentStartAt', 'appointmentEndAt'])('structural map instead of Timestamp at %s fails closed', async key => {
  await backend()(request()); await db.doc(path).update({ [key]: t(start) }); const before = (await db.doc(path).get()).data();
  await expect(backend()(request())).rejects.toMatchObject({ code: 'permission-denied' }); expect((await db.doc(path).get()).data()).toEqual(before);
});
test('malformed actual appointment Timestamp denied', async () => {
  await db.doc('appointments/' + id).update({ startAt: t(start) });
  await expect(backend()(request())).rejects.toMatchObject({ code: 'permission-denied' }); expect((await db.doc(path).get()).exists).toBe(false);
});
test.each(['patient', 'doctor', 'administrator', 'guest'])('client %s consultation history and write boundary', async actor => {
  await backend()(request());
  const client = actor === 'guest' ? env.unauthenticatedContext().firestore() : env.authenticatedContext(actor, { role: 'administrator' }).firestore();
  await (actor === 'patient' || actor === 'doctor' ? assertSucceeds : assertFails)(getDoc(doc(client, path))); await assertFails(getDocs(collection(client, 'consultations')));
  await assertFails(setDoc(doc(client, path), { state: 'closed' }));
  await assertFails(getDocs(collection(client, path + '/messages'))); await assertFails(setDoc(doc(client, path + '/messages/test'), { text: 'synthetic' }));
});
