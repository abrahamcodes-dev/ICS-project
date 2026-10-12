import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { createMessageStore } from '../../src/consultations/messageStore';
import { createSendConsultationMessageHandler } from '../../src/consultations/messageHandler';
import { createOpenConsultationHandler } from '../../src/consultations/openHandler';
import { createConsultationStore } from '../../src/consultations/consultationStore';
import { createLifecycleHandlers } from '../../src/scheduling/lifecycleHandlers';
import { createAvailabilityStore } from '../../src/scheduling/availabilityStore';
import { scheduledLocks } from '../../src/scheduling/policy';
import { fromMilliseconds as t } from '../../src/scheduling/primitives';
import { messageId } from '../../src/consultations/domain';
import { messageDocuments, sendRequest, input, id, path, start, uuid, secondUuid } from '../messageFixtures';
import { end, deadline, terminal } from '../consultationFixtures';
let env: RulesTestEnvironment, db: Firestore;
function encode(value: any): any {
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    if (Object.keys(value).sort().join(',') === 'nanoseconds,seconds') return new Timestamp(value.seconds, value.nanoseconds);
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, encode(v)]));
  }
  return value;
}
const backend = (clock = start) => createSendConsultationMessageHandler({ ...createMessageStore(db), now: () => t(clock) });
const messages = () => db.collection(path + '/messages');
const state = (uid = 'patient') => db.doc(path + '/senderState/' + uid);
const messageRef = () => messages().doc(messageId(id, 'patient', uuid));
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Requires local demo emulator');
  env = await initializeTestEnvironment({ projectId: 'demo-calladoc-rules', firestore: { host: '127.0.0.1', port: 8085,
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  db = new Firestore({ projectId: 'demo-calladoc-rules', host: '127.0.0.1:8085', ssl: false });
});
beforeEach(async () => {
  await env.clearFirestore(); const batch = db.batch(); const data = messageDocuments();
  for (const [key,value] of Object.entries(data)) batch.set(db.doc(key), encode(value));
  for (const { lockId, lock } of scheduledLocks(data['appointments/' + id])) batch.set(db.doc('bookingLocks/' + lockId), encode(lock));
  await batch.commit();
});
afterAll(async () => { if (env) await env.cleanup(); if (db) await db.terminate(); });
async function snapshot() {
  const records: Record<string, any> = {};
  for (const name of ['appointments', 'bookingLocks', 'doctorAvailability', 'verificationRequests', 'doctorProfiles', 'doctorPublicProfiles', 'patientHealthProfiles', 'consultations'])
    records[name] = (await db.collection(name).get()).docs.map(d => ({ id: d.id, data: d.data() }));
  return records;
}
test('real exact schema/Timestamps; no unrelated writes; replay leaves rate timestamp untouched', async () => {
  const before = await snapshot(), first = await backend()(sendRequest());
  const message = (await messageRef().get()).data()!, rate = (await state().get()).data()!;
  expect(Object.keys(message).sort()).toEqual(['messageId','senderId','type','text','createdAt','schemaVersion'].sort());
  expect(Object.keys(rate).sort()).toEqual(['consultationId','senderId','lastAcceptedAt','schemaVersion'].sort());
  expect(message.createdAt).toBeInstanceOf(Timestamp); expect(rate.lastAcceptedAt).toBeInstanceOf(Timestamp);
  expect(await backend(start + 999)(sendRequest())).toEqual({ ...first, replayed: true });
  expect((await state().get()).data()).toEqual(rate); expect(await snapshot()).toEqual(before);
});
/** First attempts both read deterministic absence before either stages a write. */
function racingHandler() {
  const store = createMessageStore(db); let count = 0; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  return createSendConsultationMessageHandler({ ...store, now: () => t(start), transact: action => store.transact(tx => action({ ...tx,
    senderState: async (room, uid) => {
      const found = await tx.senderState(room, uid);
      if (count < 2) { count++; if (count === 2) release(); await gate; }
      return found;
    },
  })) });
}
test('simultaneous exact UUID/text converges to one create and one replay', async () => {
  const handler = racingHandler(), results = await Promise.all([handler(sendRequest()), handler(sendRequest())]);
  expect(results.map(r => r.replayed).sort()).toEqual([false,true]); expect(results[0].messageId).toBe(results[1].messageId);
  expect((await messages().get()).size).toBe(1); expect((await db.collection(path + '/senderState').get()).size).toBe(1);
});
test('simultaneous UUID with conflicting text has exactly one winner', async () => {
  const handler = racingHandler();
  const results = await Promise.allSettled([handler(sendRequest()), handler(sendRequest('patient', input(uuid, 'Other synthetic')))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('already-exists');
  expect((await messages().get()).size).toBe(1);
});
test('simultaneous distinct UUIDs from same sender accept at most one', async () => {
  const handler = racingHandler();
  const results = await Promise.allSettled([handler(sendRequest()), handler(sendRequest('patient', input(secondUuid)))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('resource-exhausted');
  expect((await messages().get()).size).toBe(1);
});
test('simultaneous patient/doctor same UUID are independently eligible', async () => {
  const handler = racingHandler(); const results = await Promise.all([handler(sendRequest()), handler(sendRequest('doctor'))]);
  expect(new Set(results.map(r => r.messageId)).size).toBe(2); expect((await messages().get()).size).toBe(2);
  expect((await db.collection(path + '/senderState').get()).size).toBe(2);
});
test('rate state isolated by consultation and inclusive 1000ms boundary', async () => {
  await backend()(sendRequest()); const before = (await state().get()).data();
  await expect(backend(start + 999)(sendRequest('patient', input(secondUuid)))).rejects.toMatchObject({ code: 'resource-exhausted' });
  expect((await state().get()).data()).toEqual(before);
  expect((await backend(start + 1000)(sendRequest('patient', input(secondUuid)))).replayed).toBe(false);
  const other = 'd'.repeat(64), data = messageDocuments();
  await db.doc('appointments/' + other).set(encode({ ...data['appointments/' + id], appointmentId: other }));
  await db.doc('consultations/' + other).set(encode({ ...data[path], consultationId: other, appointmentId: other }));
  expect((await backend()(sendRequest('patient', { ...input(), consultationId: other }))).replayed).toBe(false);
});
test.each(['expiry','approval-loss','counterpart-disabled','terminal'])('exact replay after %s keeps original timestamp/rate', async condition => {
  const first = await backend()(sendRequest()), before = (await state().get()).data(); let clock = start;
  if (condition === 'expiry') clock = deadline + 1;
  if (condition === 'approval-loss') await db.doc('users/doctor').update({ verificationStatus: 'rejected' });
  if (condition === 'counterpart-disabled') await db.doc('users/doctor').update({ status: 'disabled' });
  if (condition === 'terminal') { const data = messageDocuments(); terminal(data,'completed'); await db.doc('appointments/' + id).set(encode(data['appointments/' + id])); clock = end; }
  expect(await backend(clock)(sendRequest())).toEqual({ ...first, replayed: true }); expect((await state().get()).data()).toEqual(before);
});
test.each(['createMessage','saveSenderState'] as const)('rollback after %s leaves neither message nor rate', async method => {
  const store = createMessageStore(db), before = await snapshot();
  const handler = createSendConsultationMessageHandler({ ...store, now: () => t(start), transact: action => store.transact(tx => action({ ...tx,
    [method]: (...args: any[]) => { (tx[method] as any)(...args); throw new Error('synthetic rollback'); },
  })) });
  await expect(handler(sendRequest())).rejects.toMatchObject({ code: 'internal' });
  expect((await messages().get()).empty).toBe(true); expect((await state().get()).exists).toBe(false); expect(await snapshot()).toEqual(before);
});
test.each(['closure','terminal','disabled','approval-loss','expiry'])('ABORTED retry revalidates %s before committing', async change => {
  const store = createMessageStore(db); let attempts = 0;
  const handler = createSendConsultationMessageHandler({ ...store, now: () => t(change === 'expiry' && attempts > 1 ? deadline : end),
    transact: action => store.transact(async tx => {
      attempts++;
      if (attempts === 2) {
        if (change === 'closure') { await db.doc(path).update({ state: 'closed', closedAt: Timestamp.fromMillis(end) }); }
        if (change === 'terminal') { const data = messageDocuments(); terminal(data,'completed'); await db.doc('appointments/' + id).set(encode(data['appointments/' + id])); }
        if (change === 'disabled') await db.doc('users/patient').update({ status: 'disabled' });
        if (change === 'approval-loss') await db.doc('users/doctor').update({ verificationStatus: 'rejected' });
      }
      const result = await action(tx); if (attempts === 1) throw Object.assign(new Error('synthetic retry'), { code: 10 }); return result;
    }) });
  await expect(handler(sendRequest())).rejects.toBeDefined(); expect(attempts).toBeGreaterThanOrEqual(2);
  expect((await messages().get()).empty).toBe(true); expect((await state().get()).exists).toBe(false);
});
test('send overlaps actual C4 outcome transaction without modifying scheduling records itself', async () => {
  const outcome = createLifecycleHandlers({ ...createAvailabilityStore(db), now: () => t(end) });
  const [send, decision] = await Promise.allSettled([backend(end)(sendRequest()), outcome.outcome({ auth: { uid: 'doctor' }, data: { appointmentId: id, outcome: 'completed' } })]);
  expect(decision.status).toBe('fulfilled');
  if (send.status === 'fulfilled') expect((await messages().get()).size).toBe(1); else { expect(send.reason.code).toBe('failed-precondition'); expect((await messages().get()).empty).toBe(true); }
  expect((await db.doc('appointments/' + id).get()).data()?.status).toBe('completed');
  await expect(backend(end + 1000)(sendRequest('patient',input(secondUuid)))).rejects.toMatchObject({ code: 'failed-precondition' });
});
test('send overlaps lazy expiry closure: valid earlier decision or denial, never reopened', async () => {
  const close = createOpenConsultationHandler({ ...createConsultationStore(db), now: () => t(deadline) });
  const [send, closed] = await Promise.allSettled([backend(deadline - 1)(sendRequest()), close({ auth: { uid: 'doctor' }, data: { appointmentId: id } })]);
  expect(closed.status).toBe('fulfilled'); expect((await db.doc(path).get()).data()?.state).toBe('closed');
  if (send.status === 'rejected') expect((await messages().get()).empty).toBe(true);
  else expect(send.value.createdAt).toBe(deadline - 1);
  await expect(backend(deadline)(sendRequest('patient',input(secondUuid)))).rejects.toBeDefined();
});
test.each(['message','state','room'])('corrupt Timestamp in %s fails without overwriting', async target => {
  await backend()(sendRequest());
  const ref = target === 'message' ? messageRef() : target === 'state' ? state() : db.doc(path);
  await ref.update({ [target === 'message' || target === 'room' ? 'createdAt' : 'lastAcceptedAt']: t(start) });
  const before = (await ref.get()).data();
  await expect(backend(start + 1000)(sendRequest('patient',input(target === 'message' ? uuid : secondUuid)))).rejects.toMatchObject({ code: 'permission-denied' });
  expect((await ref.get()).data()).toEqual(before);
});
test.each(['patient','doctor','administrator','claim-only','guest'])('%s message history and private sender state boundary', async actor => {
  await backend()(sendRequest());
  const client = actor === 'guest' ? env.unauthenticatedContext().firestore() : env.authenticatedContext(actor,{ role:'administrator' }).firestore();
  for (const [name,key] of [['messages',messageId(id,'patient',uuid)],['senderState','patient']]) {
    const ref = doc(client,path + '/' + name + '/' + key);
    await (name === 'messages' && (actor === 'patient' || actor === 'doctor') ? assertSucceeds : assertFails)(getDoc(ref)); await assertFails(getDocs(collection(client,path + '/' + name)));
    await assertFails(setDoc(doc(client,path + '/' + name + '/new'),{ synthetic:true }));
    await assertFails(updateDoc(ref,{ synthetic:true })); await assertFails(deleteDoc(ref));
  }
});

test.each(['patient','doctor'])('%s can read bounded ordered message history', async actor => {
  await backend()(sendRequest());
  const client = env.authenticatedContext(actor).firestore();
  const q = require('firebase/firestore').query(collection(client, path + '/messages'),
    require('firebase/firestore').orderBy('createdAt', 'desc'),
    require('firebase/firestore').orderBy(require('firebase/firestore').documentId(), 'desc'),
    require('firebase/firestore').limit(30));
  const result = await assertSucceeds(getDocs(q)); expect(result.size).toBe(1);
});

test('message history requires a bounded page and rejects oversized pages', async () => {
  await backend()(sendRequest()); const client = env.authenticatedContext('patient').firestore();
  const f = require('firebase/firestore'); const base = collection(client, path + '/messages');
  await assertFails(getDocs(base));
  await assertFails(getDocs(f.query(base, f.orderBy('createdAt','desc'), f.orderBy(f.documentId(),'desc'), f.limit(51))));
});

test.each(['counterpart-disabled','approval-loss','terminal','closed'])('historical participant reads survive %s', async condition => {
  await backend()(sendRequest());
  if (condition === 'counterpart-disabled') await db.doc('users/doctor').update({ status: 'disabled' });
  if (condition === 'approval-loss') await db.doc('users/doctor').update({ verificationStatus: 'rejected' });
  if (condition === 'terminal') { const data = messageDocuments(); terminal(data,'completed'); await db.doc('appointments/' + id).set(encode(data['appointments/' + id])); }
  if (condition === 'closed') await db.doc(path).update({ state:'closed', closedAt: Timestamp.fromMillis(deadline) });
  const client = env.authenticatedContext('patient').firestore();
  await assertSucceeds(getDoc(doc(client,path)));
  const f = require('firebase/firestore');
  await assertSucceeds(getDocs(f.query(collection(client,path + '/messages'), f.orderBy('createdAt','desc'), f.orderBy(f.documentId(),'desc'), f.limit(30))));
});

test('disabled caller, administrator and unrelated caller cannot read consultation or bounded messages', async () => {
  await backend()(sendRequest()); await db.doc('users/patient').update({ status:'disabled' });
  const f = require('firebase/firestore');
  for (const actor of ['patient','administrator','unrelated']) {
    if (actor === 'unrelated') await db.doc('users/unrelated').set({ uid:'unrelated', email:'u@example.com', fullName:'Unrelated User', role:'patient', status:'active', createdAt:'2026-01-01T00:00:00.000Z', updatedAt:'2026-01-01T00:00:00.000Z', schemaVersion:1 });
    const client = env.authenticatedContext(actor).firestore();
    await assertFails(getDoc(doc(client,path)));
    await assertFails(getDocs(f.query(collection(client,path + '/messages'), f.orderBy('createdAt','desc'), f.orderBy(f.documentId(),'desc'), f.limit(30))));
  }
});

test('corrupt consultation binding fails closed for history', async () => {
  await backend()(sendRequest()); await db.doc(path).update({ patientId:'other' });
  const client = env.authenticatedContext('patient').firestore(); const f = require('firebase/firestore');
  await assertFails(getDoc(doc(client,path)));
  await assertFails(getDocs(f.query(collection(client,path + '/messages'), f.orderBy('createdAt','desc'), f.orderBy(f.documentId(),'desc'), f.limit(30))));
});

test('corrupt individual message fails closed on direct get and sender state stays private', async () => {
  await backend()(sendRequest()); const key = messageId(id,'patient',uuid);
  await db.doc(path + '/messages/' + key).update({ senderId:'intruder' });
  const client = env.authenticatedContext('patient').firestore();
  await assertFails(getDoc(doc(client,path + '/messages/' + key)));
  await assertFails(getDoc(doc(client,path + '/senderState/patient')));
});
