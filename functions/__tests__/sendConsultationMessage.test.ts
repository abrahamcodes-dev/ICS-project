import { createSendConsultationMessageHandler } from '../src/consultations/messageHandler';
import { messageId } from '../src/consultations/domain';
import { fromMilliseconds as t } from '../src/scheduling/primitives';
import { messageMemory, messageDocuments, input, sendRequest, id, path, start, uuid, secondUuid } from './messageFixtures';
import { end, deadline, terminal, identity } from './consultationFixtures';
const messagePath = path + '/messages/' + messageId(id, 'patient', uuid), statePath = path + '/senderState/patient';
const denied = (p: Promise<unknown>, code = 'permission-denied') => expect(p).rejects.toMatchObject({ code });
async function sent() { const m = messageMemory(); const result = await createSendConsultationMessageHandler(m.deps)(sendRequest()); return { ...m, result }; }
test.each(['patient', 'doctor'])('%s sends minimum response without unrelated writes', async uid => {
  const m = messageMemory(), before = { ...m.data };
  const result = await createSendConsultationMessageHandler(m.deps)(sendRequest(uid, input(uuid, '  Synthetic\r\n\u4e2d\u6587\t\ud83d\ude00  ')));
  expect(result).toEqual({ consultationId: id, messageId: messageId(id, uid, uuid), senderId: uid, type: 'text',
    text: 'Synthetic\n\u4e2d\u6587\t\ud83d\ude00', createdAt: start, replayed: false });
  for (const key of Object.keys(before)) expect(m.data[key]).toEqual(before[key]);
  expect(Object.keys(m.data).length).toBe(Object.keys(before).length + 2);
});
test('guest rejected', async () => { await denied(createSendConsultationMessageHandler(messageMemory().deps)({ data: input() }), 'unauthenticated'); });
test.each(['senderId', 'senderRole', 'createdAt', 'status', 'canSend', 'extra'])('forged input %s rejected', async key => {
  await denied(createSendConsultationMessageHandler(messageMemory().deps)(sendRequest('patient', { ...input(), [key]: 'forged' })), 'invalid-argument');
});
test.each(['administrator', 'claim-only', 'other-patient', 'other-doctor'])('%s has no authority', async uid => {
  const m = messageMemory(); if (uid !== 'claim-only') m.data['users/' + uid] = identity(uid, uid.startsWith('other-') ? uid.slice(6) : uid);
  await denied(createSendConsultationMessageHandler(m.deps)({ ...sendRequest(uid), auth: { uid, token: { role: 'administrator' } } } as any));
});
test.each([
  ['users/patient', { status: 'disabled' }], ['users/doctor', { status: 'disabled' }], ['users/patient', { role: 'doctor' }],
  ['users/doctor', { verificationStatus: 'pending' }], ['users/doctor', { verificationStatus: 'rejected' }], ['users/patient', { schemaVersion: 2 }],
  ['doctorProfiles/doctor', { revision: 99 }], ['doctorPublicProfiles/doctor', { approvedRequestId: 'wrong' }], ['verificationRequests/approved', { doctorUid: 'wrong' }],
])('new send authority %# fails without writes', async (key, patch) => {
  const m = messageMemory(); m.data[key as string] = { ...m.data[key as string], ...patch as object }; const before = JSON.stringify(m.data);
  await denied(createSendConsultationMessageHandler(m.deps)(sendRequest())); expect(JSON.stringify(m.data)).toBe(before);
});
test.each([path, 'appointments/' + id, 'users/patient', 'users/doctor', 'doctorPublicProfiles/doctor'])('missing %s fails, never creates room', async key => {
  const m = messageMemory(); delete m.data[key]; const before = JSON.stringify(m.data);
  await denied(createSendConsultationMessageHandler(m.deps)(sendRequest())); expect(JSON.stringify(m.data)).toBe(before);
});
test.each([[start - 1, false], [start, true], [end, true], [end + 1, true], [deadline - 1, true], [deadline, false]])('time %p eligible %p', async (clock, eligible) => {
  const m = messageMemory(messageDocuments(), clock as number), work = createSendConsultationMessageHandler(m.deps)(sendRequest());
  if (eligible) expect((await work).replayed).toBe(false);
  else await expect(work).rejects.toBeDefined();
});
test.each(['cancelled', 'completed', 'no_show'] as const)('terminal %s denies', async status => {
  const m = messageMemory(messageDocuments(), end); terminal(m.data, status);
  await expect(createSendConsultationMessageHandler(m.deps)(sendRequest())).rejects.toBeDefined(); expect(m.data[statePath]).toBeUndefined();
});
test.each([{ state: 'closed', closedAt: t(start) }, { state: 'wrong' }, { patientId: 'other' }, { appointmentEndAt: t(end + 1) },
  { schemaVersion: 2 }, { appointmentId: 'd'.repeat(64) }, { createdAt: null }])('corrupt/closed room %# denies', async patch => {
  const m = messageMemory(); m.data[path] = { ...m.data[path], ...patch }; await expect(createSendConsultationMessageHandler(m.deps)(sendRequest())).rejects.toBeDefined();
});
test.each(['expiry', 'approval-loss', 'counterpart-disabled', 'projection-missing', 'terminal', 'closed'])('exact replay survives %s and never reads rate/approval', async condition => {
  const m = await sent(); m.reads.length = 0; const beforeState = m.data[statePath];
  if (condition === 'expiry') m.deps.now = () => t(deadline + 1);
  if (condition === 'approval-loss') m.data['users/doctor'].verificationStatus = 'rejected';
  if (condition === 'counterpart-disabled') m.data['users/doctor'].status = 'disabled';
  if (condition === 'projection-missing') delete m.data['doctorPublicProfiles/doctor'];
  if (condition === 'terminal') { terminal(m.data, 'completed'); m.deps.now = () => t(end); }
  if (condition === 'closed') m.data[path] = { ...m.data[path], state: 'closed', closedAt: t(start) };
  const replay = await createSendConsultationMessageHandler(m.deps)(sendRequest('patient', input(uuid, ' Synthetic text\r\n')));
  expect(replay).toEqual({ ...m.result, replayed: true }); expect(m.data[statePath]).toBe(beforeState);
  expect(m.reads).not.toContain(statePath); expect(m.reads.some(p => p.startsWith('doctor') || p.startsWith('verification') || p === 'users/doctor')).toBe(false);
});
test('disabled caller cannot replay; conflicting text fails without rate change', async () => {
  const m = await sent(), before = JSON.stringify(m.data[statePath]);
  await denied(createSendConsultationMessageHandler(m.deps)(sendRequest('patient', input(uuid, 'Different synthetic'))), 'already-exists');
  expect(JSON.stringify(m.data[statePath])).toBe(before); m.data['users/patient'].status = 'disabled';
  await denied(createSendConsultationMessageHandler(m.deps)(sendRequest()));
});
test.each([{ senderId: 'doctor' }, { messageId: 'd'.repeat(64) }, { type: 'video' }, { schemaVersion: 2 }, { createdAt: t(start - 1) }, { extra: true }, { text: ' unnormalized ' }])('corrupt message %# fails closed', async patch => {
  const m = await sent(); m.data[messagePath] = { ...m.data[messagePath], ...patch };
  const before = JSON.stringify(m.data); await expect(createSendConsultationMessageHandler(m.deps)(sendRequest())).rejects.toBeDefined(); expect(JSON.stringify(m.data)).toBe(before);
});
test.each([0, 1, 999])('new send at %p ms denied, state unchanged', async elapsed => {
  const m = await sent(), before = JSON.stringify(m.data); m.deps.now = () => t(start + elapsed);
  await denied(createSendConsultationMessageHandler(m.deps)(sendRequest('patient', input(secondUuid))), 'resource-exhausted');
  expect(JSON.stringify(m.data)).toBe(before);
});
test('exactly 1000ms accepted, sender and consultation independent', async () => {
  const m = await sent(), handler = createSendConsultationMessageHandler(m.deps);
  expect((await handler(sendRequest('doctor'))).replayed).toBe(false);
  m.deps.now = () => t(start + 1000); expect((await handler(sendRequest('patient', input(secondUuid)))).replayed).toBe(false);
  const other = 'd'.repeat(64); m.data['appointments/' + other] = { ...m.data['appointments/' + id], appointmentId: other };
  m.data['consultations/' + other] = { ...m.data[path], consultationId: other, appointmentId: other };
  expect((await handler(sendRequest('patient', { ...input(), consultationId: other }))).replayed).toBe(false);
});
test.each([{ senderId: 'doctor' }, { consultationId: 'd'.repeat(64) }, { lastAcceptedAt: null }, { schemaVersion: 2 }])('corrupt rate %# fails without overwrite', async patch => {
  const m = await sent(); m.data[statePath] = { ...m.data[statePath], ...patch }; m.deps.now = () => t(start + 2000);
  const before = JSON.stringify(m.data); await denied(createSendConsultationMessageHandler(m.deps)(sendRequest('patient', input(secondUuid)))); expect(JSON.stringify(m.data)).toBe(before);
});
test('infrastructure details never escape', async () => {
  const m = messageMemory(); m.deps.transact = async () => { throw new Error('synthetic private storage details'); };
  await expect(createSendConsultationMessageHandler(m.deps)(sendRequest())).rejects.toMatchObject({ code: 'internal', message: 'Unable to send message. Please retry later.' });
});

test('expired new send persists closure before returning failed-precondition', async () => {
  const m = messageMemory(messageDocuments(), deadline);
  await denied(createSendConsultationMessageHandler(m.deps)(sendRequest()), 'failed-precondition');
  expect(m.data[path]).toEqual({ ...messageDocuments()[path], state: 'closed', closedAt: t(deadline) });
  expect(m.data[messagePath]).toBeUndefined(); expect(m.data[statePath]).toBeUndefined();
});
test.each(['completed', 'no_show'] as const)('terminal %s new send persists trusted closure and no message/rate state', async status => {
  const m = messageMemory(messageDocuments(), end);
  terminal(m.data, status, end);
  const expected = end;
  await denied(createSendConsultationMessageHandler(m.deps)(sendRequest()), 'failed-precondition');
  expect(m.data[path]).toMatchObject({ state: 'closed', closedAt: t(expected) });
  expect(m.data[messagePath]).toBeUndefined(); expect(m.data[statePath]).toBeUndefined();
});
test('exact replay after expiry succeeds and lazily persists closure without touching rate state', async () => {
  const m = await sent(), beforeState = m.data[statePath]; m.deps.now = () => t(deadline);
  const replay = await createSendConsultationMessageHandler(m.deps)(sendRequest());
  expect(replay).toEqual({ ...m.result, replayed: true });
  expect(m.data[path]).toMatchObject({ state: 'closed', closedAt: t(deadline) });
  expect(m.data[statePath]).toBe(beforeState);
});
test('persisted closure is irreversible even if appointment later appears scheduled again', async () => {
  const m = messageMemory(messageDocuments(), deadline), handler = createSendConsultationMessageHandler(m.deps);
  await denied(handler(sendRequest()), 'failed-precondition');
  const firstClosedAt = m.data[path].closedAt;
  m.data['appointments/' + id] = messageDocuments()['appointments/' + id];
  m.deps.now = () => t(deadline + 1000);
  await denied(handler(sendRequest('patient', input(secondUuid))), 'failed-precondition');
  expect(m.data[path]).toMatchObject({ state: 'closed', closedAt: firstClosedAt });
});

test.each([deadline, deadline + 1])('expiry at %p during final rate read commits closure, never a new message', async finalTime => {
  const m = messageMemory(); let clock = deadline - 1, sampled = 0, finalRead = false;
  const transact = m.deps.transact;
  m.deps.transact = action => transact(tx => action({ ...tx, senderState: async (room, uid) => {
    const rate = await tx.senderState(room, uid); clock = finalTime; finalRead = true; return rate;
  } }));
  m.deps.now = () => { expect(finalRead).toBe(true); sampled++; return t(clock); };
  await denied(createSendConsultationMessageHandler(m.deps)(sendRequest()), 'failed-precondition');
  expect(sampled).toBe(1);
  expect(m.data[path]).toEqual({ ...messageDocuments()[path], state: 'closed', closedAt: t(deadline) });
  expect(m.data[messagePath]).toBeUndefined(); expect(m.data[statePath]).toBeUndefined();
});

test('final read time governs successful message timestamp and inclusive rate boundary', async () => {
  const m = await sent(); let sampled = 0, finalRead = false;
  const transact = m.deps.transact;
  m.deps.transact = action => transact(tx => action({ ...tx, senderState: async (room, uid) => {
    const rate = await tx.senderState(room, uid); finalRead = true; return rate;
  } }));
  m.deps.now = () => { expect(finalRead).toBe(true); sampled++; return t(start + 1000); };
  const result = await createSendConsultationMessageHandler(m.deps)(sendRequest('patient', input(secondUuid)));
  expect(result.createdAt).toBe(start + 1000); expect(sampled).toBe(1);
  expect(m.data[statePath].lastAcceptedAt).toEqual(t(start + 1000));
});

test('replay crossing expiry samples once after its final read, closes and preserves message/rate', async () => {
  const m = await sent(), before = m.data[messagePath], rate = m.data[statePath];
  let finalRead = false, sampled = 0; const transact = m.deps.transact;
  m.deps.transact = action => transact(tx => action({ ...tx, message: async (room, key) => {
    const value = await tx.message(room, key); finalRead = true; return value;
  } }));
  m.deps.now = () => { expect(finalRead).toBe(true); sampled++; return t(deadline); };
  m.reads.length = 0;
  expect(await createSendConsultationMessageHandler(m.deps)(sendRequest())).toEqual({ ...m.result, replayed: true });
  expect(sampled).toBe(1); expect(m.data[messagePath]).toBe(before); expect(m.data[statePath]).toBe(rate);
  expect(m.data[path]).toMatchObject({ state: 'closed', closedAt: t(deadline) });
  expect(m.reads).not.toContain(statePath); expect(m.reads).not.toContain('users/doctor');
});

test.each(['counterpart-disabled', 'approval-loss'])('expired history-authorized send still closes after %s', async condition => {
  const m = messageMemory(messageDocuments(), deadline);
  if (condition === 'counterpart-disabled') m.data['users/doctor'].status = 'disabled';
  else m.data['users/doctor'].verificationStatus = 'rejected';
  await denied(createSendConsultationMessageHandler(m.deps)(sendRequest()), 'failed-precondition');
  expect(m.data[path]).toMatchObject({ state: 'closed', closedAt: t(deadline) });
  expect(m.data[messagePath]).toBeUndefined(); expect(m.data[statePath]).toBeUndefined();
});
