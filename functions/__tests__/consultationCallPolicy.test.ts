import { planStartCall, planCallAction, planGetCall, planIceEligibility, makeReceipt, type CallContext, type StartState } from '../src/consultations/calls/policy';
import { documents, id, start, end, deadline, identity, terminal } from './consultationFixtures';
import { fromMilliseconds as t } from '../src/scheduling/primitives';
import type { ConsultationCall } from '../../shared/types/consultationCallContracts';
const requestId = '12345678-1234-4234-8234-123456789abc';
const input = { consultationId: id, requestId, mode: 'audio', offer: { type: 'offer', sdp: 'v=0\r\ns=synthetic\r\n' } };
const empty = (): StartState => ({ attemptCount: 0, activeCallId: null, activeCall: null, existingCall: null, receipt: null });
function context(uid = 'patient', now = start): CallContext {
  const d = documents();
  return { uid, now: t(now), appointment: d['appointments/' + id], consultation: { consultationId: id, appointmentId: id, patientId: 'patient', doctorId: 'doctor',
    appointmentStartAt: t(start), appointmentEndAt: t(end), state: 'active', createdAt: t(start), closedAt: null, schemaVersion: 1 },
    actors: { caller: d['users/' + uid], patient: d['users/patient'], doctor: d['users/doctor'] },
    approval: { profile: d['doctorProfiles/doctor'], projection: d['doctorPublicProfiles/doctor'], source: d['verificationRequests/approved'] } };
}
const opened = () => planStartCall(context(), input, empty()).call!;
const mutation = (call = opened()) => ({ consultationId: id, callId: call.callId, requestId });
const answer = { type: 'answer', sdp: 'v=0\r\ns=answer\r\n' };
const accept = (call = opened()) => ({ ...mutation(call), action: 'accept', answer });
const accepted = () => planCallAction(context('doctor', start + 1), opened(), 'respond', accept()).call;
const ice = (call: ConsultationCall) => ({ ...mutation(call), candidates: [{ candidate: 'candidate:1 1 UDP 1 192.0.2.1 1234 typ host', sdpMid: '0', sdpMLineIndex: 0 }] });

test.each(['patient', 'doctor'])('%s initiates with authoritative immutable bindings', uid => {
  const c = context(uid), before = JSON.stringify(c), result = planStartCall(c, input, empty());
  expect(result.error).toBeNull(); expect(result.create).toBe(true); expect(result.attemptCount).toBe(1);
  expect(result.call).toMatchObject({ initiatorId: uid, recipientId: uid === 'patient' ? 'doctor' : 'patient', mode: 'audio', state: 'ringing' });
  expect(result.call!.ringExpiresAt).toEqual(t(start + 60000)); expect(JSON.stringify(c)).toBe(before);
});
test.each(['administrator', 'unrelated', 'claim-only', 'disabled', 'uid-spoof'])('denies %s caller', kind => {
  const c = context();
  c.actors = { ...c.actors, caller: kind === 'administrator' ? identity('patient', 'administrator') : kind === 'unrelated' ? identity('other', 'patient')
    : kind === 'claim-only' ? { uid: 'patient', role: 'patient' } : kind === 'disabled' ? identity('patient', 'patient', { status: 'disabled' }) : c.actors.caller };
  if (kind === 'uid-spoof') c.uid = 'other';
  expect(() => planStartCall(c, input, empty())).toThrow('permission-denied');
});
test.each(['patient-disabled', 'doctor-disabled', 'approval-lost', 'profile', 'projection', 'request', 'source-binding'])('new/live operations fail closed for %s', kind => {
  const c = context('doctor', start + 2);
  if (kind === 'patient-disabled') c.actors = { ...c.actors, patient: identity('patient', 'patient', { status: 'disabled' }) };
  if (kind === 'doctor-disabled') c.actors = { ...c.actors, doctor: identity('doctor', 'doctor', { status: 'disabled' }) };
  if (kind === 'approval-lost') c.actors = { ...c.actors, doctor: identity('doctor', 'doctor', { verificationStatus: 'pending' }) };
  if (kind === 'profile') c.approval.profile = null;
  if (kind === 'projection') c.approval.projection = null;
  if (kind === 'request') c.approval.source = null;
  if (kind === 'source-binding') c.approval.source = { ...c.approval.source!, doctorUid: 'other' };
  expect(planStartCall(c, input, empty()).error).toBe('permission-denied');
  expect(planCallAction(c, opened(), 'respond', accept()).error).toBe('permission-denied');
  expect(planIceEligibility(c, accepted(), ice(accepted())).error).toBe('permission-denied');
});
test('history and safe termination survive counterpart disability/approval loss', () => {
  const c = context('patient', start + 2); c.actors = { ...c.actors, doctor: null }; c.approval = { profile: null, projection: null, source: null };
  expect(planGetCall(c, accepted()).error).toBeNull();
  expect(planCallAction(c, accepted(), 'end', mutation(accepted())).call.endReason).toBe('hangup');
});
test.each([{ consultationId: 'd'.repeat(64) }, { patientId: 'other' }, { appointmentId: 'd'.repeat(64) }, { expiresAt: t(deadline + 1) }, { createdAt: t(start - 1) }])('corrupt call binding denied %#', patch => {
  expect(() => planGetCall(context(), { ...opened(), ...patch })).toThrow('permission-denied');
});
test('cross-consultation input denied', () => {
  expect(() => planCallAction(context('doctor'), opened(), 'respond', { ...accept(), consultationId: 'd'.repeat(64) })).toThrow('permission-denied');
});
test('recipient accepts with preserved immutable fields and no consultation mutation', () => {
  const c = opened(), p = planCallAction(context('doctor', start + 1), c, 'respond', accept(c));
  expect(p.call).toEqual({ ...c, state: 'accepted', acceptedAt: t(start + 1) }); expect(p.writeConsultation).toBe(false);
});
test('recipient rejects and initiator cancels', () => {
  expect(planCallAction(context('doctor'), opened(), 'respond', { ...mutation(), action: 'reject' }).call.endReason).toBe('rejected');
  expect(planCallAction(context(), opened(), 'end', mutation()).call.endReason).toBe('cancelled');
});
test.each(['patient', 'doctor'])('%s hangs up accepted call', uid => {
  expect(planCallAction(context(uid, start + 2), accepted(), 'end', mutation(accepted())).call.endReason).toBe('hangup');
});
test('illegal actors and repeated transitions denied', () => {
  expect(planCallAction(context(), opened(), 'respond', accept()).error).toBe('permission-denied');
  expect(planCallAction(context('doctor'), opened(), 'end', mutation()).error).toBe('permission-denied');
  expect(planCallAction(context('doctor', start + 2), accepted(), 'respond', accept()).error).toBe('failed-precondition');
  const ended = planCallAction(context(), opened(), 'end', mutation()).call;
  const p = planCallAction(context('doctor', start + 2), ended, 'respond', accept());
  expect(p.error).toBe('failed-precondition'); expect(p.call).toEqual(ended); expect(p.writeCall).toBe(false);
});
test('ring timeout exact nanosecond boundary and deterministic late reconciliation', () => {
  const c = opened(), before = context(); before.now = { seconds: c.ringExpiresAt.seconds - 1, nanoseconds: 999999999 };
  expect(planGetCall(before, c).call.state).toBe('ringing');
  for (const now of [start + 60000, start + 120000]) {
    const p = planGetCall(context('patient', now), c); expect(p.call.endReason).toBe('ring_timeout'); expect(p.call.endedAt).toEqual(c.ringExpiresAt);
  }
});
test('ring capped by expiry; tie resolves as expiry', () => {
  const c = planStartCall(context('patient', deadline - 1), input, empty()).call!;
  expect(c.ringExpiresAt).toEqual(t(deadline)); expect(planGetCall(context('patient', deadline), c).call.endReason).toBe('expired');
});
test('accepted expiry persists consultation and call reconciliation despite rejected ICE', () => {
  const p = planIceEligibility(context('patient', deadline), accepted(), ice(accepted()));
  expect(p.error).toBe('failed-precondition'); expect(p.call.endReason).toBe('expired'); expect(p.writeCall).toBe(true); expect(p.writeConsultation).toBe(true);
});
test.each(['completed', 'no_show'] as const)('terminal %s appointment closes accepted call at authoritative time', status => {
  const c = context('patient', end + 1), d = documents(); terminal(d, status, end); c.appointment = d['appointments/' + id];
  const p = planGetCall(c, accepted()); expect(p.call.endReason).toBe('consultation_closed'); expect(p.call.endedAt).toEqual(t(end));
});
test('already closed consultation closes call; already ended call never rewrites first end', () => {
  const c = context('patient', end); c.consultation = { ...(c.consultation as object), state: 'closed', closedAt: t(end) };
  expect(planGetCall(c, accepted()).call.endReason).toBe('consultation_closed');
  const ended = planCallAction(context(), opened(), 'end', mutation()).call;
  expect(planGetCall(c, ended).call).toEqual(ended);
});
test('pre-start and backwards clock corruption denied', () => {
  expect(() => planStartCall(context('patient', start - 1), input, empty())).toThrow('permission-denied');
  expect(() => planGetCall(context(), accepted())).toThrow('permission-denied');
});
test('one active call blocks another; stale timed-out pointer closes before replacement', () => {
  const call = opened(), state = { ...empty(), attemptCount: 1, activeCallId: call.callId, activeCall: call };
  const next = { ...input, requestId: '22345678-1234-4234-8234-123456789abc' };
  expect(planStartCall(context(), next, state).error).toBe('failed-precondition');
  const p = planStartCall(context('patient', start + 60000), next, state);
  expect(p.create).toBe(true); expect(p.attemptCount).toBe(2); expect(p.previous!.call.endReason).toBe('ring_timeout'); expect(p.previous!.writeCall).toBe(true);
});
test.each([-1, 0.5, 9, NaN])('invalid counter %s denied', attemptCount => {
  expect(() => planStartCall(context(), input, { ...empty(), attemptCount })).toThrow('permission-denied');
});
test('eighth creation allowed; ninth rejected without increment', () => {
  expect(planStartCall(context(), input, { ...empty(), attemptCount: 7 }).attemptCount).toBe(8);
  const p = planStartCall(context(), input, { ...empty(), attemptCount: 8 }); expect(p.error).toBe('resource-exhausted'); expect(p.attemptCount).toBe(8);
});
test('missing/mismatched pointer is corruption, ended pointer permits replacement', () => {
  expect(() => planStartCall(context(), input, { ...empty(), activeCallId: opened().callId })).toThrow('permission-denied');
  const ended = planCallAction(context(), opened(), 'end', mutation()).call;
  expect(planStartCall(context(), { ...input, requestId: '22345678-1234-4234-8234-123456789abc' }, { ...empty(), attemptCount: 1, activeCallId: ended.callId, activeCall: ended }).create).toBe(true);
});
test('start replay returns reconciled metadata, never creates or consumes an attempt', () => {
  const call = opened(), state = { attemptCount: 1, activeCallId: call.callId, activeCall: call, existingCall: call, receipt: makeReceipt('start', 'patient', input) };
  const p = planStartCall(context('patient', deadline), input, state);
  expect(p.replayed).toBe(true); expect(p.create).toBe(false); expect(p.attemptCount).toBe(1); expect(p.call!.state).toBe('ended');
  expect(p.previous!.writeCall).toBe(true); expect(p.writeConsultation).toBe(true);
  expect(planStartCall(context(), { ...input, mode: 'video' }, state).error).toBe('already-exists');
});
test.each(['accept', 'reject', 'cancel', 'hangup'])('%s exact replay acknowledges original operation without reapplying transition', action => {
  const uid = action === 'accept' || action === 'reject' ? 'doctor' : 'patient';
  const call = action === 'hangup' ? accepted() : opened();
  const op = action === 'accept' || action === 'reject' ? 'respond' : 'end';
  const data = action === 'accept' ? accept(call) : action === 'reject' ? { ...mutation(call), action: 'reject' } : mutation(call);
  const first = planCallAction(context(uid, start + 2), call, op, data);
  const retry = planCallAction(context(uid, deadline), first.call, op, data, makeReceipt(op, uid, data));
  expect(retry.replayed).toBe(true); expect(retry.error).toBeNull(); expect(retry.call.state).toBe('ended');
});
test('changed answer retry conflicts; actor-bound receipt cannot be borrowed', () => {
  const receipt = makeReceipt('respond', 'doctor', accept());
  expect(planCallAction(context('doctor', start + 2), accepted(), 'respond', { ...accept(), answer: { ...answer, sdp: 'v=0\nchanged\n' } }, receipt).error).toBe('already-exists');
  expect(planCallAction(context('patient', start + 2), accepted(), 'respond', accept(), receipt).error).toBe('permission-denied');
});
test.each(['patient', 'doctor'])('ICE uses backend %s and requires accepted live call', uid => {
  const c = context(uid, start + 2), call = accepted();
  expect(planIceEligibility(c, call, ice(call))).toMatchObject({ senderId: uid, error: null });
  expect(planIceEligibility(c, opened(), ice(opened())).error).toBe('failed-precondition');
  const ended = planCallAction(c, call, 'end', mutation(call)).call;
  expect(planIceEligibility(c, ended, ice(ended)).error).toBe('failed-precondition');
});
test.each(['revision', 'reviewer', 'publishedAt', 'professional', 'sourceState', 'activeRequest'])('complete approval binding rejects %s corruption', field => {
  const c = context();
  if (field === 'revision') c.approval.projection = { ...(c.approval.projection as object), approvedRevision: 3 };
  if (field === 'reviewer' && c.approval.source?.state === 'approved') c.approval.source = { ...c.approval.source, reviewerUid: 'doctor' };
  if (field === 'publishedAt') c.approval.projection = { ...(c.approval.projection as object), publishedAt: t(start) };
  if (field === 'professional') c.approval.profile = { ...c.approval.profile!, specialty: 'Different' };
  if (field === 'sourceState') c.approval.source = { ...c.approval.source!, state: 'pending' } as any;
  if (field === 'activeRequest') c.approval.profile = { ...c.approval.profile!, activeRequestId: 'another' };
  expect(planStartCall(c, input, empty()).error).toBe('permission-denied');
});
test('late acceptance denial retains closure, even without current approval', () => {
  const c = context('doctor', deadline); c.approval.profile = null;
  const p = planCallAction(c, opened(), 'respond', accept());
  expect(p.error).toBe('failed-precondition'); expect(p.writeCall).toBe(true); expect(p.writeConsultation).toBe(true);
  expect(p.call.endReason).toBe('ring_timeout');
});
test('corrupt success receipt cannot accept a still-ringing aggregate', () => {
  const p = planCallAction(context('doctor'), opened(), 'respond', accept(), makeReceipt('respond', 'doctor', accept()));
  expect(p.error).toBe('permission-denied'); expect(p.writeCall).toBe(false);
});
test('start snapshot inconsistency fails closed', () => {
  const call = opened();
  expect(() => planStartCall(context(), input, { attemptCount: 1, activeCallId: call.callId, activeCall: { ...call, mode: 'video' },
    existingCall: call, receipt: makeReceipt('start', 'patient', input) })).toThrow('permission-denied');
});
test('malformed request produces sanitized invalid-argument, never payload', () => {
  expect(() => planStartCall(context(), { ...input, uid: 'spoof' }, empty())).toThrow('invalid-argument');
  expect(() => planIceEligibility(context(), opened(), { ...ice(opened()), senderId: 'spoof' })).toThrow('invalid-argument');
});
