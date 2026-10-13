import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, collectionGroup, query, limit, orderBy, documentId, startAfter,
  where, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { createMockUserToken } from '@firebase/util';
import { memory, request, id, path, start, end, deadline, secondRequestId, identity, callPaths } from '../consultationCallFixtures';

let env: RulesTestEnvironment, db: Firestore, seeded: Record<string, any>, callId: string, candidateId: string;
let callPath: string, offerPath: string, answerPath: string, candidatePath: string;
const iceUuid = '32345678-1234-4234-8234-123456789abc';
const client = (uid = 'patient') => uid === 'guest' ? env.unauthenticatedContext().firestore()
  : env.authenticatedContext(uid, { role: 'doctor', administrator: true }).firestore();
const publicPaths = () => [callPath, offerPath, answerPath, candidatePath];
const privatePaths = () => Object.keys(seeded).filter(p => p.startsWith(path + '/')
  && (p.includes('/callControl/') || p.includes('/callReceipts/') || p.includes('/iceSenderState/')));
const candidateQuery = (uid = 'patient', n = 128) => query(collection(client(uid), callPath + '/candidates'), orderBy('sequence'), orderBy(documentId()), limit(n));
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Requires local demo emulator');
  env = await initializeTestEnvironment({ projectId: 'demo-calladoc-rules', firestore: { host: '127.0.0.1', port: 8085,
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  db = new Firestore({ projectId: 'demo-calladoc-rules', host: '127.0.0.1:8085', ssl: false });
  // Reuse C6's real adapter/optimistic fixture to seed actual backend document shapes.
  const m = memory(); callId = (await m.handler(request())).call.callId;
  await m.lifecycle.respond(request('doctor', { consultationId: id, callId, requestId: secondRequestId,
    action: 'accept', answer: { type: 'answer', sdp: 'v=0\r\ns=synthetic-answer\r\n' } }));
  const result = await m.lifecycle.publishIce(request('patient', { consultationId: id, callId, requestId: iceUuid,
    candidates: [{ candidate: 'candidate:1 1 UDP 1 192.0.2.1 1234 typ host', sdpMid: '0', sdpMLineIndex: 0 }] }));
  candidateId = result.candidateIds[0]; seeded = m.data;
  callPath = callPaths.call(id, callId); offerPath = callPaths.offer(id, callId); answerPath = callPaths.answer(id, callId);
  candidatePath = callPaths.candidate(id, callId, candidateId);
});
beforeEach(async () => {
  await env.clearFirestore(); const batch = db.batch();
  for (const [p, value] of Object.entries(seeded)) batch.set(db.doc(p), value);
  for (const [uid, role] of [['outsider', 'patient'], ['other-doctor', 'doctor'], ['administrator', 'administrator']])
    batch.set(db.doc('users/' + uid), identity(uid, role as 'patient' | 'doctor' | 'administrator'));
  await batch.commit();
});
afterAll(async () => { if (env) await env.cleanup(); if (db) await db.terminate(); });

test.each(['patient', 'doctor'])('%s reads metadata, both descriptions and ICE with forged claims ignored', async uid => {
  for (const p of publicPaths()) expect((await assertSucceeds(getDoc(doc(client(uid), p)))).exists()).toBe(true);
  expect((await assertSucceeds(getDocs(candidateQuery(uid)))).size).toBe(1);
});
test.each(['guest', 'outsider', 'other-doctor', 'administrator', 'claim-only'])('%s cannot read any signaling or candidate query', async uid => {
  for (const p of publicPaths()) await assertFails(getDoc(doc(client(uid), p)));
  await assertFails(getDocs(candidateQuery(uid)));
});
test.each(['patient', 'doctor'])('disabled %s loses all signaling access', async uid => {
  await db.doc('users/' + uid).update({ status: 'disabled' });
  for (const p of publicPaths()) await assertFails(getDoc(doc(client(uid), p)));
  await assertFails(getDocs(candidateQuery(uid)));
});
test.each([{ role: 'administrator' }, { uid: 'outsider' }, { schemaVersion: 2 }, { fullName: ' Bad' }, { createdAt: '2026-02-30T00:00:00.000Z' }])('malformed/nonparticipant canonical identity %# fails closed', async patch => {
  await db.doc('users/patient').update(patch);
  for (const p of publicPaths()) await assertFails(getDoc(doc(client(), p)));
  await assertFails(getDocs(candidateQuery()));
});
test.each(['counterpart-disabled', 'approval-loss', 'terminal', 'closed', 'expired'])('historical signaling survives %s', async kind => {
  if (kind === 'counterpart-disabled') await db.doc('users/doctor').update({ status: 'disabled' });
  if (kind === 'approval-loss') await db.doc('users/doctor').update({ verificationStatus: 'rejected' });
  if (kind === 'terminal') await db.doc('appointments/' + id).update({ status: 'completed', updatedAt: Timestamp.fromMillis(end), outcome: { recordedBy: 'doctor', recordedAt: Timestamp.fromMillis(end) } });
  if (['terminal', 'closed', 'expired'].includes(kind)) {
    const at = Timestamp.fromMillis(kind === 'expired' ? deadline : end);
    await db.doc(path).update({ state: 'closed', closedAt: at });
    await db.doc(callPath).update({ state: 'ended', endedAt: at, endReason: kind === 'expired' ? 'expired' : 'consultation_closed' });
  }
  for (const p of publicPaths()) await assertSucceeds(getDoc(doc(client(), p)));
  await assertSucceeds(getDocs(candidateQuery()));
});
test('doctor history survives disabled patient and approval loss', async () => {
  await db.doc('users/patient').update({ status: 'disabled' }); await db.doc('users/doctor').update({ verificationStatus: 'rejected' });
  for (const p of publicPaths()) await assertSucceeds(getDoc(doc(client('doctor'), p)));
});
test.each([1, 32, 128])('candidate page limit %s is accepted', async n => {
  await assertSucceeds(getDocs(candidateQuery('patient', n)));
});
test('bounded candidate cursor pagination and listener work', async () => {
  const q = candidateQuery(), first = await assertSucceeds(getDocs(q));
  expect((await assertSucceeds(getDocs(query(q, startAfter(first.docs[0]))))).empty).toBe(true);
  await new Promise<void>((resolve, reject) => {
    const unsubscribe = onSnapshot(q, snapshot => { unsubscribe(); try { expect(snapshot.size).toBe(1); resolve(); } catch (e) { reject(e); } }, reject);
  });
});
test('unbounded and oversized candidate lists are denied, including empty subcollections', async () => {
  await assertFails(getDocs(collection(client(), callPath + '/candidates')));
  await assertFails(getDocs(candidateQuery('patient', 129)));
  await db.doc(candidatePath).delete(); await assertFails(getDocs(collection(client(), callPath + '/candidates')));
  await assertSucceeds(getDocs(candidateQuery())); await assertFails(getDocs(candidateQuery('outsider')));
});
test('candidate query may constrain sender; ordering is not an authorization grant', async () => {
  await assertSucceeds(getDocs(query(collection(client(), callPath + '/candidates'), where('senderId', '==', 'patient'), limit(32))));
  await assertFails(getDocs(query(collection(client('outsider'), callPath + '/candidates'), where('senderId', '==', 'patient'), limit(32))));
});
test.each(['calls', 'descriptions', 'candidates'])('global/collection-group %s access denied', async name => {
  await assertFails(getDocs(query(collectionGroup(client(), name), limit(1))));
  await assertFails(getDocs(query(collection(client(), name), limit(1))));
});
test('call and description collection listing denied even when filtered to known IDs', async () => {
  for (const [p, key] of [[path + '/calls', callId], [callPath + '/descriptions', 'offer']])
    await assertFails(getDocs(query(collection(client(), p), where(documentId(), '==', key), limit(1))));
});
test.each(['patient', 'doctor', 'administrator', 'guest'])('%s cannot get/list private controls or receipts', async uid => {
  for (const p of privatePaths()) await assertFails(getDoc(doc(client(uid), p)));
  for (const p of [path + '/callControl', path + '/callReceipts', callPath + '/iceSenderState'])
    await assertFails(getDocs(query(collection(client(uid), p), limit(1))));
});
test.each(['patient', 'doctor', 'administrator', 'guest'])('%s cannot create/update/delete any C6 path', async uid => {
  for (const p of [...publicPaths(), ...privatePaths()]) {
    await assertFails(updateDoc(doc(client(uid), p), { schemaVersion: 2 }));
    await assertFails(deleteDoc(doc(client(uid), p)));
    await db.doc(p).delete(); await assertFails(setDoc(doc(client(uid), p), seeded[p] instanceof Timestamp ? {} : JSON.parse(JSON.stringify(seeded[p]))));
    await db.doc(p).set(seeded[p]);
  }
});
test.each([
  { patientId: 'outsider' }, { doctorId: 'other-doctor' }, { consultationId: 'f'.repeat(64) }, { callId: 'f'.repeat(64) },
  { appointmentId: 'f'.repeat(64) }, { initiatorId: 'outsider' }, { recipientId: 'patient' }, { schemaVersion: 2 },
  { mode: 'text' }, { state: 'connected' }, { privateToken: 'synthetic' }, { acceptedAt: null },
  { expiresAt: Timestamp.fromMillis(deadline + 1) }, { ringExpiresAt: Timestamp.fromMillis(start + 61000) },
  { createdAt: Timestamp.fromMillis(start - 1) }, { acceptedAt: Timestamp.fromMillis(start + 60000) },
])('corrupt call binding/schema %# denies all child access', async patch => {
  await db.doc(callPath).update(patch);
  for (const p of publicPaths()) await assertFails(getDoc(doc(client(), p)));
  await assertFails(getDocs(candidateQuery()));
});
test.each(['appointment', 'consultation', 'call'])('missing parent %s denies signaling, including empty lists', async target => {
  await db.doc(target === 'appointment' ? 'appointments/' + id : target === 'consultation' ? path : callPath).delete();
  for (const p of [offerPath, answerPath, candidatePath]) await assertFails(getDoc(doc(client(), p)));
  await assertFails(getDocs(candidateQuery()));
});
test('mismatched authoritative appointment denies all C6 paths', async () => {
  await db.doc('appointments/' + id).update({ patientId: 'outsider' });
  for (const p of publicPaths()) await assertFails(getDoc(doc(client(), p))); await assertFails(getDocs(candidateQuery()));
});
test('cross-consultation copies and unsupported nested paths do not inherit authority', async () => {
  const other = 'f'.repeat(64), otherPath = 'consultations/' + other;
  await db.doc('appointments/' + other).set({ ...seeded['appointments/' + id], appointmentId: other, patientId: 'outsider' });
  await db.doc(otherPath).set({ ...seeded[path], consultationId: other, appointmentId: other, patientId: 'outsider' });
  await db.doc(otherPath + '/calls/' + callId).set({ ...seeded[callPath], consultationId: other, appointmentId: other, patientId: 'outsider', initiatorId: 'outsider' });
  for (const p of publicPaths()) {
    const copied = p.replace(path, otherPath); if (p !== callPath) await db.doc(copied).set(seeded[p]);
    await assertFails(getDoc(doc(client(), copied)));
  }
  await assertFails(getDocs(query(collection(client(), otherPath + '/calls/' + callId + '/candidates'), limit(1))));
  for (const p of [callPath + '/descriptions/other', callPath + '/unknown/value', candidatePath + '/nested/value', path + '/candidates/' + candidateId]) {
    await db.doc(p).set({ synthetic: true }); await assertFails(getDoc(doc(client(), p))); await assertFails(setDoc(doc(client(), p), {}));
  }
});
test.each(['offer-owner', 'answer-owner', 'answer-time', 'candidate-owner', 'candidate-sequence', 'candidate-time', 'candidate-extra'])('corrupt child %s direct read denied', async kind => {
  let p = candidatePath, patch: Record<string, any> = {};
  if (kind === 'offer-owner') { p = offerPath; patch = { senderId: 'doctor' }; }
  if (kind === 'answer-owner') { p = answerPath; patch = { senderId: 'patient' }; }
  if (kind === 'answer-time') { p = answerPath; patch = { createdAt: Timestamp.fromMillis(start + 1) }; }
  if (kind === 'candidate-owner') patch = { senderId: 'outsider' };
  if (kind === 'candidate-sequence') patch = { sequence: 129 };
  if (kind === 'candidate-time') patch = { createdAt: Timestamp.fromMillis(deadline) };
  if (kind === 'candidate-extra') patch = { privateToken: 'synthetic' };
  await db.doc(p).update(patch); await assertFails(getDoc(doc(client(), p)));
});
test('closed-call reads fit the budget for updated canonical identities and both roles', async () => {
  const at = Timestamp.fromMillis(deadline);
  await db.doc(path).update({ state: 'closed', closedAt: at });
  await db.doc(callPath).update({ state: 'ended', endedAt: at, endReason: 'expired' });
  for (const uid of ['patient', 'doctor']) {
    await db.doc('users/' + uid).update({ createdAt: '2024-02-29T00:00:00.000Z', updatedAt: '2026-02-28T00:00:00.000Z' });
    for (const p of publicPaths()) await assertSucceeds(getDoc(doc(client(uid), p)));
    await assertSucceeds(getDocs(candidateQuery(uid)));
  }
});
test('ringing metadata and offer readable before answer exists', async () => {
  await db.doc(callPath).update({ state: 'ringing', acceptedAt: null }); await db.doc(answerPath).delete(); await db.doc(candidatePath).delete();
  for (const uid of ['patient', 'doctor']) {
    await assertSucceeds(getDoc(doc(client(uid), callPath))); await assertSucceeds(getDoc(doc(client(uid), offerPath)));
    await assertFails(getDoc(doc(client(uid), answerPath))); expect((await assertSucceeds(getDocs(candidateQuery(uid)))).empty).toBe(true);
  }
});
test.each([0, 1])('REST candidate query offset %s enforces no-offset boundary', async offset => {
  const response = await fetch(`http://127.0.0.1:8085/v1/projects/demo-calladoc-rules/databases/(default)/documents/${callPath}:runQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${createMockUserToken({ sub: 'patient' }, 'demo-calladoc-rules')}` },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'candidates' }], limit: 1, offset } }),
  });
  expect(response.status).toBe(offset === 0 ? 200 : 403);
});
