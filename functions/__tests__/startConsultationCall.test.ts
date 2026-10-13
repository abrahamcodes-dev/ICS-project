import { Timestamp } from 'firebase-admin/firestore';
import { callId } from '../src/consultations/calls/domain';
import { memory, request, input, requestId, secondRequestId, id, path, start, end, deadline, identity, callPaths } from './consultationCallFixtures';
const denied = (promise: Promise<unknown>, code = 'permission-denied') => expect(promise).rejects.toMatchObject({ code });
const key = (uid = 'patient', rid = requestId) => callId(id, uid, rid);
const controlPath = callPaths.control(id);
const callPath = (uid = 'patient', rid = requestId) => callPaths.call(id, key(uid, rid));
async function started() { const m = memory(); await m.handler(request()); return m; }

test.each(['patient', 'doctor'])('%s persists one bound call, exact offer and metadata-only response', async uid => {
  const m = memory(), before = JSON.stringify(m.data);
  m.time = new Timestamp(Math.floor(start / 1000), 123456789);
  const result = await m.handler(request(uid));
  expect(result).toEqual({ call: { callId: key(uid), consultationId: id, appointmentId: id, patientId: 'patient', doctorId: 'doctor',
    initiatorId: uid, recipientId: uid === 'patient' ? 'doctor' : 'patient', mode: 'audio', state: 'ringing', createdAt: { seconds: m.time.seconds, nanoseconds: m.time.nanoseconds },
    ringExpiresAt: { seconds: m.time.seconds + 60, nanoseconds: m.time.nanoseconds }, expiresAt: { seconds: deadline / 1000, nanoseconds: 0 },
    acceptedAt: null, endedAt: null, endReason: null, schemaVersion: 1 }, replayed: false });
  expect(m.data[callPath(uid)].createdAt).toBeInstanceOf(Timestamp);
  expect(m.data[callPaths.offer(id, key(uid))]).toEqual({ ...input().offer, senderId: uid, createdAt: m.time, schemaVersion: 1 });
  expect(m.data[controlPath]).toEqual({ consultationId: id, activeCallId: key(uid), attemptCount: 1, schemaVersion: 1 });
  const added = Object.keys(m.data).filter(p => !(p in JSON.parse(before)));
  expect(added.sort()).toEqual([callPath(uid), callPaths.offer(id, key(uid)), callPaths.receipt(id, key(uid)), controlPath].sort());
  for (const p of Object.keys(JSON.parse(before))) expect(JSON.parse(JSON.stringify(m.data[p]))).toEqual(JSON.parse(before)[p]);
  expect(m.events).toContain('clock');
  const clock = m.events.indexOf('clock'); expect(m.events.slice(clock + 1).every(e => e.includes(':write:'))).toBe(true);
  expect(m.events.slice(0, clock).every(e => e.includes(':read:'))).toBe(true);
});
test('exact retry preserves offer/call/count without writes, returns same metadata', async () => {
  const m = memory(), first = await m.handler(request()), before = JSON.stringify(m.data);
  const retry = await m.handler(request());
  expect(retry).toEqual({ ...first, replayed: true }); expect(JSON.stringify(m.data)).toBe(before); expect(m.commits[1]).toEqual([]);
});
test.each([{ mode: 'video' }, { offer: { type: 'offer', sdp: 'v=0\nchanged\n' } }])('changed-payload retry conflicts %#', async patch => {
  const m = await started(), before = JSON.stringify(m.data);
  await denied(m.handler(request('patient', input(patch))), 'already-exists'); expect(JSON.stringify(m.data)).toBe(before);
});
test('concurrent patient/doctor starts serialize to one nonterminal call and one attempt', async () => {
  const m = memory(), results = await Promise.allSettled([m.handler(request()), m.handler(request('doctor'))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'failed-precondition' } });
  expect(m.data[controlPath].attemptCount).toBe(1); expect(m.attempts).toBeGreaterThan(2);
  expect(Object.keys(m.data).filter(p => /\/calls\/[a-f0-9]{64}$/.test(p))).toHaveLength(1);
});
test('concurrent duplicate starts converge; changed-payload contender conflicts', async () => {
  const m = memory(), results = await Promise.all([m.handler(request()), m.handler(request())]);
  expect(results[0].call).toEqual(results[1].call); expect(results.map(r => r.replayed).sort()).toEqual([false, true]);
  expect(m.data[controlPath].attemptCount).toBe(1);
  const other = memory(), mixed = await Promise.allSettled([other.handler(request()), other.handler(request('patient', input({ mode: 'video' })))]);
  expect(mixed.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(mixed.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'already-exists' } });
});
test('active pointer blocks new attempt; timed-out pointer closes and permits new attempt', async () => {
  const m = await started(); await denied(m.handler(request('patient', input({ requestId: secondRequestId }))), 'failed-precondition');
  expect(m.data[controlPath].attemptCount).toBe(1);
  m.time = Timestamp.fromMillis(start + 60000);
  const result = await m.handler(request('patient', input({ requestId: secondRequestId })));
  expect(result.call.state).toBe('ringing'); expect(m.data[callPath()].endReason).toBe('ring_timeout');
  expect(m.data[controlPath]).toMatchObject({ attemptCount: 2, activeCallId: key('patient', secondRequestId) });
});
test('already-ended pointer permits next call without rewriting old closure', async () => {
  const m = await started(); m.put(callPath(), { ...m.data[callPath()], state: 'ended', endedAt: m.time, endReason: 'cancelled' });
  const before = JSON.stringify(m.data[callPath()]); await m.handler(request('patient', input({ requestId: secondRequestId })));
  expect(JSON.stringify(m.data[callPath()])).toBe(before); expect(m.data[controlPath].attemptCount).toBe(2);
});
test('eight real creations succeed; ninth denied without consuming count', async () => {
  const m = memory();
  for (let i = 1; i <= 8; i++) {
    m.time = Timestamp.fromMillis(start + (i - 1) * 60000);
    await m.handler(request('patient', input({ requestId: `${i}2345678-1234-4234-8234-123456789abc` })));
    expect(m.data[controlPath].attemptCount).toBe(i);
  }
  m.time = Timestamp.fromMillis(start + 8 * 60000);
  await denied(m.handler(request('patient', input({ requestId: '92345678-1234-4234-8234-123456789abc' }))), 'resource-exhausted');
  expect(m.data[controlPath]).toMatchObject({ attemptCount: 8, activeCallId: null });
  expect(Object.keys(m.data).filter(p => /\/calls\/[a-f0-9]{64}$/.test(p))).toHaveLength(8);
});
test('crossing expiry during final approval read samples late time and commits closure only', async () => {
  const m = memory(); m.time = Timestamp.fromMillis(deadline - 1);
  m.onRead = p => { if (p === 'verificationRequests/approved') m.time = Timestamp.fromMillis(deadline); };
  await denied(m.handler(request()), 'failed-precondition');
  expect(m.data[path]).toMatchObject({ state: 'closed', closedAt: Timestamp.fromMillis(deadline) });
  expect(m.data[controlPath]).toBeUndefined(); expect(m.data[callPath()]).toBeUndefined();
  expect(m.events.filter(e => e === 'clock')).toHaveLength(1);
  expect(m.events.slice(m.events.indexOf('clock') + 1)).toEqual([expect.stringContaining(':write:' + path)]);
});
test('exact expiry replay commits call/consultation closure without recreating offer or counting', async () => {
  const m = await started(), before = JSON.stringify(m.data[callPaths.offer(id, key())]);
  m.time = Timestamp.fromMillis(deadline); m.data['users/doctor'].status = 'disabled'; m.remove('doctorPublicProfiles/doctor');
  m.events.length = 0;
  const retry = await m.handler(request()); expect(retry).toMatchObject({ replayed: true, call: { state: 'ended', endReason: 'ring_timeout' } });
  expect(m.data[path].state).toBe('closed'); expect(m.data[controlPath]).toMatchObject({ activeCallId: null, attemptCount: 1 });
  expect(JSON.stringify(m.data[callPaths.offer(id, key())])).toBe(before);
  expect(m.events.some(e => /doctorProfiles|doctorPublicProfiles|verificationRequests/.test(e))).toBe(false);
});
test('expiry crossed during replay final read reconciles without live eligibility or new writes', async () => {
  const m = await started(); m.time = Timestamp.fromMillis(start + 59999);
  m.onRead = p => { if (p === callPaths.receipt(id, key())) m.time = Timestamp.fromMillis(deadline); };
  const result = await m.handler(request());
  expect(result).toMatchObject({ replayed: true, call: { state: 'ended', endReason: 'ring_timeout' } });
  expect(m.data[path].state).toBe('closed'); expect(m.data[controlPath].attemptCount).toBe(1);
});
test('denied new start closes existing call and consultation after final reads cross expiry', async () => {
  const m = await started(); m.time = Timestamp.fromMillis(deadline - 1);
  m.onRead = p => { if (p === 'verificationRequests/approved') m.time = Timestamp.fromMillis(deadline); };
  await denied(m.handler(request('patient', input({ requestId: secondRequestId }))), 'failed-precondition');
  expect(m.data[path].state).toBe('closed'); expect(m.data[callPath()].state).toBe('ended');
  expect(m.data[controlPath]).toMatchObject({ attemptCount: 1, activeCallId: null });
  expect(m.data[callPath('patient', secondRequestId)]).toBeUndefined();
});
test.each([1, 2, 3])('closure failure after staged write %s rolls back every closure/control change', async count => {
  const m = await started(), before = JSON.stringify(m.data); m.time = Timestamp.fromMillis(deadline); m.failAfterWrite = count;
  await denied(m.handler(request()), 'internal'); expect(JSON.stringify(m.data)).toBe(before);
});
test('terminal appointment reconciliation is committed before new-start denial', async () => {
  const m = await started(); m.time = Timestamp.fromMillis(end);
  m.put('appointments/' + id, { ...m.data['appointments/' + id], status: 'completed', updatedAt: m.time,
    outcome: { recordedBy: 'doctor', recordedAt: m.time } });
  await denied(m.handler(request('patient', input({ requestId: secondRequestId }))), 'failed-precondition');
  expect(m.data[path].closedAt).toEqual(m.time); expect(m.data[callPath()].state).toBe('ended'); expect(m.data[controlPath].attemptCount).toBe(1);
});
test.each([1, 2, 3, 4])('failure after write %s rolls back all creation writes', async count => {
  const m = memory(), before = JSON.stringify(m.data); m.failAfterWrite = count;
  await denied(m.handler(request()), 'internal'); expect(JSON.stringify(m.data)).toBe(before);
});
test('transaction retry refreshes clock after reads; abandoned attempt creates nothing', async () => {
  const m = memory(); m.forceRetries = 1; m.beforeCommit = () => { m.time = Timestamp.fromMillis(deadline); };
  await denied(m.handler(request()), 'failed-precondition'); expect(m.data[callPath()]).toBeUndefined();
  expect(m.data[controlPath]).toBeUndefined(); expect(m.data[path].state).toBe('closed'); expect(m.events.filter(e => e === 'clock')).toHaveLength(2);
});
test('transaction retry rereads approval revoked at commit boundary', async () => {
  const m = memory(); let once = true;
  m.beforeCommit = () => { if (once) { once = false; m.put('users/doctor', { ...m.data['users/doctor'], verificationStatus: 'rejected' }); } };
  await denied(m.handler(request())); expect(m.data[controlPath]).toBeUndefined(); expect(m.attempts).toBe(2);
});
test.each(['administrator', 'other-patient', 'other-doctor', 'claim-only'])('denies %s with no writes', async uid => {
  const m = memory(); if (uid !== 'claim-only') m.put('users/' + uid, identity(uid, uid.startsWith('other-') ? uid.slice(6) : uid));
  await denied(m.handler(request(uid))); expect(m.commits.flat()).toHaveLength(0);
});
test('guest and forged authority inputs rejected before transaction', async () => {
  const m = memory(); await denied(m.handler({ data: input() }), 'unauthenticated');
  for (const field of ['patientId', 'doctorId', 'senderId', 'createdAt', 'canSend', 'appointmentId']) await denied(m.handler(request('patient', input({ [field]: 'forged' }))), 'invalid-argument');
  expect(m.attempts).toBe(0);
});
test.each(['users/patient', 'users/doctor', 'doctorProfiles/doctor', 'doctorPublicProfiles/doctor', 'verificationRequests/approved'])('missing authority %s denies without counting', async p => {
  const m = memory(); m.remove(p); await denied(m.handler(request())); expect(m.data[controlPath]).toBeUndefined();
});
test.each([{ attemptCount: 0 }, { attemptCount: 9 }, { attemptCount: 0.5 }, { schemaVersion: 2 }, { consultationId: 'd'.repeat(64) },
  { activeCallId: 'e'.repeat(64) }, { extra: true }])('corrupt control fails closed %#', async patch => {
  const m = await started(); Object.assign(m.data[controlPath], patch); const before = JSON.stringify(m.data);
  await denied(m.handler(request())); expect(JSON.stringify(m.data)).toBe(before);
});
test.each([{ fingerprint: 'bad' }, { fingerprint: 'e'.repeat(64) }, { operation: 'end' }, { uid: 'doctor' }, { requestId: secondRequestId },
  { callId: 'e'.repeat(64) }, { consultationId: 'e'.repeat(64) }, { schemaVersion: 2 }, { extra: true }])('corrupt receipt fails closed %#', async patch => {
  const m = await started(); Object.assign(m.data[callPaths.receipt(id, key())], patch); const before = JSON.stringify(m.data);
  await denied(m.handler(request())); expect(JSON.stringify(m.data)).toBe(before);
});
test.each(['offer', 'receipt', 'call', 'control'])('missing %s after creation fails closed', async part => {
  const m = await started(); m.remove(part === 'offer' ? callPaths.offer(id, key()) : part === 'receipt' ? callPaths.receipt(id, key()) : part === 'call' ? callPath() : controlPath);
  await denied(m.handler(request()));
});
test('control deletion cannot reset allowance on a different request ID', async () => {
  const m = await started(); m.remove(controlPath);
  await denied(m.handler(request('patient', input({ requestId: secondRequestId }))));
});
test('corrupt null pointer cannot hide a live call from a new request', async () => {
  const m = await started(); m.data[controlPath].activeCallId = null;
  await denied(m.handler(request('patient', input({ requestId: secondRequestId }))));
  expect(m.data[callPath('patient', secondRequestId)]).toBeUndefined();
});
test('schema-valid but incorrect attempt count fails closed', async () => {
  const m = await started(); m.data[controlPath].attemptCount = 7;
  await denied(m.handler(request()));
});
test('bounded inventory detects more than eight call documents', async () => {
  const m = await started();
  for (let i = 1; i <= 8; i++) {
    const otherId = String(i).repeat(64);
    m.put(callPaths.call(id, otherId), { ...m.data[callPath()], callId: otherId, state: 'ended', endedAt: m.time, endReason: 'cancelled' });
  }
  m.data[controlPath].attemptCount = 8; await denied(m.handler(request()));
});
test('orphan offer cannot be overwritten or used to create a call', async () => {
  const m = memory(); m.put(callPaths.offer(id, key()), { ...input().offer, senderId: 'patient', createdAt: m.time, schemaVersion: 1 });
  await denied(m.handler(request())); expect(m.data[controlPath]).toBeUndefined();
});
test.each([{ senderId: 'doctor' }, { type: 'answer' }, { createdAt: { seconds: start / 1000, nanoseconds: 0 } },
  { createdAt: Timestamp.fromMillis(start + 1) }, { sdp: 'v=0\ncorrupt\n' }])('corrupt offer fails closed %#', async patch => {
  const m = await started(); Object.assign(m.data[callPaths.offer(id, key())], patch); await denied(m.handler(request()));
});
test.each([{ consultationId: 'd'.repeat(64) }, { callId: 'd'.repeat(64) }, { patientId: 'other' },
  { createdAt: { seconds: start / 1000, nanoseconds: 0 } }])('corrupt call/path/timestamp fails closed %#', async patch => {
  const m = await started(); Object.assign(m.data[callPath()], patch); await denied(m.handler(request()));
});
test('unexpected errors sanitized; SDP never enters response/error/logs', async () => {
  const m = memory(), spies = [jest.spyOn(console, 'log'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'error')];
  try {
    m.onRead = () => { throw new Error(input().offer.sdp); };
    const error = await m.handler(request()).catch(e => e);
    expect(error.code).toBe('internal'); expect(error.message).not.toContain(input().offer.sdp);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally { spies.forEach(spy => spy.mockRestore()); }
});
