import { createOpenConsultationHandler } from '../src/consultations/openHandler';
import { documents, memory, request, terminal, start, end, deadline, id, path, identity } from './consultationFixtures';
import { fromMilliseconds as t } from '../src/scheduling/primitives';
const denied = (p: Promise<unknown>, code = 'permission-denied') => expect(p).rejects.toMatchObject({ code });
async function opened() { const m = memory(); await createOpenConsultationHandler(m.deps)(request()); return m; }
test.each(['patient', 'doctor'])('%s creates once, retries preserve document, output is minimal', async uid => {
  const m = memory(), handler = createOpenConsultationHandler(m.deps), first = await handler(request(uid));
  expect(first).toEqual({ consultationId: id, appointmentId: id, patientId: 'patient', doctorId: 'doctor',
    appointmentStartAt: start, appointmentEndAt: end, state: 'active', createdAt: start, closedAt: null, canSend: true });
  expect(await handler(request(uid))).toEqual(first);
  expect(Object.keys(m.data).filter(p => p.startsWith('consultations/'))).toEqual([path]);
  expect(m.calls).toContain('verificationRequests/approved');
});
test('guest and malformed/extra input denied', async () => {
  const handler = createOpenConsultationHandler(memory().deps);
  await denied(handler({ data: { appointmentId: id } }), 'unauthenticated');
  for (const data of [null, {}, { appointmentId: 'bad' }, { appointmentId: id, doctorId: 'doctor' }]) await denied(handler(request('patient', data)), 'invalid-argument');
});
test.each(['administrator', 'admin', 'claim-only', 'other-patient', 'other-doctor'])('%s denied', async uid => {
  const m = memory();
  if (uid !== 'claim-only') m.data['users/' + uid] = identity(uid, uid.startsWith('other-') ? uid.slice(6) : uid);
  await denied(createOpenConsultationHandler(m.deps)({ ...request(uid), auth: { uid, token: { role: 'administrator' } } } as any));
  expect(m.data[path]).toBeUndefined();
});
test.each([
  ['users/patient', { status: 'disabled' }], ['users/doctor', { status: 'disabled' }], ['users/patient', { role: 'doctor' }],
  ['users/doctor', { verificationStatus: 'pending' }], ['users/doctor', { verificationStatus: 'rejected' }], ['users/patient', { schemaVersion: 2 }],
  ['doctorProfiles/doctor', { revision: 99 }], ['doctorPublicProfiles/doctor', { professionalName: 'Mismatch' }],
  ['verificationRequests/approved', { doctorUid: 'other' }], ['verificationRequests/approved', { state: 'rejected' }],
])('new creation rejects authority mismatch %#', async (key, patch) => {
  const m = memory(); m.data[key as string] = { ...m.data[key as string], ...patch as object };
  await denied(createOpenConsultationHandler(m.deps)(request())); expect(m.data[path]).toBeUndefined();
});
test.each(['appointments/' + id, 'users/patient', 'users/doctor', 'doctorProfiles/doctor', 'doctorPublicProfiles/doctor', 'verificationRequests/approved'])('missing %s fails generically', async key => {
  const m = memory(); delete m.data[key]; await denied(createOpenConsultationHandler(m.deps)(request()));
});
test.each([{ appointmentId: 'd'.repeat(64) }, { patientId: 'other' }, { status: 'booked' }, { endAt: t(start) }, { schemaVersion: 2 }])('malformed appointment %# denied', async patch => {
  const m = memory(); Object.assign(m.data['appointments/' + id], patch); await denied(createOpenConsultationHandler(m.deps)(request()));
});
test.each([[start - 1, false], [start, true], [end, true], [end + 1, true], [deadline - 1, true], [deadline, false], [deadline + 1, false]])('creation time %p eligible %p', async (at, eligible) => {
  const m = memory(documents(), at as number), result = createOpenConsultationHandler(m.deps)(request());
  if (eligible) expect((await result).canSend).toBe(true); else await denied(result, 'failed-precondition');
});
test.each(['cancelled', 'completed', 'no_show'] as const)('new terminal %s denied', async status => {
  const m = memory(documents(), end); terminal(m.data, status); await denied(createOpenConsultationHandler(m.deps)(request()), 'failed-precondition');
});
test.each(['disabled-counterpart', 'rejected', 'pending', 'missing-projection', 'corrupt-projection'])('history survives %s with canSend false', async condition => {
  const m = await opened();
  if (condition === 'disabled-counterpart') m.data['users/doctor'].status = 'disabled';
  else if (condition === 'missing-projection') delete m.data['doctorPublicProfiles/doctor'];
  else if (condition === 'corrupt-projection') m.data['doctorPublicProfiles/doctor'].approvedRevision = 100;
  else m.data['users/doctor'].verificationStatus = condition;
  expect(await createOpenConsultationHandler(m.deps)(request())).toMatchObject({ state: 'active', canSend: false });
});
test('approval-loss doctor retrieves; disabled caller and administrator cannot', async () => {
  const m = await opened(); m.data['users/doctor'].verificationStatus = 'rejected';
  expect((await createOpenConsultationHandler(m.deps)(request('doctor'))).canSend).toBe(false);
  m.data['users/doctor'].status = 'disabled'; await denied(createOpenConsultationHandler(m.deps)(request('doctor')));
  m.data['users/administrator'] = identity('administrator', 'administrator'); await denied(createOpenConsultationHandler(m.deps)(request('administrator')));
});
test.each(['completed', 'no_show'] as const)('terminal %s closure and repeated retrieval preserve identity', async status => {
  const m = await opened(); terminal(m.data, status, end + 20);
  m.deps.now = () => t(deadline + 1); const handler = createOpenConsultationHandler(m.deps);
  const result = await handler(request()); expect(result).toMatchObject({ state: 'closed', closedAt: end + 20, createdAt: start, canSend: false });
  expect(await handler(request())).toEqual(result);
});
test('expiry wins earlier terminal decision and closed room never reopens', async () => {
  const m = await opened(); terminal(m.data, 'completed', deadline + 10); m.deps.now = () => t(deadline + 20);
  const handler = createOpenConsultationHandler(m.deps); expect((await handler(request())).closedAt).toBe(deadline);
  m.data['appointments/' + id] = documents()['appointments/' + id]; expect((await handler(request())).state).toBe('closed');
});
test('expiry on scheduled room preserves all snapshots', async () => {
  const m = await opened(), before = m.data[path]; m.deps.now = () => t(deadline);
  expect(await createOpenConsultationHandler(m.deps)(request())).toMatchObject({ state: 'closed', closedAt: deadline, canSend: false });
  expect(m.data[path]).toEqual({ ...before, state: 'closed', closedAt: t(deadline) });
});
test.each([{ consultationId: 'd'.repeat(64) }, { appointmentId: 'd'.repeat(64) }, { patientId: 'other' }, { doctorId: 'other' },
  { appointmentStartAt: t(start - 1) }, { appointmentEndAt: t(end + 1) }, { schemaVersion: 2 }, { createdAt: 'now' }, { state: 'dropped' },
  { closedAt: t(end) }, { state: 'closed', closedAt: null }, { state: 'closed', closedAt: t(start - 1) }, { state: 'closed', closedAt: t(deadline + 1) }, { extra: true }])('corrupt room %# fails without repair', async patch => {
  const m = await opened(); m.data[path] = { ...m.data[path], ...patch }; const before = JSON.stringify(m.data);
  await denied(createOpenConsultationHandler(m.deps)(request())); expect(JSON.stringify(m.data)).toBe(before);
});
test('infrastructure failure is sanitized and never disguised as authority loss', async () => {
  const m = await opened(); m.deps.transact = async () => { throw new Error('private infrastructure details'); };
  await expect(createOpenConsultationHandler(m.deps)(request())).rejects.toMatchObject({ code: 'internal', message: 'Unable to open consultation. Please retry later.' });
});
