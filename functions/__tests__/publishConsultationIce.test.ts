import { Timestamp } from 'firebase-admin/firestore';
import { memory, request, input, id, path, start, end, deadline, secondRequestId, identity, callPaths } from './consultationCallFixtures';
import { CALL_LIMITS } from '../src/consultations/calls/domain';
const uuid = (n: number) => `${n.toString(16).padStart(8, '0')}-1234-4234-8234-123456789abc`;
const candidate = { candidate: 'candidate:1 1 UDP 1 192.0.2.1 1234 typ host', sdpMid: '0', sdpMLineIndex: 0 };
const denied = (p: Promise<unknown>, code = 'permission-denied') => expect(p).rejects.toMatchObject({ code });
async function setup(accept = true) {
  const m = memory(), opened = await m.handler(request()), callId = opened.call.callId;
  if (accept) await m.lifecycle.respond(request('doctor', { consultationId: id, callId, requestId: secondRequestId,
    action: 'accept', answer: { type: 'answer', sdp: 'v=0\r\ns=synthetic-answer\r\n' } }));
  const data = { consultationId: id, callId, requestId: uuid(3), candidates: [candidate] };
  return { m, callId, data, send: (uid = 'patient', patch = {}) => m.lifecycle.publishIce(request(uid, { ...data, ...patch })),
    callPath: callPaths.call(id, callId), statePath: callPaths.iceState(id, callId, 'patient'), receiptPath: callPaths.iceReceipt(id, 'patient', data.requestId) };
}
test.each(['patient', 'doctor'])('%s publishes immutable server-owned candidates with private state and metadata-only response', async uid => {
  const f = await setup(); f.m.time = new Timestamp(start / 1000 + 1, 123456789);
  const result = await f.send(uid, { candidates: [candidate, { ...candidate, usernameFragment: 'synthetic' }] });
  expect(Object.keys(result).sort()).toEqual(['call', 'candidateIds', 'replayed']);
  expect(result.replayed).toBe(false); expect(result.candidateIds).toHaveLength(2);
  result.candidateIds.forEach((cid, i) => expect(f.m.data[callPaths.candidate(id, f.callId, cid)]).toEqual({ ...candidate,
    ...(i ? { usernameFragment: 'synthetic' } : {}), senderId: uid, sequence: i + 1, createdAt: f.m.time, schemaVersion: 1 }));
  expect(f.m.data[callPaths.iceState(id, f.callId, uid)]).toEqual({ senderId: uid, count: 2, lastBatchAt: f.m.time, schemaVersion: 1 });
  expect(f.m.data[callPaths.control(id)].attemptCount).toBe(1);
  expect(JSON.stringify(result)).not.toContain(candidate.candidate); expect(JSON.stringify(result)).not.toContain('fingerprint');
});
test('all ICE reads precede exactly one clock; all writes follow it', async () => {
  const f = await setup(); f.m.events.length = 0; await f.send();
  const clock = f.m.events.indexOf('clock'); expect(f.m.events.filter(e => e === 'clock')).toHaveLength(1);
  expect(f.m.events.slice(0, clock).every(e => e.includes(':read:'))).toBe(true);
  expect(f.m.events.slice(clock + 1).every(e => e.includes(':write:'))).toBe(true);
});
test('guest rejected before transaction', async () => {
  const f = await setup(), attempts = f.m.attempts;
  await denied(f.m.lifecycle.publishIce({ data: f.data }), 'unauthenticated'); expect(f.m.attempts).toBe(attempts);
});
test.each(['unrelated', 'administrator', 'claim-only', 'disabled', 'wrong-role'])('rejects %s sender', async kind => {
  const f = await setup(); let uid = 'patient';
  if (['unrelated', 'administrator', 'claim-only'].includes(kind)) { uid = kind; if (kind !== 'claim-only') f.m.put('users/' + uid, identity(uid, kind === 'administrator' ? kind : 'patient')); }
  if (kind === 'disabled') f.m.data['users/patient'].status = 'disabled';
  if (kind === 'wrong-role') f.m.put('users/patient', identity('patient', 'doctor'));
  const before = JSON.stringify(f.m.data); await denied(f.send(uid)); expect(JSON.stringify(f.m.data)).toBe(before);
});
test.each(['counterpart-disabled', 'approval-loss', 'missing-source', 'corrupt-projection'])('new ICE requires current live eligibility: %s', async kind => {
  const f = await setup();
  if (kind === 'counterpart-disabled') f.m.data['users/doctor'].status = 'disabled';
  if (kind === 'approval-loss') f.m.data['users/doctor'].verificationStatus = 'rejected';
  if (kind === 'missing-source') f.m.remove('verificationRequests/approved');
  if (kind === 'corrupt-projection') f.m.data['doctorPublicProfiles/doctor'].approvedRevision = 99;
  await denied(f.send()); expect(f.m.data[f.statePath]).toBeUndefined();
});
test.each([
  { candidates: [] }, { candidates: Array(33).fill(candidate) }, { candidates: [null] }, { candidates: Array(2) },
  { candidates: [{ ...candidate, candidate: '' }] }, { candidates: [{ ...candidate, candidate: 'candidate:' + 'x'.repeat(2048) }] },
  { candidates: [{ ...candidate, candidate: 'candidate:\ud800' }] }, { candidates: [{ ...candidate, candidate: 'candidate:\n' }] },
  { candidates: [{ ...candidate, sdpMid: null, sdpMLineIndex: null }] }, { candidates: [{ ...candidate, sdpMLineIndex: 1.5 }] },
  { candidates: [{ ...candidate, senderId: 'doctor' }] }, { candidates: [{ ...candidate, createdAt: 0 }] },
  { candidates: [{ ...candidate, usernameFragment: 'x'.repeat(257) }] }, { schemaVersion: 1 }, { requestId: 'bad' },
])('malformed/oversized request %# rejected before reads', async patch => {
  const f = await setup(), attempts = f.m.attempts; await denied(f.send('patient', patch), 'invalid-argument'); expect(f.m.attempts).toBe(attempts);
});
test('unknown call, wrong consultation and a rewound clock fail closed', async () => {
  const f = await setup(); await denied(f.send('patient', { callId: 'f'.repeat(64) })); await denied(f.send('patient', { consultationId: 'f'.repeat(64) }));
  f.m.time = Timestamp.fromMillis(start - 1); await denied(f.send());
});
test('exact retry returns original IDs without quota/rate/write changes', async () => {
  const f = await setup(), first = await f.send(), before = JSON.stringify(f.m.data);
  expect(await f.send()).toEqual({ ...first, replayed: true }); expect(JSON.stringify(f.m.data)).toBe(before);
  expect(f.m.commits[f.m.commits.length - 1]).toEqual([]);
});
test.each([{ candidates: [{ ...candidate, sdpMid: '1' }] }, { candidates: [candidate, candidate] }])('changed payload retry %# conflicts', async patch => {
  const f = await setup(); await f.send(); const before = JSON.stringify(f.m.data);
  await denied(f.send('patient', patch), 'already-exists'); expect(JSON.stringify(f.m.data)).toBe(before);
});
test('parallel duplicates create one batch and one replay', async () => {
  const f = await setup(), results = await Promise.all([f.send(), f.send()]);
  expect(results.map(r => r.replayed).sort()).toEqual([false, true]); expect(results[0].candidateIds).toEqual(results[1].candidateIds);
  expect(f.m.data[f.statePath].count).toBe(1); expect(f.m.commits.filter(w => w.includes(f.receiptPath))).toHaveLength(1);
});
test('parallel conflicting reuse has one winner', async () => {
  const f = await setup(), results = await Promise.allSettled([f.send(), f.send('patient', { candidates: [{ ...candidate, sdpMid: '1' }] })]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'already-exists' } });
  expect(f.m.data[f.statePath].count).toBe(1);
});
test('parallel new batches from one sender enforce atomic rate limit', async () => {
  const f = await setup(), results = await Promise.allSettled([f.send(), f.send('patient', { requestId: uuid(4) })]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'resource-exhausted' } });
  expect(f.m.data[f.statePath].count).toBe(1);
});
test('participants have independent quotas/rates and candidate IDs for the same request UUID', async () => {
  const f = await setup(), results = await Promise.all([f.send('patient'), f.send('doctor')]);
  expect(results.every(r => !r.replayed)).toBe(true); expect(results[0].candidateIds).not.toEqual(results[1].candidateIds);
});
test('rate boundary preserves nanosecond precision; identical content under a new UUID consumes quota', async () => {
  const f = await setup(); f.m.time = new Timestamp(start / 1000, 123456789); await f.send();
  f.m.time = new Timestamp(start / 1000 + 1, 123456788); await denied(f.send('patient', { requestId: uuid(4) }), 'resource-exhausted');
  f.m.time = new Timestamp(start / 1000 + 1, 123456789); const result = await f.send('patient', { requestId: uuid(4) });
  expect(f.m.data[f.statePath].count).toBe(2); expect(f.m.data[callPaths.candidate(id, f.callId, result.candidateIds[0])].sequence).toBe(2);
});
test('128 candidates per sender is a hard limit; exact retry remains allowed at quota', async () => {
  const f = await setup(), batch = Array.from({ length: 32 }, (_, i) => ({ ...candidate, sdpMid: String(i) }));
  for (let n = 3; n < 7; n++) { f.m.time = Timestamp.fromMillis(start + n * 1000); await f.send('patient', { requestId: uuid(n), candidates: batch }); }
  f.m.time = Timestamp.fromMillis(start + 7000);
  await denied(f.send('patient', { requestId: uuid(7) }), 'resource-exhausted'); expect(f.m.data[f.statePath].count).toBe(CALL_LIMITS.candidatesPerSender);
  expect((await f.send('patient', { requestId: uuid(6), candidates: batch })).replayed).toBe(true);
  expect((await f.send('doctor')).replayed).toBe(false);
});
test.each(['ringing', 'ended', 'expired', 'terminal', 'closed'])('no new ICE on %s; lazy closure persists', async state => {
  const f = await setup(state !== 'ringing');
  if (state === 'ended') await f.m.lifecycle.end(request('doctor', { consultationId: id, callId: f.callId, requestId: uuid(9) }));
  if (state === 'expired') f.m.time = Timestamp.fromMillis(deadline);
  if (state === 'terminal') { f.m.time = Timestamp.fromMillis(end); f.m.put('appointments/' + id, { ...f.m.data['appointments/' + id], status: 'completed', updatedAt: f.m.time, outcome: { recordedBy: 'doctor', recordedAt: f.m.time } }); }
  if (state === 'closed') f.m.put(path, { ...f.m.data[path], state: 'closed', closedAt: f.m.time });
  await denied(f.send(), 'failed-precondition'); expect(f.m.data[f.statePath]).toBeUndefined(); expect(f.m.data[f.receiptPath]).toBeUndefined();
  if (state !== 'ringing') { expect(f.m.data[f.callPath].state).toBe('ended'); expect(f.m.data[callPaths.control(id)].activeCallId).toBeNull(); }
  if (state === 'expired' || state === 'terminal') expect(f.m.data[path].state).toBe('closed');
});
test('expiry during final approval read rejects ICE and commits closure without candidate state', async () => {
  const f = await setup(); f.m.time = Timestamp.fromMillis(deadline - 1);
  f.m.onRead = p => { if (p === 'verificationRequests/approved') f.m.time = Timestamp.fromMillis(deadline); };
  await denied(f.send(), 'failed-precondition'); expect(f.m.data[f.callPath].endReason).toBe('expired'); expect(f.m.data[path].state).toBe('closed');
  expect(f.m.data[f.statePath]).toBeUndefined(); expect(f.m.data[f.receiptPath]).toBeUndefined();
});
test('historical exact replay reconciles expiry without republishing or requiring counterpart approval', async () => {
  const f = await setup(), first = await f.send(), state = JSON.stringify(f.m.data[f.statePath]);
  f.m.data['users/doctor'].status = 'disabled'; f.m.remove('verificationRequests/approved'); f.m.time = Timestamp.fromMillis(deadline - 1);
  f.m.onRead = p => { if (p === f.statePath) f.m.time = Timestamp.fromMillis(deadline); };
  const result = await f.send(); expect(result).toMatchObject({ replayed: true, candidateIds: first.candidateIds, call: { state: 'ended', endReason: 'expired' } });
  expect(JSON.stringify(f.m.data[f.statePath])).toBe(state); expect(f.m.data[path].state).toBe('closed');
  f.m.data['users/patient'].status = 'disabled'; await denied(f.send());
});
test.each([1, 2, 3, 4])('failure at write %s rolls back candidates, quota and receipt', async failAfterWrite => {
  const f = await setup(), before = JSON.stringify(f.m.data); f.m.failAfterWrite = failAfterWrite;
  await denied(f.send('patient', { candidates: [candidate, candidate] }), 'internal'); expect(JSON.stringify(f.m.data)).toBe(before);
});
test('retried transaction resamples time after expiry and leaves no abandoned batch', async () => {
  const f = await setup(); f.m.forceRetries = 1; f.m.beforeCommit = () => { f.m.time = Timestamp.fromMillis(deadline); };
  await denied(f.send(), 'failed-precondition'); expect(f.m.data[f.statePath]).toBeUndefined(); expect(f.m.data[f.callPath].state).toBe('ended');
});
test('approval revocation during commit retries and denies without persistence', async () => {
  const f = await setup(); let once = true;
  f.m.beforeCommit = () => { if (once) { once = false; f.m.put('users/doctor', { ...f.m.data['users/doctor'], verificationStatus: 'rejected' }); } };
  await denied(f.send()); expect(f.m.data[f.statePath]).toBeUndefined();
});
test.each(['missing-state', 'count', 'sender', 'timestamp', 'raw-timestamp', 'sequence', 'candidate-owner', 'receipt', 'missing-receipt', 'missing-candidate', 'pointer', 'answer'])('corrupted %s fails closed', async kind => {
  const f = await setup(), first = await f.send(), cp = callPaths.candidate(id, f.callId, first.candidateIds[0]);
  if (kind === 'missing-state') f.m.remove(f.statePath);
  if (kind === 'count') f.m.data[f.statePath].count = 2;
  if (kind === 'sender') f.m.data[f.statePath].senderId = 'doctor';
  if (kind === 'timestamp') f.m.data[f.statePath].lastBatchAt = Timestamp.fromMillis(start - 1);
  if (kind === 'raw-timestamp') f.m.data[f.statePath].lastBatchAt = { seconds: start / 1000, nanoseconds: 0 };
  if (kind === 'sequence') f.m.data[cp].sequence = 2;
  if (kind === 'candidate-owner') f.m.data[cp].senderId = 'doctor';
  if (kind === 'receipt') f.m.data[f.receiptPath].fingerprint = 'f'.repeat(64);
  if (kind === 'missing-receipt') f.m.remove(f.receiptPath);
  if (kind === 'missing-candidate') f.m.remove(cp);
  if (kind === 'pointer') f.m.data[callPaths.control(id)].activeCallId = null;
  if (kind === 'answer') f.m.remove(callPaths.answer(id, f.callId));
  const before = JSON.stringify(f.m.data); await denied(f.send()); expect(JSON.stringify(f.m.data)).toBe(before);
});
test('same UUID cannot be reused for a different call in the consultation', async () => {
  const f = await setup(); await f.send();
  await f.m.lifecycle.end(request('patient', { consultationId: id, callId: f.callId, requestId: uuid(9) }));
  const next = await f.m.handler(request('patient', input({ requestId: uuid(10) })));
  await f.m.lifecycle.respond(request('doctor', { consultationId: id, callId: next.call.callId, requestId: uuid(11), action: 'accept', answer: { type: 'answer', sdp: 'v=0\nnew\n' } }));
  await denied(f.send('patient', { callId: next.call.callId }), 'already-exists');
  const replay = await f.send(); expect(replay.replayed).toBe(true); expect(replay.call.state).toBe('ended');
  expect(f.m.data[callPaths.control(id)].activeCallId).toBe(next.call.callId);
});
test('counter deletion cannot reset quota for a new request UUID', async () => {
  const f = await setup(); await f.send(); f.m.remove(f.statePath); f.m.time = Timestamp.fromMillis(start + 1000);
  await denied(f.send('patient', { requestId: uuid(4) })); expect(f.m.data[f.statePath]).toBeUndefined();
});
test('candidate payload corruption cannot be acknowledged by an unchanged receipt', async () => {
  const f = await setup(), first = await f.send(); f.m.data[callPaths.candidate(id, f.callId, first.candidateIds[0])].sdpMid = 'changed';
  await denied(f.send());
});
test('two batches competing for the final quota slot cannot exceed 128', async () => {
  const f = await setup();
  for (let n = 3; n < 7; n++) {
    f.m.time = Timestamp.fromMillis(start + n * 1000);
    await f.send('patient', { requestId: uuid(n), candidates: Array(n === 6 ? 31 : 32).fill(candidate) });
  }
  f.m.time = Timestamp.fromMillis(start + 7000);
  const results = await Promise.allSettled([f.send('patient', { requestId: uuid(7) }), f.send('patient', { requestId: uuid(8) })]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'resource-exhausted' } });
  expect(f.m.data[f.statePath].count).toBe(128);
});
test('concurrent hangup and ICE serialize without resurrecting the call', async () => {
  const f = await setup();
  const results = await Promise.allSettled([
    f.m.lifecycle.end(request('doctor', { consultationId: id, callId: f.callId, requestId: uuid(9) })), f.send(),
  ]);
  expect(results[0].status).toBe('fulfilled'); expect(f.m.data[f.callPath].state).toBe('ended');
  if (results[1].status === 'rejected') {
    expect(results[1].reason).toMatchObject({ code: 'failed-precondition' }); expect(f.m.data[f.statePath]).toBeUndefined();
  } else {
    const c = f.m.data[callPaths.candidate(id, f.callId, results[1].value.candidateIds[0])];
    expect(c.createdAt.toMillis()).toBeLessThanOrEqual(f.m.data[f.callPath].endedAt.toMillis());
  }
  await denied(f.send('patient', { requestId: uuid(10) }), 'failed-precondition');
  expect(f.m.data[callPaths.control(id)].activeCallId).toBeNull();
});
test('one nanosecond before consultation expiry permits a batch; at expiry a new batch closes', async () => {
  const f = await setup(); f.m.time = new Timestamp(deadline / 1000 - 1, 999999999);
  expect((await f.send()).replayed).toBe(false); f.m.time = Timestamp.fromMillis(deadline);
  await denied(f.send('doctor'), 'failed-precondition'); expect(f.m.data[f.callPath].endReason).toBe('expired');
});
