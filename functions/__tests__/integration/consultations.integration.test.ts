import { randomUUID } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { notificationId } from '../../src/notifications/events';
import { collection, doc, getDocFromServer, getDocs, query, orderBy, documentId, limit,
  setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  actors,
  initializeFixtures,
  cleanupFixtures,
  resetFixtures,
  tomorrowStart,
  publish,
  intent,
  book,
  call,
  denied,
  read,
  historical, halfHour, db, stamp, hash, race, state,
} from './schedulingFixtures';

beforeAll(initializeFixtures);
beforeEach(resetFixtures);
afterAll(cleanupFixtures);

// 10D: exercise real transaction retries across the completed-consultation workflows.
async function completedRoom() {
  const { appointmentId } = await expiredRoom();
  await call(actors.doctorA, 'recordAppointmentOutcome', { appointmentId, outcome: 'completed' });
  return appointmentId;
}
const syntheticMedication = { name: 'Synthetic record', dosage: 'Test entry', frequency: 'Test entry',
  duration: 'Test entry', instructions: 'Not clinical advice' };

test.each([false, true])('prescription contention (conflicting=%s) preserves one record and one notification', async conflicting => {
  const consultationId = await completedRoom();
  const input = { consultationId, requestId: randomUUID(), medications: [syntheticMedication] };
  const other = conflicting ? { ...input, requestId: randomUUID() } : input;
  const results = await race([() => call(actors.doctorA, 'issuePrescription', input),
    () => call(actors.doctorA, 'issuePrescription', other)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(conflicting ? 1 : 2);
  for (const result of results) if (result.status === 'rejected') expect(result.reason.code).toBe('functions/already-exists');
  expect((await db.collection('prescriptions').get()).size).toBe(1);
  const stored = await read(`prescriptions/${consultationId}`);
  const recovered = await call(actors.patientA, 'getConsultationPrescription', { consultationId });
  expect(recovered.prescription).toMatchObject({ consultationId, patientId: actors.patientA.uid,
    doctorId: actors.doctorA.uid, medications: [syntheticMedication] });
  expect(recovered.prescription).not.toHaveProperty('requestId');
  expect(await call(actors.doctorA, 'issuePrescription', { ...input, requestId: stored.requestId })).toMatchObject({ replayed: true });
  const inboxPath = `notificationInboxes/${actors.patientA.uid}/items`;
  const events = await db.collection(inboxPath).where('kind', '==', 'prescription').get();
  expect(events.size).toBe(1);
  const id = events.docs[0].id;
  expect(id).toBe(notificationId('prescription', consultationId, actors.patientA.uid));
  await Promise.all([1, 2].map(() => call(actors.patientA, 'markNotificationRead', { id })));
  expect((await read(`${inboxPath}/${id}`)).readAt).toBeInstanceOf(Timestamp);
  await denied(call(actors.patientB, 'openNotification', { id }), 'functions/permission-denied');
});

test.each([false, true])('rating contention (conflicting=%s) increments aggregate exactly once', async conflicting => {
  const consultationId = await completedRoom(), input = { consultationId, score: 0, comment: 'Synthetic' };
  const results = await race([() => call(actors.patientA, 'rateDoctor', input),
    () => call(actors.patientA, 'rateDoctor', conflicting ? { ...input, score: 5 } : input)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(conflicting ? 1 : 2);
  for (const result of results) if (result.status === 'rejected') expect(result.reason.code).toBe('functions/already-exists');
  const stored = await read(`ratings/${consultationId}`);
  expect((await db.collection('ratings').get()).size).toBe(1);
  expect(await call(actors.doctorA, 'getOwnDoctorRatingSummary', {})).toEqual({ count: 1, average: stored.score });
  expect(await call(actors.patientA, 'rateDoctor', { ...input, score: stored.score })).toMatchObject({ replayed: true });
  await denied(call(actors.patientB, 'getOwnConsultationRating', { consultationId }), 'functions/permission-denied');
});

test('completed clinical records deny direct client access and revoked canonical identity', async () => {
  const consultationId = await completedRoom();
  await call(actors.doctorA, 'issuePrescription', { consultationId, requestId: randomUUID(), medications: [syntheticMedication] });
  await call(actors.patientA, 'rateDoctor', { consultationId, score: 5 });
  for (const path of [`prescriptions/${consultationId}`, `ratings/${consultationId}`,
    `doctorRatingSummaries/${actors.doctorA.uid}`,
    `notificationInboxes/${actors.patientA.uid}/items/${notificationId('prescription', consultationId, actors.patientA.uid)}`]) {
    await expect(getDocFromServer(doc(actors.patientA.firestore, path))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(setDoc(doc(actors.patientA.firestore, path), { forged: true })).rejects.toMatchObject({ code: 'permission-denied' });
  }
  await denied(call(actors.patientB, 'getConsultationPrescription', { consultationId }), 'functions/permission-denied');
  // Existing authenticated client/token must lose access when canonical identity is disabled.
  await db.doc(`users/${actors.patientA.uid}`).update({ status: 'disabled' });
  for (const [name, data] of [['getConsultationPrescription', { consultationId }],
    ['getOwnConsultationRating', { consultationId }], ['listNotifications', {}]] as const)
    await denied(call(actors.patientA, name, data), 'functions/permission-denied');
  await denied(call(actors.guest, 'getConsultationPrescription', { consultationId }), 'functions/unauthenticated');
});

test('consultation cannot open before appointment start', async () => {
  const { patientA, doctorA } = actors;
  const start = tomorrowStart();

  await publish(doctorA, start);

  const appointment = await book(
    patientA,
    intent(doctorA, start),
  );

  await denied(
    call(patientA, 'openConsultation', {
      appointmentId: appointment.appointmentId,
    }),
    'functions/failed-precondition',
  );

  expect(
    await read(`consultations/${appointment.appointmentId}`),
  ).toBeUndefined();
});

// At least fifteen minutes remain even when run just before a half-hour boundary.
const currentAppointment = () => historical(actors.patientA, actors.doctorA, Math.floor(Date.now() / halfHour) * halfHour);
const roomPath = (id: string) => `consultations/${id}`;
const sendInput = (id: string) => ({ consultationId: id, messageRequestId: randomUUID(), text: 'Synthetic integration message' });

test('concurrent patient/doctor opens create one bound Timestamp document and retries preserve it', async () => {
  const { appointmentId, start } = await currentAppointment();
  const before = await state();
  const opened = await race([actors.patientA, actors.doctorA].map(actor => () => call(actor, 'openConsultation', { appointmentId })));
  for (const result of opened) expect(result.status).toBe('fulfilled');
  const results = opened.map(result => { if (result.status !== 'fulfilled') throw result.reason; return result.value; });
  expect(results[0]).toEqual(results[1]);
  const stored = await read(roomPath(appointmentId));
  expect(stored).toEqual({ consultationId: appointmentId, appointmentId, patientId: actors.patientA.uid,
    doctorId: actors.doctorA.uid, appointmentStartAt: stamp(start), appointmentEndAt: stamp(start + halfHour),
    state: 'active', createdAt: expect.any(Timestamp), closedAt: null, schemaVersion: 1 });
  expect(stored.createdAt.toMillis()).toBeGreaterThanOrEqual(start);
  expect(stored.createdAt.toMillis()).toBeLessThan(start + halfHour + 900000);
  expect(results[0]).toEqual({ consultationId: appointmentId, appointmentId, patientId: actors.patientA.uid,
    doctorId: actors.doctorA.uid, appointmentStartAt: start, appointmentEndAt: start + halfHour,
    state: 'active', createdAt: stored.createdAt.toMillis(), closedAt: null, canSend: true });
  expect(await call(actors.patientA, 'openConsultation', { appointmentId })).toEqual(results[0]);
  expect(await read(roomPath(appointmentId))).toEqual(stored);
  expect((await db.collection('consultations').get()).docs.map(d => d.id)).toEqual([appointmentId]);
  expect(await state()).toEqual(before);
});

test.each(['patientA', 'doctorA'])('%s concurrent identical sends persist once and replay without advancing rate state', async actorName => {
  const { appointmentId } = await currentAppointment();
  await call(actors.patientA, 'openConsultation', { appointmentId });
  const before = await state(), actor = actors[actorName], input = sendInput(appointmentId);
  const responses = await race([() => call(actor, 'sendConsultationMessage', input), () => call(actor, 'sendConsultationMessage', input)]);
  for (const result of responses) expect(result.status).toBe('fulfilled');
  const values = responses.map(result => { if (result.status !== 'fulfilled') throw result.reason; return result.value; });
  expect(values.map(value => value.replayed).sort()).toEqual([false, true]);
  const messageId = hash(appointmentId, actor.uid, input.messageRequestId), path = roomPath(appointmentId);
  const message = await read(`${path}/messages/${messageId}`), rate = await read(`${path}/senderState/${actor.uid}`);
  expect(message).toEqual({ messageId, senderId: actor.uid, type: 'text', text: input.text,
    createdAt: expect.any(Timestamp), schemaVersion: 1 });
  for (const value of values) expect(value).toEqual({ consultationId: appointmentId, messageId, senderId: actor.uid,
    type: 'text', text: input.text, createdAt: message.createdAt.toMillis(), replayed: expect.any(Boolean) });
  expect(rate).toEqual({ consultationId: appointmentId, senderId: actor.uid, lastAcceptedAt: message.createdAt, schemaVersion: 1 });
  expect(await call(actor, 'sendConsultationMessage', input)).toEqual({ ...values[0], replayed: true });
  await denied(call(actor, 'sendConsultationMessage', { ...input, text: 'Different synthetic text' }), 'functions/already-exists');
  expect(await read(`${path}/senderState/${actor.uid}`)).toEqual(rate);
  expect((await db.collection(`${path}/messages`).get()).docs.map(d => d.data())).toEqual([message]);
  for (const participant of [actors.patientA, actors.doctorA]) {
    expect((await getDocFromServer(doc(participant.firestore, path))).exists()).toBe(true);
    expect((await getDocFromServer(doc(participant.firestore, `${path}/messages/${messageId}`))).data()?.text).toBe(input.text);
    expect((await getDocs(query(collection(participant.firestore, `${path}/messages`),
      orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(30)))).docs.map(d => d.id)).toEqual([messageId]);
  }
  expect(await state()).toEqual(before);
});

test('unrelated transport access and participant direct writes/private-state reads remain denied', async () => {
  const { appointmentId } = await currentAppointment(), path = roomPath(appointmentId);
  await call(actors.patientA, 'openConsultation', { appointmentId });
  const sent = await call(actors.patientA, 'sendConsultationMessage', sendInput(appointmentId));
  await denied(call(actors.patientB, 'sendConsultationMessage', sendInput(appointmentId)));
  for (const target of [path, `${path}/messages/${sent.messageId}`]) {
    await denied(getDocFromServer(doc(actors.patientB.firestore, target)), 'permission-denied');
  }
  await denied(getDocs(query(collection(actors.patientB.firestore, `${path}/messages`), limit(30))), 'permission-denied');
  const before = await read(path), message = await read(`${path}/messages/${sent.messageId}`);
  // Use client SDK Timestamp instances so writes reach Rules rather than failing SDK serialization.
  const clientRoom = (await getDocFromServer(doc(actors.patientA.firestore, path))).data()!;
  const clientMessage = (await getDocFromServer(doc(actors.patientA.firestore, `${path}/messages/${sent.messageId}`))).data()!;
  for (const actor of [actors.patientA, actors.doctorA]) {
    for (const [target, value] of [[path, clientRoom], [`${path}/messages/${sent.messageId}`, clientMessage]] as const) {
      const ref = doc(actor.firestore, target);
      await denied(setDoc(ref, value), 'permission-denied');
      await denied(updateDoc(ref, { schemaVersion: 2 }), 'permission-denied');
      await denied(deleteDoc(ref), 'permission-denied');
    }
    await denied(setDoc(doc(actor.firestore, `consultations/${'a'.repeat(64)}`), clientRoom), 'permission-denied');
    await denied(setDoc(doc(actor.firestore, `${path}/messages/${'b'.repeat(64)}`), clientMessage), 'permission-denied');
    await denied(getDocFromServer(doc(actor.firestore, `${path}/senderState/${actor.uid}`)), 'permission-denied');
  }
  expect(await read(path)).toEqual(before);
  expect((await db.collection(`${path}/messages`).get()).docs.map(d => d.data())).toEqual([message]);
});

// Seed a room that was legitimately opened in the past. No deployed clock hook,
// mutation of an existing room's immutable fields, or wall-clock wait is needed.
async function expiredRoom() {
  const fixture = await historical(actors.patientA, actors.doctorA), { appointmentId, start } = fixture;
  const room = { consultationId: appointmentId, appointmentId, patientId: actors.patientA.uid, doctorId: actors.doctorA.uid,
    appointmentStartAt: stamp(start), appointmentEndAt: stamp(start + halfHour), state: 'active',
    createdAt: stamp(start), closedAt: null, schemaVersion: 1 };
  await db.doc(roomPath(appointmentId)).set(room);
  return { ...fixture, room };
}

test.each(['expiry', 'terminal'])('%s open reconciliation persists exact closure and preserves immutable fields', async condition => {
  const { appointmentId, start, room } = await expiredRoom(), path = roomPath(appointmentId);
  const deadline = start + halfHour + 900000;
  // A canonical prior outcome before expiry distinguishes terminal closure from expiry.
  if (condition === 'terminal') await db.doc(`appointments/${appointmentId}`).update({ status: 'completed',
    outcome: { recordedBy: actors.doctorA.uid, recordedAt: stamp(start + halfHour) }, updatedAt: stamp(start + halfHour) });
  const closedAt = condition === 'terminal' ? start + halfHour : deadline;
  const before = await state();
  const result = await call(actors.patientA, 'openConsultation', { appointmentId });
  expect(result).toMatchObject({ state: 'closed', closedAt, canSend: false });
  expect(await read(path)).toEqual({ ...room, state: 'closed', closedAt: stamp(closedAt) });
  expect(await call(actors.doctorA, 'openConsultation', { appointmentId })).toEqual(result);
  expect(await state()).toEqual(before);
});

test('expired new send commits closure despite callable rejection, without message or sender-state writes', async () => {
  const { appointmentId, start, room } = await expiredRoom(), path = roomPath(appointmentId), before = await state();
  await denied(call(actors.patientA, 'sendConsultationMessage', sendInput(appointmentId)), 'functions/failed-precondition');
  expect(await read(path)).toEqual({ ...room, state: 'closed', closedAt: stamp(start + halfHour + 900000) });
  expect((await db.collection(`${path}/messages`).get()).empty).toBe(true);
  expect((await db.collection(`${path}/senderState`).get()).empty).toBe(true);
  expect(await state()).toEqual(before);
});

test('expired exact replay commits closure but preserves the original message and private rate state', async () => {
  const { appointmentId, start, room } = await expiredRoom(), path = roomPath(appointmentId), input = sendInput(appointmentId);
  const messageId = hash(appointmentId, actors.patientA.uid, input.messageRequestId);
  const message = { messageId, senderId: actors.patientA.uid, type: 'text', text: input.text, createdAt: stamp(start + 1000), schemaVersion: 1 };
  const rate = { consultationId: appointmentId, senderId: actors.patientA.uid, lastAcceptedAt: message.createdAt, schemaVersion: 1 };
  const batch = db.batch();
  batch.set(db.doc(`${path}/messages/${messageId}`), message);
  batch.set(db.doc(`${path}/senderState/${actors.patientA.uid}`), rate);
  await batch.commit();
  expect(await call(actors.patientA, 'sendConsultationMessage', input)).toEqual({ consultationId: appointmentId,
    messageId, senderId: actors.patientA.uid, type: 'text', text: input.text, createdAt: start + 1000, replayed: true });
  expect(await read(path)).toEqual({ ...room, state: 'closed', closedAt: stamp(start + halfHour + 900000) });
  expect((await db.collection(`${path}/messages`).get()).docs.map(d => d.data())).toEqual([message]);
  expect(await read(`${path}/senderState/${actors.patientA.uid}`)).toEqual(rate);
});
test('unrelated patient cannot open another patient consultation', async () => {
  const { patientA, patientB, doctorA } = actors;

  const start = tomorrowStart();

  await publish(doctorA, start);

  const appointment = await book(
    patientA,
    intent(doctorA, start),
  );

  await denied(
    call(patientB, 'openConsultation', {
      appointmentId: appointment.appointmentId,
    }),
    'functions/permission-denied',
  );

  expect(
    await read(`consultations/${appointment.appointmentId}`),
  ).toBeUndefined();
});
