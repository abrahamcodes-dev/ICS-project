import { Timestamp } from 'firebase-admin/firestore';
import { memory, request, input, id, path, start, end, deadline, secondRequestId, identity, callPaths } from './consultationCallFixtures';
const answer = { type: 'answer', sdp: 'v=0\r\ns=synthetic-answer\r\n' };
const thirdId = '32345678-1234-4234-8234-123456789abc';
const denied = (promise: Promise<unknown>, code = 'permission-denied') => expect(promise).rejects.toMatchObject({ code });
async function ringing(initiator = 'patient', at = start) {
  const m = memory(); m.time = Timestamp.fromMillis(at);
  const opened = await m.handler(request(initiator));
  const callId = opened.call.callId, recipient = opened.call.recipientId;
  const mutation = { consultationId: id, callId, requestId: secondRequestId };
  const accept = { ...mutation, action: 'accept', answer };
  const get = { consultationId: id, callId };
  return { m, callId, initiator, recipient, mutation, accept, get,
    callPath: callPaths.call(id, callId), answerPath: callPaths.answer(id, callId),
    answerReceiptPath: callPaths.answerReceipt(id, callId),
    responseReceiptPath: callPaths.actionReceipt(id, 'respond', recipient, secondRequestId) };
}
async function accepted() {
  const f = await ringing(); f.m.time = new Timestamp(start / 1000, 123456789);
  await f.m.lifecycle.respond(request(f.recipient, f.accept)); return f;
}
test.each(['patient', 'doctor'])('%s initiates; only bound recipient accepts with immutable server-owned answer', async uid => {
  const f = await ringing(uid), { m } = f, before = JSON.stringify(m.data);
  m.time = new Timestamp(start / 1000 + 1, 123456789); m.events.length = 0;
  const response = await m.lifecycle.respond(request(f.recipient, f.accept));
  expect(response).toEqual({ call: (await m.lifecycle.get(request(uid, f.get))).call, replayed: false });
  expect(response.call).toMatchObject({ state: 'accepted', acceptedAt: { seconds: m.time.seconds, nanoseconds: m.time.nanoseconds }, initiatorId: uid, recipientId: f.recipient });
  expect(m.data[f.answerPath]).toEqual({ ...answer, senderId: f.recipient, createdAt: m.time, schemaVersion: 1 });
  expect(m.data[f.callPath].acceptedAt).toBeInstanceOf(Timestamp);
  const old = JSON.parse(before);
  for (const p of Object.keys(old).filter(p => p !== f.callPath)) expect(JSON.parse(JSON.stringify(m.data[p]))).toEqual(old[p]);
  expect(Object.keys(m.data).filter(p => !(p in old)).sort()).toEqual([f.answerPath, f.answerReceiptPath, f.responseReceiptPath].sort());
  expect(Object.keys(response).sort()).toEqual(['call', 'replayed']); expect(JSON.stringify(response)).not.toContain(answer.sdp);
});
test('all reads finish before the single acceptance clock and writes', async () => {
  const f = await ringing(); f.m.events.length = 0; await f.m.lifecycle.respond(request(f.recipient, f.accept));
  const events = f.m.events, clock = events.indexOf('clock');
  expect(events.filter(e => e === 'clock')).toHaveLength(1);
  expect(events.slice(0, clock).every(e => e.includes(':read:'))).toBe(true);
  expect(events.slice(clock + 1).every(e => e.includes(':write:'))).toBe(true);
});
test('same answer UUID replays unchanged without writes; different UUID cannot renegotiate', async () => {
  const f = await accepted(), before = JSON.stringify(f.m.data);
  const retry = await f.m.lifecycle.respond(request(f.recipient, f.accept));
  expect(retry).toMatchObject({ replayed: true, call: { state: 'accepted' } }); expect(JSON.stringify(f.m.data)).toBe(before);
  expect(f.m.commits[f.m.commits.length - 1]).toEqual([]);
  await denied(f.m.lifecycle.respond(request(f.recipient, { ...f.accept, requestId: thirdId })), 'failed-precondition');
});
test.each([{ answer: { ...answer, sdp: 'v=0\nchanged\n' } }, { action: 'reject' }])('conflicting response retry rejected %#', async patch => {
  const f = await accepted(), before = JSON.stringify(f.m.data);
  const data: any = { ...f.accept, ...patch }; if (data.action === 'reject') delete data.answer;
  await denied(f.m.lifecycle.respond(request(f.recipient, data)), 'already-exists'); expect(JSON.stringify(f.m.data)).toBe(before);
});
test('parallel exact answers commit once with one immutable answer and receipt', async () => {
  const f = await ringing();
  const results = await Promise.all([f.m.lifecycle.respond(request(f.recipient, f.accept)), f.m.lifecycle.respond(request(f.recipient, f.accept))]);
  expect(results.map(r => r.replayed).sort()).toEqual([false, true]); expect(results[0].call).toEqual(results[1].call);
  expect(f.m.commits.filter(w => w.includes(f.answerPath))).toHaveLength(1);
  expect(f.m.data[callPaths.control(id)].attemptCount).toBe(1);
});
test.each([false, true])('parallel conflicting answers with different request ID=%s have one winner', async differentId => {
  const f = await ringing();
  const results = await Promise.allSettled([f.m.lifecycle.respond(request(f.recipient, f.accept)), f.m.lifecycle.respond(request(f.recipient,
    { ...f.accept, requestId: differentId ? thirdId : secondRequestId, answer: { ...answer, sdp: 'v=0\nother\n' } }))]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: differentId ? 'failed-precondition' : 'already-exists' } });
  expect(f.m.commits.filter(w => w.includes(f.answerPath))).toHaveLength(1);
});
test.each(['initiator', 'unrelated', 'administrator', 'claim-only', 'disabled', 'wrong-role'])('answer denied for %s', async kind => {
  const f = await ringing(); let uid = f.recipient;
  if (kind === 'initiator') uid = f.initiator;
  if (kind === 'unrelated' || kind === 'administrator' || kind === 'claim-only') {
    uid = kind; if (kind !== 'claim-only') f.m.put('users/' + uid, identity(uid, kind === 'administrator' ? kind : 'patient'));
  }
  if (kind === 'disabled') f.m.data['users/' + uid].status = 'disabled';
  if (kind === 'wrong-role') f.m.put('users/' + uid, identity(uid, 'patient'));
  await denied(f.m.lifecycle.respond(request(uid, f.accept))); expect(f.m.data[f.answerPath]).toBeUndefined();
});
test.each(['counterpart-disabled', 'approval-loss', 'missing-source', 'corrupt-projection'])('new acceptance denied for %s', async kind => {
  const f = await ringing();
  if (kind === 'counterpart-disabled') f.m.data['users/patient'].status = 'disabled';
  if (kind === 'approval-loss') f.m.data['users/doctor'].verificationStatus = 'rejected';
  if (kind === 'missing-source') f.m.remove('verificationRequests/approved');
  if (kind === 'corrupt-projection') f.m.data['doctorPublicProfiles/doctor'].approvedRevision = 99;
  await denied(f.m.lifecycle.respond(request(f.recipient, f.accept))); expect(f.m.data[f.callPath].state).toBe('ringing');
});
test.each([null, {}, { senderId: 'spoof' }, { answer: { ...answer, sdp: 'v=0\n' + 'x'.repeat(65536) } },
  { answer: { type: 'offer', sdp: answer.sdp } }, { answer: { ...answer, sdp: 'v=0\n\ud800' } }, { state: 'accepted' }, { acceptedAt: 0 }])('malformed answer request %# rejected before transaction', async patch => {
  const f = await ringing(), before = f.m.attempts;
  const data = patch === null ? null : Object.keys(patch).length === 0 ? {} : { ...f.accept, ...patch };
  await denied(f.m.lifecycle.respond(request(f.recipient, data)), 'invalid-argument'); expect(f.m.attempts).toBe(before);
});
test('guest denied before reads', async () => {
  const f = await ringing(), before = f.m.attempts; await denied(f.m.lifecycle.respond({ data: f.accept }), 'unauthenticated'); expect(f.m.attempts).toBe(before);
});
test('unknown/cross-consultation call ID and before-start clock rejected', async () => {
  const f = await ringing();
  await denied(f.m.lifecycle.respond(request(f.recipient, { ...f.accept, callId: 'f'.repeat(64) })));
  await denied(f.m.lifecycle.respond(request(f.recipient, { ...f.accept, consultationId: 'f'.repeat(64) })));
  f.m.time = Timestamp.fromMillis(start - 1); await denied(f.m.lifecycle.respond(request(f.recipient, f.accept)));
});
test('one nanosecond before ring deadline accepts; exact deadline rejects and commits timeout', async () => {
  const before = await ringing(); before.m.time = new Timestamp(start / 1000 + 59, 999999999);
  expect((await before.m.lifecycle.respond(request(before.recipient, before.accept))).call.state).toBe('accepted');
  const at = await ringing(); at.m.time = Timestamp.fromMillis(start + 60000);
  await denied(at.m.lifecycle.respond(request(at.recipient, at.accept)), 'failed-precondition');
  expect(at.m.data[at.callPath]).toMatchObject({ state: 'ended', endReason: 'ring_timeout', endedAt: at.m.time });
  expect(at.m.data[at.answerPath]).toBeUndefined(); expect(at.m.data[at.responseReceiptPath]).toBeUndefined();
  expect(at.m.data[callPaths.control(id)].activeCallId).toBeNull();
});
test.each(['ring', 'consultation'])('expiry during final approval read (%s) persists required closure and no answer', async kind => {
  const at = kind === 'ring' ? start : deadline - 30000, boundary = kind === 'ring' ? start + 60000 : deadline;
  const f = await ringing('patient', at); f.m.time = Timestamp.fromMillis(boundary - 1);
  f.m.onRead = p => { if (p === 'verificationRequests/approved') f.m.time = Timestamp.fromMillis(boundary); };
  await denied(f.m.lifecycle.respond(request(f.recipient, f.accept)), 'failed-precondition');
  expect(f.m.data[f.callPath].endReason).toBe(kind === 'ring' ? 'ring_timeout' : 'expired');
  expect(f.m.data[f.answerPath]).toBeUndefined(); expect(f.m.data[f.responseReceiptPath]).toBeUndefined();
  expect(f.m.data[path].state).toBe(kind === 'ring' ? 'active' : 'closed');
});
test('closed consultation and terminal appointment reject acceptance and persist call closure', async () => {
  for (const terminal of [false, true]) {
    const f = await ringing('patient', end - 1000); f.m.time = Timestamp.fromMillis(end);
    if (terminal) f.m.put('appointments/' + id, { ...f.m.data['appointments/' + id], status: 'completed', updatedAt: f.m.time, outcome: { recordedBy: 'doctor', recordedAt: f.m.time } });
    else f.m.put(path, { ...f.m.data[path], state: 'closed', closedAt: f.m.time });
    await denied(f.m.lifecycle.respond(request(f.recipient, f.accept)), 'failed-precondition'); expect(f.m.data[f.callPath].endReason).toBe('consultation_closed');
  }
});
test.each([1, 2, 3, 4])('acceptance failure after write %s rolls back answer/state/both receipts', async failAfterWrite => {
  const f = await ringing(), before = JSON.stringify(f.m.data); f.m.failAfterWrite = failAfterWrite;
  await denied(f.m.lifecycle.respond(request(f.recipient, f.accept)), 'internal'); expect(JSON.stringify(f.m.data)).toBe(before);
});
test('retry refreshes time after abandoned acceptance; no partial answer persists', async () => {
  const f = await ringing(); f.m.forceRetries = 1; f.m.beforeCommit = () => { f.m.time = Timestamp.fromMillis(start + 60000); };
  await denied(f.m.lifecycle.respond(request(f.recipient, f.accept)), 'failed-precondition'); expect(f.m.data[f.answerPath]).toBeUndefined(); expect(f.m.data[f.callPath].state).toBe('ended');
});
test('approval revocation at commit retries and denies without answer', async () => {
  const f = await ringing(); let first = true;
  f.m.beforeCommit = () => { if (first) { first = false; f.m.put('users/doctor', { ...f.m.data['users/doctor'], verificationStatus: 'rejected' }); } };
  await denied(f.m.lifecycle.respond(request(f.recipient, f.accept))); expect(f.m.data[f.answerPath]).toBeUndefined();
});
test.each([{ activeCallId: null }, { activeCallId: 'f'.repeat(64) }, { attemptCount: 2 }, { schemaVersion: 2 }])('corrupt control %# fails closed', async patch => {
  const f = await ringing(); Object.assign(f.m.data[callPaths.control(id)], patch); await denied(f.m.lifecycle.respond(request(f.recipient, f.accept))); expect(f.m.data[f.answerPath]).toBeUndefined();
});
test.each(['answer', 'answerReceipt', 'requestReceipt', 'offer', 'startReceipt'])('missing %s on accepted call is corrupt', async part => {
  const f = await accepted();
  f.m.remove(part === 'answer' ? f.answerPath : part === 'answerReceipt' ? f.answerReceiptPath : part === 'requestReceipt' ? f.responseReceiptPath
    : part === 'offer' ? callPaths.offer(id, f.callId) : callPaths.receipt(id, f.callId));
  await denied(f.m.lifecycle.respond(request(f.recipient, f.accept)));
});
test.each([{ senderId: 'patient' }, { sdp: 'v=0\ncorrupt\n' }, { type: 'offer' }, { createdAt: Timestamp.fromMillis(start) },
  { createdAt: { seconds: start / 1000, nanoseconds: 123456789 } }])('corrupt answer %# fails closed', async patch => {
  const f = await accepted(); Object.assign(f.m.data[f.answerPath], patch); await denied(f.m.lifecycle.get(request(f.initiator, f.get)));
});
test.each(['answerReceipt', 'requestReceipt'])('corrupt %s rejects replay', async kind => {
  const f = await accepted(); f.m.data[kind === 'answerReceipt' ? f.answerReceiptPath : f.responseReceiptPath].fingerprint = 'e'.repeat(64);
  await denied(f.m.lifecycle.respond(request(f.recipient, f.accept)));
});
test('orphan answer cannot be overwritten or accepted', async () => {
  const f = await ringing(); f.m.put(f.answerPath, { ...answer, senderId: f.recipient, createdAt: f.m.time, schemaVersion: 1 });
  await denied(f.m.lifecycle.respond(request(f.recipient, f.accept))); expect(f.m.data[f.callPath].state).toBe('ringing');
});
test('exact acceptance replay after expiry closes without regranting signaling or exposing SDP', async () => {
  const f = await accepted(), savedAnswer = JSON.stringify(f.m.data[f.answerPath]);
  f.m.time = Timestamp.fromMillis(deadline); f.m.data['users/patient'].status = 'disabled'; f.m.remove('doctorPublicProfiles/doctor');
  const retry = await f.m.lifecycle.respond(request(f.recipient, f.accept));
  expect(retry).toMatchObject({ replayed: true, call: { state: 'ended', endReason: 'expired' } });
  expect(JSON.stringify(f.m.data[f.answerPath])).toBe(savedAnswer); expect(f.m.data[path].state).toBe('closed'); expect(f.m.data[callPaths.control(id)].attemptCount).toBe(1);
});
test('recipient rejection and initiator cancellation are idempotent and never create answers', async () => {
  for (const operation of ['reject', 'cancel']) {
    const f = await ringing();
    const perform = () => operation === 'reject' ? f.m.lifecycle.respond(request(f.recipient, { ...f.mutation, action: 'reject' })) : f.m.lifecycle.end(request(f.initiator, f.mutation));
    const first = await perform(), retry = await perform();
    expect(first.call.endReason).toBe(operation === 'reject' ? 'rejected' : 'cancelled'); expect(retry).toEqual({ ...first, replayed: true });
    expect(f.m.data[f.answerPath]).toBeUndefined(); expect(f.m.data[path].state).toBe('active'); expect(f.m.data[callPaths.control(id)].activeCallId).toBeNull();
  }
});
test.each(['patient', 'doctor'])('%s can hang up accepted call despite approval loss; terminal state never reopens', async uid => {
  const f = await accepted(); f.m.data['users/doctor'].verificationStatus = 'rejected';
  const result = await f.m.lifecycle.end(request(uid, f.mutation)); expect(result.call.endReason).toBe('hangup');
  expect((await f.m.lifecycle.end(request(uid, f.mutation))).replayed).toBe(true);
  await denied(f.m.lifecycle.respond(request(f.recipient, { ...f.accept, requestId: thirdId })), 'failed-precondition');
  expect(f.m.data[path].state).toBe('active');
});
test('wrong rejection/cancellation direction denied', async () => {
  const f = await ringing(); await denied(f.m.lifecycle.respond(request(f.initiator, { ...f.mutation, action: 'reject' })));
  await denied(f.m.lifecycle.end(request(f.recipient, f.mutation)));
});
test.each(['reject', 'cancel'])('concurrent accept versus %s preserves a legal serial outcome', async action => {
  const f = await ringing();
  const results = await Promise.allSettled([f.m.lifecycle.respond(request(f.recipient, f.accept)), action === 'reject'
    ? f.m.lifecycle.respond(request(f.recipient, { ...f.mutation, requestId: thirdId, action: 'reject' }))
    : f.m.lifecycle.end(request(f.initiator, f.mutation))]);
  expect(results.some(r => r.status === 'fulfilled')).toBe(true);
  const stored = f.m.data[f.callPath];
  if (stored.acceptedAt) { expect(f.m.data[f.answerPath]).toBeDefined(); expect(['accepted', 'ended']).toContain(stored.state); if (stored.state === 'ended') expect(stored.endReason).toBe('hangup'); }
  else { expect(stored.endReason).toBe(action === 'reject' ? 'rejected' : 'cancelled'); expect(f.m.data[f.answerPath]).toBeUndefined(); }
});
test('get supports current pointer and explicit history; no current call returns null', async () => {
  const m = memory(); expect(await m.lifecycle.get(request('patient', { consultationId: id }))).toEqual({ call: null });
  const f = await ringing(); expect((await f.m.lifecycle.get(request(f.recipient, { consultationId: id }))).call!.callId).toBe(f.callId);
  await f.m.lifecycle.end(request(f.initiator, f.mutation));
  expect(await f.m.lifecycle.get(request(f.initiator, { consultationId: id }))).toEqual({ call: null });
  expect((await f.m.lifecycle.get(request(f.initiator, f.get))).call!.state).toBe('ended');
});
test('history request for old call cannot clear a newer active pointer', async () => {
  const f = await ringing(); await f.m.lifecycle.end(request(f.initiator, f.mutation));
  const next = await f.m.handler(request('patient', input({ requestId: thirdId })));
  await f.m.lifecycle.get(request(f.initiator, f.get));
  await f.m.lifecycle.end(request(f.initiator, f.mutation)); // old exact replay
  expect(f.m.data[callPaths.control(id)].activeCallId).toBe(next.call.callId);
});
test('history get reconciles stale current pointer and consultation without answer delivery', async () => {
  const f = await accepted(); f.m.time = Timestamp.fromMillis(deadline);
  const result = await f.m.lifecycle.get(request(f.initiator, f.get)); expect(result.call!.endReason).toBe('expired');
  expect(f.m.data[callPaths.control(id)].activeCallId).toBeNull(); expect(f.m.data[path].state).toBe('closed'); expect(Object.keys(result)).toEqual(['call']);
});
test.each([1, 2, 3])('retrieval closure failure after write %s rolls back all changes', async failAfterWrite => {
  const f = await accepted(), before = JSON.stringify(f.m.data); f.m.time = Timestamp.fromMillis(deadline); f.m.failAfterWrite = failAfterWrite;
  await denied(f.m.lifecycle.get(request(f.initiator, f.get)), 'internal'); expect(JSON.stringify(f.m.data)).toBe(before);
});
test('get/end deny unrelated/admin/disabled callers', async () => {
  const f = await accepted();
  for (const uid of ['other', 'administrator']) {
    f.m.put('users/' + uid, identity(uid, uid === 'other' ? 'patient' : uid));
    await denied(f.m.lifecycle.get(request(uid, f.get))); await denied(f.m.lifecycle.end(request(uid, f.mutation)));
  }
  f.m.data['users/patient'].status = 'disabled'; await denied(f.m.lifecycle.get(request('patient', f.get)));
});
test('store failures are sanitized and never log answer SDP', async () => {
  const f = await ringing(), spies = [jest.spyOn(console, 'log'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'error')];
  try {
    f.m.onRead = () => { throw new Error(answer.sdp); };
    const error = await f.m.lifecycle.respond(request(f.recipient, f.accept)).catch(e => e);
    expect(error.code).toBe('internal'); expect(error.message).not.toContain(answer.sdp); spies.forEach(spy => expect(spy).not.toHaveBeenCalled());
  } finally { spies.forEach(spy => spy.mockRestore()); }
});
