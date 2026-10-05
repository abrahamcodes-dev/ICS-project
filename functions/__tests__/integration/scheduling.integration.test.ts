import { readFileSync } from 'fs';
import { resolve } from 'path';
import { collection, doc, documentId, getDocFromServer as getDoc, getDocsFromServer as getDocs, limit, orderBy, query,
  startAfter, where, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { actors, initializeFixtures, cleanupFixtures, resetFixtures, db, projectId, tomorrowStart, halfHour, hash,
  dayOf, stamp, professional, call, availabilityInput, publish, intent, book, cancel, outcome, discover, read, denied,
  state, locksFor, assertIntegrity, historical, race, Client } from './schedulingFixtures';

beforeAll(initializeFixtures);
beforeEach(resetFixtures);
afterAll(cleanupFixtures);
async function reserved() {
  const start = tomorrowStart(), { doctorA, patientA } = actors;
  await publish(doctorA, start); const input = intent(doctorA, start), result = await book(patientA, input);
  return { start, input, ...result };
}
const history = (c: Client, owner: string, size = 50) => query(collection(c.firestore, 'appointments'), where(owner, '==', c.uid),
  orderBy('startAt', 'desc'), orderBy(documentId(), 'desc'), limit(size));
const upcoming = (c: Client, owner: string, start: number) => query(collection(c.firestore, 'appointments'), where(owner, '==', c.uid),
  where('status', '==', 'scheduled'), where('startAt', '>=', Timestamp.fromMillis(start)),
  orderBy('startAt', 'asc'), orderBy(documentId(), 'asc'), limit(50));
const get = (c: Client, id: string) => getDoc(doc(c.firestore, 'appointments', id));

test('real callable publish -> discover -> book -> participant read -> cancel -> rediscover -> different patient rebooks', async () => {
  const start = tomorrowStart(), { doctorA, patientA, patientB } = actors, before = Date.now();
  const published = await publish(doctorA, start);
  expect(published).toEqual({ availabilityId: hash(doctorA.uid, dayOf(start)), revision: 1, changed: true });
  const available = await read('doctorAvailability/' + published.availabilityId);
  expect(available.windows[0].startAt.toMillis()).toBe(start);
  const discovered = await discover(patientA, doctorA, start);
  expect(discovered.times).toHaveLength(2);
  expect(discovered.times[0]).toEqual({ doctorId: doctorA.uid, startAt: start, endAt: start + halfHour,
    availabilityId: published.availabilityId, availabilityRevision: 1 });
  const input = intent(doctorA, start), result = await book(patientA, input);
  expect(result).toEqual({ appointmentId: hash(patientA.uid, input.bookingRequestId), doctorId: doctorA.uid,
    startAt: start, endAt: start + halfHour, status: 'scheduled', replayed: false });
  const persisted = await read('appointments/' + result.appointmentId);
  expect(persisted).toMatchObject({ patientId: patientA.uid, doctorId: doctorA.uid, schemaVersion: 1, cancellation: null, outcome: null,
    doctorDisplay: { professionalName: professional.professionalName, specialty: professional.specialty } });
  expect(persisted.createdAt.toMillis()).toBeGreaterThanOrEqual(before);
  expect(persisted.createdAt.toMillis()).toBeLessThanOrEqual(Date.now());
  expect(persisted.updatedAt).toEqual(persisted.createdAt);
  await assertIntegrity();
  expect((await discover(patientB, doctorA, start)).times.map((t: any) => t.startAt)).toEqual([start + halfHour]);
  for (const c of [patientA, doctorA]) expect((await get(c, result.appointmentId)).data()?.status).toBe('scheduled');
  await denied(get(patientB, result.appointmentId), 'permission-denied');
  const cancelBefore = Date.now();
  expect(await cancel(patientA, result.appointmentId, '  Synthetic change  ')).toEqual({ appointmentId: result.appointmentId, status: 'cancelled', replayed: false });
  const cancelled = await read('appointments/' + result.appointmentId);
  expect(cancelled.cancellation).toMatchObject({ cancelledBy: patientA.uid, reason: 'Synthetic change' });
  expect(cancelled.cancellation.cancelledAt.toMillis()).toBeGreaterThanOrEqual(cancelBefore);
  expect(cancelled.updatedAt).toEqual(cancelled.cancellation.cancelledAt);
  for (const field of ['patientId', 'doctorId', 'startAt', 'endAt', 'createdAt', 'doctorDisplay', 'availabilityId', 'availabilityRevision']) {
    expect(cancelled[field]).toEqual(persisted[field]);
  }
  expect((await db.collection('bookingLocks').get()).size).toBe(0);
  expect((await discover(patientB, doctorA, start)).times.map((t: any) => t.startAt)).toContain(start);
  const replacement = await book(patientB, intent(doctorA, start));
  expect(replacement.appointmentId).not.toBe(result.appointmentId);
  const replacementState = await state();
  expect((await cancel(patientA, result.appointmentId, 'Synthetic change')).replayed).toBe(true);
  expect(await book(patientA, input)).toMatchObject({ appointmentId: result.appointmentId, status: 'cancelled', replayed: true });
  expect(await state()).toEqual(replacementState); await assertIntegrity();
});

test.each(['completed', 'no_show'])('historical scheduled fixture -> real %s outcome preserves history and frees both locks', async decision => {
  const { patientA, doctorA } = actors, fixture = await historical(patientA, doctorA);
  await assertIntegrity(); const before = await read('appointments/' + fixture.appointmentId), clock = Date.now();
  expect(await outcome(doctorA, fixture.appointmentId, decision)).toEqual({ appointmentId: fixture.appointmentId, status: decision, replayed: false });
  const after = await read('appointments/' + fixture.appointmentId);
  expect(after.outcome.recordedBy).toBe(doctorA.uid);
  expect(after.outcome.recordedAt.toMillis()).toBeGreaterThanOrEqual(clock);
  expect(after.outcome.recordedAt.toMillis()).toBeGreaterThanOrEqual(after.endAt.toMillis());
  expect(after.outcome.recordedAt.toMillis()).toBeLessThanOrEqual(Date.now());
  expect(after.updatedAt).toEqual(after.outcome.recordedAt); expect(after.cancellation).toBeNull();
  for (const field of ['appointmentId', 'patientId', 'doctorId', 'startAt', 'endAt', 'createdAt', 'doctorDisplay', 'availabilityId']) expect(after[field]).toEqual(before[field]);
  expect((await db.collection('bookingLocks').get()).size).toBe(0);
  for (const [c, owner] of [[patientA, 'patientId'], [doctorA, 'doctorId']] as [Client, string][]) {
    expect((await get(c, fixture.appointmentId)).data()?.status).toBe(decision);
    expect((await getDocs(history(c, owner))).docs.map(d => d.id)).toContain(fixture.appointmentId);
  }
  expect((await discover(patientA, doctorA, Date.now())).times.map((t: any) => t.startAt)).not.toContain(fixture.start);
  await denied(book(patientA, intent(doctorA, fixture.start)), 'functions/failed-precondition');
  const stable = await state();
  expect((await outcome(doctorA, fixture.appointmentId, decision)).replayed).toBe(true);
  expect((await book(patientA, fixture.input)).replayed).toBe(true);
  await denied(outcome(doctorA, fixture.appointmentId, decision === 'completed' ? 'no_show' : 'completed'), 'functions/failed-precondition');
  expect(await state()).toEqual(stable); await assertIntegrity();
});

test('availability normalization, single revision increment, stale revision and timezone guards use callable transport', async () => {
  const start = tomorrowStart(), doctor = actors.doctorA;
  const windows = [{ startAt: start, endAt: start + halfHour }, { startAt: start + 2 * halfHour, endAt: start + 3 * halfHour }];
  const original = { ...availabilityInput(start), windows, timeZone: 'Etc/UTC' };
  const created = await call(doctor, 'replaceDoctorAvailabilityDay', original);
  expect(created.revision).toBe(1);
  const before = await state();
  expect(await call(doctor, 'replaceDoctorAvailabilityDay', { ...original, timeZone: 'UTC', expectedRevision: 1 })).toMatchObject({ revision: 1, changed: false });
  await denied(call(doctor, 'replaceDoctorAvailabilityDay', { ...original, windows: [...windows].reverse(), expectedRevision: 1 }), 'functions/invalid-argument');
  expect(await state()).toEqual(before);
  const next = { ...original, windows: [windows[0]], expectedRevision: 1 };
  expect(await call(doctor, 'replaceDoctorAvailabilityDay', next)).toMatchObject({ revision: 2, changed: true });
  const stable = await state();
  await denied(call(doctor, 'replaceDoctorAvailabilityDay', next), 'functions/failed-precondition');
  await denied(call(doctor, 'replaceDoctorAvailabilityDay', { ...next, expectedRevision: 2, timeZone: 'Africa/Nairobi' }), 'functions/failed-precondition');
  expect(await state()).toEqual(stable);
});

test('started availability stays immutable through real replacement callable without a server-clock override', async () => {
  const doctor = actors.doctorA, start = Math.floor(Date.now() / halfHour) * halfHour;
  const data = availabilityInput(start, 1); data.windows = [{ startAt: start, endAt: start + halfHour }];
  const createdAt = stamp(start - halfHour), key = hash(doctor.uid, dayOf(start));
  await db.doc('doctorAvailability/' + key).set({ doctorId: doctor.uid, utcDate: data.utcDate, timeZone: data.timeZone,
    windows: [{ startAt: stamp(start), endAt: stamp(start + halfHour) }], revision: 1, schemaVersion: 1, createdAt, updatedAt: createdAt });
  const stable = await state();
  expect(await call(doctor, 'replaceDoctorAvailabilityDay', data)).toMatchObject({ revision: 1, changed: false });
  await denied(call(doctor, 'replaceDoctorAvailabilityDay', { ...data, windows: [] }), 'functions/failed-precondition');
  expect(await state()).toEqual(stable);
});

test('booked coverage cannot be removed; cancellation releases coverage and permits one revision update', async () => {
  const appointment = await reserved(), { patientA, doctorA } = actors;
  const removal = { ...availabilityInput(appointment.start, 1), windows: [] }, stable = await state();
  await denied(call(doctorA, 'replaceDoctorAvailabilityDay', removal), 'functions/failed-precondition');
  expect(await state()).toEqual(stable);
  await cancel(patientA, appointment.appointmentId);
  expect(await call(doctorA, 'replaceDoctorAvailabilityDay', removal)).toMatchObject({ revision: 2, changed: true });
  expect((await discover(patientA, doctorA, appointment.start)).times).toEqual([]); await assertIntegrity();
});

test.each(['doctor', 'patient'])('simultaneous callable %s double booking has one winner and no partial loser writes', async resource => {
  const start = tomorrowStart(), { patientA, patientB, doctorA, doctorB } = actors;
  await publish(doctorA, start); if (resource === 'patient') await publish(doctorB, start);
  const results = await race([() => book(patientA, intent(doctorA, start)),
    () => book(resource === 'doctor' ? patientB : patientA, intent(resource === 'doctor' ? doctorA : doctorB, start))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  const error = (results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason;
  expect(error.code).toBe('functions/already-exists');
  // Firebase JS 12.19.0 appends the HTTP status to the server's public message.
  expect(error.message).toBe('Scheduling conflict. Choose another time. [409]');
  expect(error.details).toBeUndefined();
  const stored = (await db.collection('appointments').get()).docs;
  expect(stored).toHaveLength(1);
  expect((await db.collection('bookingLocks').where('resourceType', '==', resource).get()).size).toBe(1);
  for (const secret of [patientA.uid, patientB.uid, stored[0].id]) expect(error.message).not.toContain(secret);
  await assertIntegrity();
});

test.each([0, 1])('callable booking vs availability removal race %i cannot commit uncovered appointment', async order => {
  const start = tomorrowStart(), { doctorA, patientA } = actors; await publish(doctorA, start);
  const actions = [() => book(patientA, intent(doctorA, start)),
    () => call(doctorA, 'replaceDoctorAvailabilityDay', { ...availabilityInput(start, 1), windows: [] })];
  const results = await race(order ? actions.reverse() : actions);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('functions/failed-precondition');
  const count = (await db.collection('appointments').get()).size;
  const available = await read('doctorAvailability/' + hash(doctorA.uid, dayOf(start)));
  expect(available.windows).toHaveLength(count ? 1 : 0);
  expect(available.revision).toBe(count ? 1 : 2); await assertIntegrity();
});

test('simultaneous identical booking yields create and replay; UUID conflict leaves the original state intact', async () => {
  const start = tomorrowStart(), { doctorA, patientA } = actors; await publish(doctorA, start);
  const input = intent(doctorA, start), results = await race([() => book(patientA, input), () => book(patientA, input)]);
  expect(results.every(r => r.status === 'fulfilled')).toBe(true);
  const values = results.map(r => (r as PromiseFulfilledResult<any>).value);
  expect(values.map(v => v.replayed).sort()).toEqual([false, true]); expect(values[0].appointmentId).toBe(values[1].appointmentId);
  const stable = await state(); expect((await book(patientA, input)).replayed).toBe(true);
  await denied(book(patientA, { ...input, startAt: start + halfHour }), 'functions/failed-precondition');
  expect(await state()).toEqual(stable); await assertIntegrity();
});

test('competing patient/doctor cancellations commit exactly one terminal decision', async () => {
  const appointment = await reserved();
  const results = await race([() => cancel(actors.patientA, appointment.appointmentId), () => cancel(actors.doctorA, appointment.appointmentId)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('functions/failed-precondition');
  const stored = await read('appointments/' + appointment.appointmentId);
  expect([actors.patientA.uid, actors.doctorA.uid]).toContain(stored.cancellation.cancelledBy); await assertIntegrity();
});

test.each([false, true])('concurrent outcome decisions (identical=%s) preserve one trusted terminal result', async identical => {
  const fixture = await historical(actors.patientA, actors.doctorA);
  const results = await race([() => outcome(actors.doctorA, fixture.appointmentId),
    () => outcome(actors.doctorA, fixture.appointmentId, identical ? 'completed' : 'no_show')]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(identical ? 2 : 1);
  if (identical) expect(results.map(r => (r as PromiseFulfilledResult<any>).value.replayed).sort()).toEqual([false, true]);
  else expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('functions/failed-precondition');
  await assertIntegrity();
});

test('cancellation racing a new booking and stale cancellation replay cannot delete replacement locks', async () => {
  const original = await reserved(), input = intent(actors.doctorA, original.start);
  const results = await race([() => cancel(actors.patientA, original.appointmentId), () => book(actors.patientB, input)]);
  expect(results[0].status).toBe('fulfilled');
  if (results[1].status === 'rejected') expect(results[1].reason.code).toBe('functions/already-exists');
  const replacement = await book(actors.patientB, input);
  const stable = await state(); expect((await cancel(actors.patientA, original.appointmentId)).replayed).toBe(true);
  expect(await state()).toEqual(stable);
  for (const lock of locksFor(await read('appointments/' + replacement.appointmentId))) expect((await read('bookingLocks/' + lock.id)).appointmentId).toBe(replacement.appointmentId);
  await assertIntegrity();
});

test.each(['replace', 'discover', 'book', 'cancel', 'outcome'])('%s callable rejects guests, wrong roles, disabled users and claim-only authority', async operation => {
  const appointment = await reserved();
  const invoke = (c: Client) => operation === 'replace' ? publish(c, appointment.start)
    : operation === 'discover' ? discover(c, actors.doctorA, appointment.start)
      : operation === 'book' ? book(c, intent(actors.doctorA, appointment.start + halfHour))
        : operation === 'cancel' ? cancel(c, appointment.appointmentId) : outcome(c, appointment.appointmentId);
  const wrong = operation === 'replace' ? ['patientA', 'patientB', 'pendingDoctor', 'rejectedDoctor']
    : operation === 'discover' || operation === 'book' ? ['doctorA', 'doctorB', 'pendingDoctor', 'rejectedDoctor']
      : operation === 'cancel' ? ['patientB', 'doctorB', 'pendingDoctor', 'rejectedDoctor']
        : ['patientA', 'patientB', 'doctorB', 'pendingDoctor', 'rejectedDoctor'];
  const stable = await state();
  for (const name of [...wrong, 'disabledPatient', 'disabledDoctor', 'administrator', 'claimOnly']) await denied(invoke(actors[name]));
  await denied(invoke(actors.guest), 'functions/unauthenticated');
  expect(await state()).toEqual(stable);
  if (operation === 'replace') {
    await denied(call(actors.doctorB, 'replaceDoctorAvailabilityDay', { ...availabilityInput(appointment.start), doctorId: actors.doctorA.uid }), 'functions/invalid-argument');
    expect((await publish(actors.doctorB, appointment.start)).availabilityId).toBe(hash(actors.doctorB.uid, dayOf(appointment.start)));
  }
});

test.each(['disabledDoctor', 'pendingDoctor', 'rejectedDoctor'])('booking/discovery refuse %s target despite a seeded projection', async name => {
  const stable = await state(), start = tomorrowStart();
  await denied(book(actors.patientA, intent(actors[name], start)));
  await denied(discover(actors.patientA, actors[name], start)); expect(await state()).toEqual(stable);
});

test.each(['pending', 'rejected'])('active %s doctor participant keeps lifecycle authority without current projection', async verificationStatus => {
  const future = await reserved(); await db.doc('users/' + actors.doctorA.uid).update({ verificationStatus });
  await db.doc('doctorPublicProfiles/' + actors.doctorA.uid).delete();
  expect((await cancel(actors.doctorA, future.appointmentId)).status).toBe('cancelled');
  const past = await historical(actors.patientA, actors.doctorA);
  expect((await outcome(actors.doctorA, past.appointmentId)).status).toBe('completed'); await assertIntegrity();
});

test('real Firestore SDK gets/queries enforce participants, bounds, disabled caller and counterpart history policy', async () => {
  const first = await reserved(), { patientA, doctorA } = actors;
  for (const c of [patientA, doctorA]) expect((await get(c, first.appointmentId)).exists()).toBe(true);
  for (const name of ['patientB', 'doctorB', 'administrator', 'guest', 'claimOnly']) await denied(get(actors[name], first.appointmentId), 'permission-denied');
  for (const [c, owner] of [[patientA, 'patientId'], [doctorA, 'doctorId']] as [Client, string][]) {
    expect((await getDocs(upcoming(c, owner, first.start))).docs.map(d => d.id)).toEqual([first.appointmentId]);
    expect((await getDocs(history(c, owner))).docs.map(d => d.id)).toEqual([first.appointmentId]);
    for (const q of [query(collection(c.firestore, 'appointments'), limit(1)), query(collection(c.firestore, 'appointments'), where(owner, '==', c.uid)),
      query(collection(c.firestore, 'appointments'), where(owner, '==', actors.patientB.uid), limit(1)), history(c, owner, 51)]) await denied(getDocs(q), 'permission-denied');
    await db.doc('users/' + c.uid).update({ status: 'disabled' });
    await denied(get(c, first.appointmentId), 'permission-denied'); await denied(getDocs(history(c, owner)), 'permission-denied');
    await denied(getDocs(upcoming(c, owner, first.start)), 'permission-denied');
    await denied(cancel(c, first.appointmentId));
    if (c === doctorA) await denied(outcome(c, first.appointmentId));
    const other = c === patientA ? doctorA : patientA;
    expect((await get(other, first.appointmentId)).exists()).toBe(true);
    expect((await getDocs(history(other, other === patientA ? 'patientId' : 'doctorId'))).size).toBe(1);
    await db.doc('users/' + c.uid).update({ status: 'active' });
  }
  await cancel(patientA, first.appointmentId);
  const second = await book(patientA, intent(doctorA, first.start));
  for (const [c, owner] of [[patientA, 'patientId'], [doctorA, 'doctorId']] as [Client, string][]) {
    const firstPage = await getDocs(history(c, owner, 1));
    const secondPage = await getDocs(query(collection(c.firestore, 'appointments'), where(owner, '==', c.uid),
      orderBy('startAt', 'desc'), orderBy(documentId(), 'desc'), startAfter(firstPage.docs[0]), limit(1)));
    expect([...firstPage.docs, ...secondPage.docs].map(d => d.id)).toEqual([first.appointmentId, second.appointmentId].sort().reverse());
  }
  await db.doc('users/' + doctorA.uid).update({ verificationStatus: 'rejected' });
  await db.doc('doctorPublicProfiles/' + doctorA.uid).delete();
  for (const c of [patientA, doctorA]) {
    expect((await get(c, first.appointmentId)).data()?.status).toBe('cancelled');
    expect((await getDocs(history(c, c === patientA ? 'patientId' : 'doctorId'))).size).toBe(2);
  }
});

test('real client SDK cannot directly create/update/delete appointments, locks, availability or legacy slots', async () => {
  const fixture = await reserved(), appointment = await read('appointments/' + fixture.appointmentId);
  await db.doc('availabilitySlots/synthetic-legacy').set({ doctorId: actors.doctorA.uid });
  const targets = [['appointments', fixture.appointmentId], ['bookingLocks', locksFor(appointment)[0].id],
    ['doctorAvailability', appointment.availabilityId], ['availabilitySlots', 'synthetic-legacy']];
  const stable = await state();
  for (const c of [actors.patientA, actors.doctorA]) for (const [name, id] of targets) {
    await denied(setDoc(doc(c.firestore, name, hash('synthetic-new')), { patientId: c.uid }), 'permission-denied');
    await denied(updateDoc(doc(c.firestore, name, id), { status: 'cancelled' }), 'permission-denied');
    await denied(deleteDoc(doc(c.firestore, name, id)), 'permission-denied');
    if (name !== 'appointments') await denied(getDoc(doc(c.firestore, name, id)), 'permission-denied');
  }
  expect(await state()).toEqual(stable); await assertIntegrity();
});

test('appointment relation leaks no health, credentials, audit, unrelated verification or consultation authority', async () => {
  const fixture = await reserved(), { patientA, doctorA, doctorB } = actors, time = stamp(Date.now());
  await db.doc('patientHealthProfiles/' + patientA.uid).set({ uid: patientA.uid, schemaVersion: 1, createdAt: time, updatedAt: time, allergies: ['Synthetic only'] });
  const credentialId = 'synthetic-private';
  await db.doc('doctorCredentials/' + credentialId).set({ credentialId, doctorUid: doctorA.uid,
    storagePath: 'doctorCredentials/' + doctorA.uid + '/' + credentialId + '/document', category: 'medical_license', contentType: 'application/pdf',
    sizeBytes: 1, state: 'attached', generation: '1', checksum: 'a'.repeat(64), requestId: 'synthetic-approved-' + doctorA.uid,
    schemaVersion: 1, createdAt: time, updatedAt: time, expiresAt: stamp(Date.now() + 3600000) });
  for (const name of ['verificationAudit', 'consultations', 'rooms', 'messages', 'webrtc']) await db.doc(name + '/' + fixture.appointmentId).set({ appointmentId: fixture.appointmentId });
  await denied(getDoc(doc(doctorA.firestore, 'patientHealthProfiles', patientA.uid)), 'permission-denied');
  expect((await getDoc(doc(patientA.firestore, 'patientHealthProfiles', patientA.uid))).exists()).toBe(true);
  await denied(getDoc(doc(patientA.firestore, 'doctorCredentials', credentialId)), 'permission-denied');
  expect((await getDoc(doc(doctorA.firestore, 'doctorCredentials', credentialId))).exists()).toBe(true);
  for (const c of [patientA, doctorA]) {
    await denied(getDoc(doc(c.firestore, 'verificationRequests', 'synthetic-approved-' + doctorB.uid)), 'permission-denied');
    for (const name of ['verificationAudit', 'consultations', 'rooms', 'messages', 'webrtc']) await denied(getDoc(doc(c.firestore, name, fixture.appointmentId)), 'permission-denied');
  }
  const discovered = await discover(actors.patientB, doctorA, fixture.start);
  for (const entry of discovered.times) expect(Object.keys(entry).sort()).toEqual(['doctorId', 'startAt', 'endAt', 'availabilityId', 'availabilityRevision'].sort());
  for (const value of [patientA.uid, fixture.appointmentId]) expect(JSON.stringify(discovered)).not.toContain(value);
});

test.each(['availability', 'appointment', 'missing-doctor', 'missing-patient', 'foreign-reference', 'companion-time', 'stale-projection', 'malformed-projection'])('%s corruption fails closed without partial repair', async corruption => {
  const fixture = await reserved(), value = await read('appointments/' + fixture.appointmentId), locks = locksFor(value);
  if (corruption === 'availability') await db.doc('doctorAvailability/' + value.availabilityId).update({ windows: 'malformed' });
  if (corruption === 'appointment') await db.doc('appointments/' + fixture.appointmentId).update({ schemaVersion: 2 });
  if (corruption === 'missing-doctor') await db.doc('bookingLocks/' + locks[0].id).delete();
  if (corruption === 'missing-patient') await db.doc('bookingLocks/' + locks[1].id).delete();
  if (corruption === 'foreign-reference') await db.doc('bookingLocks/' + locks[0].id).update({ appointmentId: hash('foreign') });
  if (corruption === 'companion-time') await db.doc('bookingLocks/' + locks[1].id).update({ createdAt: stamp(value.createdAt.toMillis() - 1) });
  if (corruption === 'stale-projection') await db.doc('doctorPublicProfiles/' + actors.doctorA.uid).update({ approvedRevision: 2 });
  if (corruption === 'malformed-projection') await db.doc('doctorPublicProfiles/' + actors.doctorA.uid).update({ publishedAt: 'not-a-timestamp' });
  const stable = await state();
  const projection = corruption.endsWith('projection');
  await denied(book(actors.patientA, fixture.input), projection ? 'functions/permission-denied' : 'functions/failed-precondition');
  if (projection || corruption === 'availability') {
    await denied(discover(actors.patientA, actors.doctorA, fixture.start), projection ? 'functions/permission-denied' : 'functions/failed-precondition');
    await denied(call(actors.doctorA, 'replaceDoctorAvailabilityDay', { ...availabilityInput(fixture.start, 1), windows: [] }),
      projection ? 'functions/permission-denied' : 'functions/failed-precondition');
  } else {
    await denied(cancel(actors.patientA, fixture.appointmentId), corruption === 'appointment' ? 'functions/permission-denied' : 'functions/failed-precondition');
  }
  expect(await state()).toEqual(stable);
});

test('failed early outcome, conflicting intent and invalid replacement leave all persisted scheduling state unchanged', async () => {
  const fixture = await reserved(), stable = await state();
  await denied(outcome(actors.doctorA, fixture.appointmentId), 'functions/failed-precondition');
  await denied(book(actors.patientA, { ...fixture.input, startAt: fixture.start + halfHour }), 'functions/failed-precondition');
  await denied(call(actors.doctorA, 'replaceDoctorAvailabilityDay', { ...availabilityInput(fixture.start, 1), windows: [] }), 'functions/failed-precondition');
  await denied(cancel(actors.patientA, fixture.appointmentId, 'x'.repeat(501)), 'functions/invalid-argument');
  expect(await state()).toEqual(stable); await assertIntegrity();
});

test('emulator loads exactly eleven approved exports, legacy endpoints fail, and five declared indexes are retained', async () => {
  const response = await fetch('http://127.0.0.1:5105/backends'); expect(response.ok).toBe(true);
  // Only inspect trigger names, never log backend environment/configuration payloads.
  const manifest: any = await response.json();
  const names = manifest.backends.flatMap((b: any) => b.functionTriggers.map((t: any) => t.name)).sort();
  expect(names).toEqual(['completeRegistration', 'saveDoctorProfileDraft', 'prepareDoctorCredential', 'finalizeDoctorCredential',
    'submitDoctorVerification', 'reviewDoctorVerification', 'replaceDoctorAvailabilityDay', 'getAvailableAppointmentTimes',
    'bookAppointment', 'cancelAppointment', 'recordAppointmentOutcome'].sort());
  for (const name of ['onUserCreate', 'setAvailability', 'createAvailability', 'updateAvailability', 'updateAppointmentStatus', 'submitCredentials', 'reviewVerification']) {
    const missing = await fetch('http://127.0.0.1:5105/' + projectId + '/us-central1/' + name, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} }) });
    expect(missing.status).toBe(404);
  }
  await denied(call(actors.patientA, 'bookAppointment', { slotId: 'retired-slot' }), 'functions/invalid-argument');
  const config = JSON.parse(readFileSync(resolve(__dirname, '../../firestore.indexes.json'), 'utf8'));
  expect(config.indexes).toHaveLength(5);
  for (const owner of ['patientId', 'doctorId']) for (const fields of [
    [{ fieldPath: owner, order: 'ASCENDING' }, { fieldPath: 'status', order: 'ASCENDING' }, { fieldPath: 'startAt', order: 'ASCENDING' }],
    [{ fieldPath: owner, order: 'ASCENDING' }, { fieldPath: 'startAt', order: 'DESCENDING' }],
  ]) expect(config.indexes).toContainEqual({ collectionGroup: 'appointments', queryScope: 'COLLECTION', fields });
  expect(config.indexes).toContainEqual({ collectionGroup: 'verificationRequests', queryScope: 'COLLECTION', fields: [
    { fieldPath: 'doctorUid', order: 'ASCENDING' }, { fieldPath: 'profileRevision', order: 'DESCENDING' }] });
});
