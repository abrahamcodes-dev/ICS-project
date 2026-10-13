import { randomUUID } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { doc, collection, getDocFromServer, getDocs, query, limit, orderBy, documentId, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { actors, initializeFixtures, cleanupFixtures, resetFixtures, historical, halfHour, call, denied, read, db, stamp, race } from './schedulingFixtures';
import { callPaths, createCallStore } from '../../src/consultations/calls/callStore';
import { createStartConsultationCallHandler } from '../../src/consultations/calls/startHandler';
import { createCallLifecycleHandlers } from '../../src/consultations/calls/lifecycleHandler';

beforeAll(initializeFixtures); beforeEach(resetFixtures); afterAll(cleanupFixtures);
const offer = { type: 'offer', sdp: 'v=0\r\ns=synthetic-integration-offer\r\n' };
const answer = { type: 'answer', sdp: 'v=0\r\ns=synthetic-integration-answer\r\n' };
const candidates = [{ candidate: 'candidate:1 1 UDP 1 192.0.2.1 1234 typ host', sdpMid: '0', sdpMLineIndex: 0 }];
async function room() {
  const { appointmentId } = await historical(actors.patientA, actors.doctorA, Math.floor(Date.now() / halfHour) * halfHour);
  await call(actors.patientA, 'openConsultation', { appointmentId });
  return { consultationId: appointmentId, requestId: randomUUID(), mode: 'audio', offer };
}
async function ringing() {
  const input = await room(), result = await call(actors.patientA, 'startConsultationCall', input);
  const mutation = { consultationId: input.consultationId, callId: result.call.callId, requestId: randomUUID() };
  return { input, mutation, path: callPaths.call(mutation.consultationId, mutation.callId) };
}
async function accepted() {
  const f = await ringing(); await call(actors.doctorA, 'respondToConsultationCall', { ...f.mutation, action: 'accept', answer }); return f;
}
const values = (results: PromiseSettledResult<any>[]) => results.map(r => { if (r.status !== 'fulfilled') throw r.reason; return r.value; });

test('concurrent exact starts create one immutable offer and current metadata; changed retry conflicts', async () => {
  const input = await room();
  expect(await call(actors.patientA, 'getConsultationCall', { consultationId: input.consultationId })).toEqual({ call: null });
  const results = values(await race([() => call(actors.patientA, 'startConsultationCall', input), () => call(actors.patientA, 'startConsultationCall', input)]));
  expect(results.map(r => r.replayed).sort()).toEqual([false, true]); expect(results[0].call).toEqual(results[1].call);
  const { callId } = results[0].call, stored = await read(callPaths.call(input.consultationId, callId));
  expect(stored).toMatchObject({ state: 'ringing', initiatorId: actors.patientA.uid, recipientId: actors.doctorA.uid, createdAt: expect.any(Timestamp) });
  const sdp = await read(callPaths.offer(input.consultationId, callId)); expect(sdp).toEqual({ ...offer, senderId: actors.patientA.uid, createdAt: stored.createdAt, schemaVersion: 1 });
  await denied(call(actors.patientA, 'startConsultationCall', { ...input, mode: 'video' }), 'functions/already-exists');
  expect(await read(callPaths.offer(input.consultationId, callId))).toEqual(sdp);
  expect(await call(actors.doctorA, 'getConsultationCall', { consultationId: input.consultationId })).toEqual({ call: results[0].call });
  expect((await db.collection(`consultations/${input.consultationId}/calls`).get()).size).toBe(1);
});
test('competing participant starts serialize to one active call and one attempt', async () => {
  const input = await room();
  const results = await race([() => call(actors.patientA, 'startConsultationCall', input), () => call(actors.doctorA, 'startConsultationCall', { ...input, requestId: randomUUID() })]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'functions/failed-precondition' } });
  expect(await read(callPaths.control(input.consultationId))).toMatchObject({ attemptCount: 1 });
});
test('callee concurrent exact acceptance persists one immutable answer; wrong caller and conflicting retries denied', async () => {
  const f = await ringing(), input = { ...f.mutation, action: 'accept', answer };
  await denied(call(actors.patientA, 'respondToConsultationCall', input));
  const results = values(await race([() => call(actors.doctorA, 'respondToConsultationCall', input), () => call(actors.doctorA, 'respondToConsultationCall', input)]));
  expect(results.map(r => r.replayed).sort()).toEqual([false, true]);
  const stored = await read(f.path), sdp = await read(f.path + '/descriptions/answer');
  expect(sdp).toEqual({ ...answer, senderId: actors.doctorA.uid, createdAt: stored.acceptedAt, schemaVersion: 1 });
  expect(stored.acceptedAt).toBeInstanceOf(Timestamp);
  await denied(call(actors.doctorA, 'respondToConsultationCall', { ...input, answer: { ...answer, sdp: 'v=0\nchanged\n' } }), 'functions/already-exists');
  expect(await read(f.path + '/descriptions/answer')).toEqual(sdp);
});
test.each(['reject', 'cancel'])('%s terminates ringing call irreversibly and clears current pointer', async action => {
  const f = await ringing();
  const result = action === 'reject'
    ? await call(actors.doctorA, 'respondToConsultationCall', { ...f.mutation, action: 'reject' })
    : await call(actors.patientA, 'endConsultationCall', f.mutation);
  expect(result.call).toMatchObject({ state: 'ended', endReason: action === 'reject' ? 'rejected' : 'cancelled' });
  expect(await read(f.path + '/descriptions/answer')).toBeUndefined();
  expect(await read(callPaths.control(f.mutation.consultationId))).toMatchObject({ activeCallId: null });
  await denied(call(actors.doctorA, 'respondToConsultationCall', { ...f.mutation, requestId: randomUUID(), action: 'accept', answer }), 'functions/failed-precondition');
});
test('hangup replays, historical metadata persists, current retrieval is empty and room stays active', async () => {
  const f = await accepted(), input = { ...f.mutation, requestId: randomUUID() };
  const result = await call(actors.doctorA, 'endConsultationCall', input);
  expect(result.call).toMatchObject({ state: 'ended', endReason: 'hangup' });
  expect(await call(actors.doctorA, 'endConsultationCall', input)).toEqual({ ...result, replayed: true });
  expect(await call(actors.patientA, 'getConsultationCall', { consultationId: input.consultationId, callId: input.callId })).toEqual({ call: result.call });
  expect(await call(actors.patientA, 'getConsultationCall', { consultationId: input.consultationId })).toEqual({ call: null });
  expect(await read(`consultations/${input.consultationId}`)).toMatchObject({ state: 'active' });
});
test.each(['patientA', 'doctorA'])('%s concurrent exact ICE retries persist once without private response data', async name => {
  const f = await accepted(), input = { ...f.mutation, requestId: randomUUID(), candidates }, actor = actors[name];
  const results = values(await race([() => call(actor, 'publishConsultationIce', input), () => call(actor, 'publishConsultationIce', input)]));
  expect(results.map(r => r.replayed).sort()).toEqual([false, true]); expect(results[0].candidateIds).toEqual(results[1].candidateIds);
  expect(Object.keys(results[0]).sort()).toEqual(['call', 'candidateIds', 'replayed']);
  const stored = await read(`${f.path}/candidates/${results[0].candidateIds[0]}`);
  expect(stored).toEqual({ ...candidates[0], senderId: actor.uid, sequence: 1, createdAt: expect.any(Timestamp), schemaVersion: 1 });
  const statePath = callPaths.iceState(input.consultationId, input.callId, actor.uid), before = await read(statePath);
  expect(before).toMatchObject({ count: 1, lastBatchAt: stored.createdAt });
  await denied(call(actor, 'publishConsultationIce', { ...input, candidates: [{ ...candidates[0], sdpMid: '1' }] }), 'functions/already-exists');
  expect(await read(statePath)).toEqual(before); expect((await db.collection(f.path + '/candidates').get()).size).toBe(1);
  for (const participant of [actors.patientA, actors.doctorA]) {
    expect((await getDocFromServer(doc(participant.firestore, `${f.path}/candidates/${results[0].candidateIds[0]}`))).exists()).toBe(true);
    expect((await getDocs(query(collection(participant.firestore, f.path + '/candidates'), orderBy('sequence'), orderBy(documentId()), limit(128)))).size).toBe(1);
  }
  await denied(getDocs(collection(actor.firestore, f.path + '/candidates')), 'permission-denied');
  await denied(getDocs(query(collection(actor.firestore, f.path + '/candidates'), limit(129))), 'permission-denied');
});
test('concurrent participant ICE has independent sender state and unique candidate IDs', async () => {
  const f = await accepted(), input = { ...f.mutation, requestId: randomUUID(), candidates };
  const results = values(await race([actors.patientA, actors.doctorA].map(actor => () => call(actor, 'publishConsultationIce', input))));
  expect(new Set(results.flatMap(r => r.candidateIds)).size).toBe(2);
  for (const actor of [actors.patientA, actors.doctorA]) expect(await read(callPaths.iceState(input.consultationId, input.callId, actor.uid))).toMatchObject({ count: 1 });
});
test('canonical authorization and cross-consultation isolation survive transport and Rules', async () => {
  const f = await accepted(), input = { ...f.mutation, requestId: randomUUID(), candidates };
  for (const name of ['patientB', 'doctorB', 'administrator', 'claimOnly', 'guest']) {
    const actor = actors[name], code = name === 'guest' ? 'functions/unauthenticated' : 'functions/permission-denied';
    await denied(call(actor, 'publishConsultationIce', input), code);
    await denied(call(actor, 'getConsultationCall', { consultationId: input.consultationId, callId: input.callId }), code);
    await denied(getDocFromServer(doc(actor.firestore, f.path)), 'permission-denied');
  }
  const other = await historical(actors.patientB, actors.doctorB, Math.floor(Date.now() / halfHour) * halfHour);
  await call(actors.patientB, 'openConsultation', { appointmentId: other.appointmentId });
  await denied(call(actors.patientA, 'publishConsultationIce', { ...input, consultationId: other.appointmentId }));
  await db.doc('users/' + actors.patientA.uid).update({ status: 'disabled' }); await denied(call(actors.patientA, 'publishConsultationIce', input));
});
test('participants cannot read private state or write any signaling path', async () => {
  const f = await accepted(), input = { ...f.mutation, requestId: randomUUID(), candidates };
  const result = await call(actors.patientA, 'publishConsultationIce', input);
  const publicPaths = [f.path, f.path + '/descriptions/offer', f.path + '/descriptions/answer', `${f.path}/candidates/${result.candidateIds[0]}`];
  const privatePaths = [callPaths.control(input.consultationId), callPaths.receipt(input.consultationId, input.callId),
    callPaths.answerReceipt(input.consultationId, input.callId), callPaths.iceReceipt(input.consultationId, actors.patientA.uid, input.requestId),
    callPaths.iceState(input.consultationId, input.callId, actors.patientA.uid)];
  for (const actor of [actors.patientA, actors.doctorA]) {
    for (const p of publicPaths) {
      const ref = doc(actor.firestore, p), value = (await getDocFromServer(ref)).data()!;
      await denied(setDoc(ref, value), 'permission-denied'); await denied(updateDoc(ref, { schemaVersion: 2 }), 'permission-denied'); await denied(deleteDoc(ref), 'permission-denied');
    }
    for (const p of privatePaths) {
      await denied(getDocFromServer(doc(actor.firestore, p)), 'permission-denied'); await denied(setDoc(doc(actor.firestore, p), { synthetic: true }), 'permission-denied');
    }
  }
});
// Valid prior persisted calls: fixture-only clock, never a callable or deployed clock override.
async function pastCall() {
  const f = await historical(actors.patientA, actors.doctorA), cid = f.appointmentId;
  await db.doc(`consultations/${cid}`).set({ consultationId: cid, appointmentId: cid, patientId: actors.patientA.uid,
    doctorId: actors.doctorA.uid, appointmentStartAt: stamp(f.start), appointmentEndAt: stamp(f.start + halfHour),
    state: 'active', createdAt: stamp(f.start), closedAt: null, schemaVersion: 1 });
  const deps = { ...createCallStore(db), now: () => ({ seconds: f.start / 1000, nanoseconds: 0 }) };
  const started = await createStartConsultationCallHandler(deps)({ auth: { uid: actors.patientA.uid }, data: { consultationId: cid, requestId: randomUUID(), mode: 'audio', offer } });
  const mutation = { consultationId: cid, callId: started.call.callId, requestId: randomUUID() };
  const handlers = createCallLifecycleHandlers(deps);
  await handlers.respond({ auth: { uid: actors.doctorA.uid }, data: { ...mutation, action: 'accept', answer } });
  return { ...f, mutation, handlers, path: callPaths.call(cid, mutation.callId) };
}
test.each(['expiry', 'terminal'])('%s rejected new ICE commits closure without candidates', async condition => {
  const f = await pastCall();
  if (condition === 'terminal') await call(actors.doctorA, 'recordAppointmentOutcome', { appointmentId: f.appointmentId, outcome: 'completed' });
  // Use a historical terminal decision before expiry to distinguish closure causes.
  if (condition === 'terminal') await db.doc('appointments/' + f.appointmentId).update({ outcome: { recordedBy: actors.doctorA.uid, recordedAt: stamp(f.start + halfHour) }, updatedAt: stamp(f.start + halfHour) });
  await denied(call(actors.patientA, 'publishConsultationIce', { ...f.mutation, requestId: randomUUID(), candidates }), 'functions/failed-precondition');
  expect(await read(f.path)).toMatchObject({ state: 'ended', endReason: condition === 'terminal' ? 'consultation_closed' : 'expired' });
  expect(await read(`consultations/${f.appointmentId}`)).toMatchObject({ state: 'closed' });
  expect(await read(callPaths.control(f.appointmentId))).toMatchObject({ activeCallId: null });
  expect((await db.collection(f.path + '/candidates').get()).empty).toBe(true);
});
test('expired exact ICE replay preserves immutable candidates and quota while reconciling metadata', async () => {
  const f = await pastCall(), input = { ...f.mutation, requestId: randomUUID(), candidates };
  const first = await f.handlers.publishIce({ auth: { uid: actors.patientA.uid }, data: input });
  const statePath = callPaths.iceState(f.appointmentId, input.callId, actors.patientA.uid), before = await read(statePath);
  const result = await call(actors.patientA, 'publishConsultationIce', input);
  expect(result).toMatchObject({ replayed: true, candidateIds: first.candidateIds, call: { state: 'ended', endReason: 'expired' } });
  expect(await read(statePath)).toEqual(before); expect((await db.collection(f.path + '/candidates').get()).size).toBe(1);
});
