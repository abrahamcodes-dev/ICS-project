import { createHash } from 'crypto';
import { consultationId, messageId, normalizeMessageText, validateAppointmentProjection, validateConsultation,
  validateMessage, validateOpenInput, validateSendInput, validateSendState } from '../src/consultations/domain';
import { authorizeHistory, authorizeNew, assertSendWindow, planOpen, planRate, planSend, reconcileConsultation } from '../src/consultations/policy';
import { fromMilliseconds as t } from '../src/scheduling/primitives';
import type { ConsultationAppointment } from '../../shared/types/consultationContracts';
const id = 'a'.repeat(64), other = 'b'.repeat(64), uuid = '12345678-1234-4234-8234-123456789abc';
const start = Date.parse('2026-10-05T10:00:00Z'), end = start + 1800000, deadline = end + 900000;
const appointment: ConsultationAppointment = { appointmentId: id, patientId: 'patient', doctorId: 'doctor', startAt: t(start), endAt: t(end), status: 'scheduled' };
const identity = (uid: string, role: string, patch = {}) => ({ uid, role, email: 'synthetic@example.test', fullName: 'Synthetic', status: 'active',
  schemaVersion: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  ...(role === 'doctor' ? { verificationStatus: 'approved' } : {}), ...patch });
const patient = identity('patient', 'patient'), doctor = identity('doctor', 'doctor');
const actors = { caller: patient, patient, doctor };
const room = () => planOpen({ appointmentId: id }, appointment, null, actors, t(start)).consultation;
const request = { consultationId: id, messageRequestId: uuid, text: 'hello' };
const send = (time = start, input: unknown = request, message: unknown = null, rate: unknown = null, who = actors, a = appointment, c: unknown = room()) =>
  planSend(input, a, c, message, rate, who, t(time));

describe('consultation contract and opening', () => {
  test('deterministic creation and exact open preserve immutable timestamp and freeze output', () => {
    expect(consultationId(id)).toBe(id);
    const first = room();
    expect(first).toEqual({ consultationId: id, appointmentId: id, patientId: 'patient', doctorId: 'doctor',
      appointmentStartAt: t(start), appointmentEndAt: t(end), state: 'active', createdAt: t(start), closedAt: null, schemaVersion: 1 });
    expect(planOpen({ appointmentId: id }, appointment, first, actors, t(start + 1234))).toEqual({ action: 'return', consultation: first });
    expect(Object.isFrozen(first)).toBe(true); expect(Object.isFrozen(first.createdAt)).toBe(true);
  });
  test.each([{ consultationId: other }, { patientId: 'doctor' }, { doctorId: '../bad' }, { appointmentEndAt: t(start) },
    { state: 'completed' }, { state: 'closed' }, { schemaVersion: 2 }, { createdAt: t(start - 1) }, { createdAt: t(deadline) },
    { closedAt: t(end) }, { mode: 'chat' }, { paymentStatus: 'paid' }, { appointmentStartAt: '2026-10-05' }])('reject corrupt consultation %#', patch => {
    expect(() => validateConsultation({ ...room(), ...patch })).toThrow();
  });
  test.each(['consultationId', 'appointmentId', 'patientId', 'doctorId', 'appointmentStartAt', 'appointmentEndAt', 'state', 'createdAt', 'closedAt', 'schemaVersion'])('missing %s fails', field => {
    const c: any = { ...room() }; delete c[field]; expect(() => validateConsultation(c)).toThrow();
  });
  test.each([{ appointmentId: other }, { doctorId: 'other' }, { startAt: t(start - 1) }, { endAt: t(end + 1) }])('binding %# fails', patch => {
    expect(() => planOpen({ appointmentId: id }, { ...appointment, ...patch }, room(), actors, t(start))).toThrow();
  });
  test.each([{}, { appointmentId: id, patientId: 'patient' }, { appointmentId: 'wrong' }, null, []])('strict open input %#', value => {
    expect(() => validateOpenInput(value)).toThrow();
  });
  test.each([{ patientId: 'doctor' }, { patientId: '' }, { doctorId: 'bad/id' }, { endAt: t(start) }, { startAt: t(end + 1) },
    { status: 'booked' }, { extra: true }, { startAt: { seconds: 1, nanoseconds: -1 } }])('projection invalid %#', patch => {
    expect(() => validateAppointmentProjection({ ...appointment, ...patch })).toThrow();
  });
  test.each(['scheduled', 'cancelled', 'completed', 'no_show'] as const)('projection accepts %s', status => {
    expect(validateAppointmentProjection({ ...appointment, status }).status).toBe(status);
  });
  test('timestamp deadline overflow fails', () => {
    expect(() => validateAppointmentProjection({ ...appointment, endAt: { seconds: 253402300799, nanoseconds: 0 } })).toThrow();
  });
});
describe('window and closure', () => {
  test.each([[start - 1, false], [start, true], [start + 1, true], [end, true], [end + 1, true], [deadline - 1, true], [deadline, false], [deadline + 1, false]])('window %p -> %p', (ms, eligible) => {
    const work = () => assertSendWindow(appointment, t(ms as number));
    if (eligible) expect(work).not.toThrow(); else expect(work).toThrow();
  });
  test.each(['cancelled', 'completed', 'no_show'] as const)('terminal %s overrides grace', status => {
    const a = { ...appointment, status };
    expect(() => assertSendWindow(a, t(end + 1))).toThrow();
    expect(() => planOpen({ appointmentId: id }, a, null, actors, t(end + 1))).toThrow();
    expect(() => send(end + 1, request, null, null, actors, a)).toThrow();
  });
  test('expiry closes at deadline, late observation does not move it; no reopen', () => {
    const closed = reconcileConsultation(room(), appointment, t(deadline + 1234));
    expect(closed.closedAt).toEqual(t(deadline));
    expect(planOpen({ appointmentId: id }, appointment, closed, actors, t(deadline + 5000))).toEqual({ action: 'return', consultation: closed });
    expect(() => send(deadline + 5000, request, null, null, actors, appointment, closed)).toThrow();
  });
  test('terminal decision uses earlier authoritative time and expiry wins when earlier', () => {
    const a = { ...appointment, status: 'completed' as const };
    expect(reconcileConsultation(room(), a, t(deadline + 1000), { terminalDecisionAt: t(end + 10) }).closedAt).toEqual(t(end + 10));
    expect(reconcileConsultation(room(), a, t(deadline + 1000), { terminalDecisionAt: t(deadline + 1) }).closedAt).toEqual(t(deadline));
  });
  test('fallback first trusted observation is stable once persisted', () => {
    const a = { ...appointment, status: 'no_show' as const };
    const closed = reconcileConsultation(room(), a, t(end + 100));
    expect(closed.closedAt).toEqual(t(end + 100));
    expect(reconcileConsultation(closed, a, t(end + 200))).toEqual(closed);
    expect(reconcileConsultation(closed, appointment, t(end + 200))).toEqual(closed);
  });
  test.each([t(start - 1), t(end - 1), t(deadline + 1)])('invalid terminal metadata %#', terminalDecisionAt => {
    expect(() => reconcileConsultation(room(), { ...appointment, status: 'completed' }, t(end), { terminalDecisionAt })).toThrow();
  });
  test('scheduled terminal metadata and backwards clock fail', () => {
    expect(() => reconcileConsultation(room(), appointment, t(end), { terminalDecisionAt: t(end) })).toThrow();
    expect(() => reconcileConsultation(room(), appointment, t(start - 1))).toThrow();
  });
  test('nanosecond boundaries are not rounded', () => {
    expect(() => assertSendWindow(appointment, { seconds: deadline / 1000 - 1, nanoseconds: 999999999 })).not.toThrow();
    expect(() => assertSendWindow(appointment, { seconds: start / 1000 - 1, nanoseconds: 999999999 })).toThrow();
  });
});
describe('canonical identity policy', () => {
  test.each([patient, doctor])('participant %#', caller => {
    expect(authorizeNew(appointment, { ...actors, caller })).toBe(caller.uid);
    expect(authorizeHistory(appointment, caller)).toBe(caller.uid);
  });
  test.each([identity('other', 'patient'), identity('other', 'doctor'), identity('patient', 'administrator'),
    identity('patient', 'admin'), identity('patient', 'patient', { status: 'disabled' }), { uid: 'patient', token: { role: 'patient' } },
    null, { ...patient, schemaVersion: 2 }])('unauthorized %#', caller => {
    expect(() => authorizeHistory(appointment, caller)).toThrow();
    expect(() => authorizeNew(appointment, { ...actors, caller })).toThrow();
  });
  test.each(['pending', 'rejected'])('approval loss %s blocks new sends but retains history', verificationStatus => {
    const d = identity('doctor', 'doctor', { verificationStatus });
    expect(authorizeHistory(appointment, d)).toBe('doctor');
    expect(() => authorizeNew(appointment, { ...actors, doctor: d })).toThrow();
    expect(() => authorizeNew(appointment, { ...actors, caller: d, doctor: d })).toThrow();
    expect(planOpen({ appointmentId: id }, appointment, room(), { ...actors, caller: d, doctor: d }, t(end)).action).toBe('return');
  });
  test.each(['patient', 'doctor'])('disabled counterpart %s', role => {
    const caller = role === 'patient' ? doctor : patient;
    const a = { ...actors, caller, [role]: identity(role, role, { status: 'disabled' }) };
    expect(authorizeHistory(appointment, caller)).toBe(caller.uid);
    expect(() => authorizeNew(appointment, a)).toThrow();
  });
  test('same UID wrong canonical role and inconsistent caller snapshots fail', () => {
    expect(() => authorizeHistory(appointment, identity('patient', 'doctor'))).toThrow();
    expect(() => authorizeNew(appointment, { ...actors, caller: { ...patient, fullName: 'Changed' } })).toThrow();
  });
});
describe('message validation and IDs', () => {
  test.each([['  hello  ', 'hello'], ['a\r\nb\rc', 'a\nb\nc'], ['a  b\tc\nd', 'a  b\tc\nd'], ['\n\ttext\n', 'text'],
    ['\u12a0\u121b\u122d\u129b \u4e2d\u6587 \ud83d\ude00', '\u12a0\u121b\u122d\u129b \u4e2d\u6587 \ud83d\ude00'], ['<b>plain</b>', '<b>plain</b>']])('normalize %#', (raw, expected) => {
    expect(normalizeMessageText(raw)).toBe(expected);
  });
  test.each([null, 42, {}, '', ' \t\r\n ', 'a'.repeat(4001), ' '.repeat(16000) + 'a', '\ud800', '\udc00', 'x\ud800y'])('invalid text %#', raw => {
    expect(() => normalizeMessageText(raw)).toThrow();
  });
  test.each([...Array.from({ length: 32 }, (_, i) => i).filter(i => ![9, 10, 13].includes(i)), 127])('control %p rejected even at trim edge', code => {
    expect(() => normalizeMessageText(String.fromCharCode(code) + 'ok')).toThrow();
  });
  test('inclusive size limits count UTF16', () => {
    expect(normalizeMessageText(' '.repeat(12000) + 'a'.repeat(4000))).toHaveLength(4000);
    expect(normalizeMessageText('\ud83d\ude00'.repeat(2000))).toHaveLength(4000);
    expect(() => normalizeMessageText('\ud83d\ude00'.repeat(2001))).toThrow();
  });
  test.each([{ ...request, senderId: 'doctor' }, { ...request, senderRole: 'doctor' }, { ...request, createdAt: t(start) },
    { ...request, messageRequestId: uuid.toUpperCase() }, { ...request, messageRequestId: 'not-uuid' },
    { ...request, messageRequestId: '12345678-1234-0234-8234-123456789abc' }, { ...request, messageRequestId: '12345678-1234-4234-7234-123456789abc' }])('strict input %#', value => {
    expect(() => validateSendInput(value)).toThrow();
  });
  test('ID exact tuple and sender/room isolation', () => {
    const expected = createHash('sha256').update(JSON.stringify([id, 'patient', uuid])).digest('hex');
    expect(messageId(id, 'patient', uuid)).toBe(expected);
    expect(messageId(id, 'doctor', uuid)).not.toBe(expected);
    expect(messageId(other, 'patient', uuid)).not.toBe(expected);
  });
  test.each([{ senderRole: 'patient' }, { type: 'video' }, { schemaVersion: 2 }, { text: ' hello ' }, { messageId: 'bad' }, { senderId: '/' }, { createdAt: 'now' }])('invalid stored message %#', patch => {
    expect(() => validateMessage({ ...send().message, ...patch })).toThrow();
  });
});
describe('replay and private rate policy', () => {
  test('first send; exact replay after expiry and approval loss does not consume rate', () => {
    const first = send();
    expect(first.action).toBe('create'); expect(first.rateState?.lastAcceptedAt).toEqual(t(start));
    const result = send(deadline + 1, { ...request, text: ' hello\r\n' }, first.message, first.rateState,
      { ...actors, doctor: identity('doctor', 'doctor', { verificationStatus: 'rejected' }) });
    expect(result).toEqual({ action: 'replay', message: first.message, rateState: null });
  });
  test('replay after terminal transition preserves message; disabled caller denied', () => {
    const first = send();
    expect(send(end, request, first.message, null, actors, { ...appointment, status: 'completed' }).action).toBe('replay');
    expect(() => send(end, request, first.message, null, { ...actors, caller: identity('patient', 'patient', { status: 'disabled' }) })).toThrow();
  });
  test.each([{ text: 'changed' }, { senderId: 'doctor' }, { messageId: other }, { createdAt: t(start - 1) }, { createdAt: t(deadline) }])('corrupt/conflicting replay %#', patch => {
    expect(() => send(deadline + 1, request, { ...send().message, ...patch })).toThrow();
  });
  test.each([0, 1, 999])('new send within %p ms rejected without advancing state', elapsed => {
    const first = send(), before = JSON.stringify(first.rateState);
    expect(() => send(start + elapsed, { ...request, messageRequestId: '22345678-1234-4234-8234-123456789abc' }, null, first.rateState)).toThrow();
    expect(JSON.stringify(first.rateState)).toBe(before);
  });
  test('exactly 1000ms accepted; independent sender and room have independent states', () => {
    const state = send().rateState;
    expect(planRate(id, 'patient', state, t(start + 1000)).lastAcceptedAt).toEqual(t(start + 1000));
    expect(planRate(id, 'doctor', null, t(start)).senderId).toBe('doctor');
    expect(planRate(other, 'patient', null, t(start)).consultationId).toBe(other);
    expect(() => planRate(other, 'patient', state, t(start + 1000))).toThrow();
    expect(() => planRate(id, 'doctor', state, t(start + 1000))).toThrow();
  });
  test('submillisecond rate boundary and clock regression', () => {
    const state = planRate(id, 'patient', null, { seconds: start / 1000, nanoseconds: 1 });
    expect(() => planRate(id, 'patient', state, t(start + 1000))).toThrow();
    expect(planRate(id, 'patient', state, { seconds: start / 1000 + 1, nanoseconds: 1 })).toBeDefined();
    expect(() => planRate(id, 'patient', state, t(start - 1))).toThrow();
  });
  test('rejected policy does not mutate inputs; output timestamps are copied', () => {
    const time = t(start), state = planRate(id, 'patient', null, time);
    expect(state.lastAcceptedAt).not.toBe(time); expect(Object.isFrozen(state.lastAcceptedAt)).toBe(true);
    const before = JSON.stringify(appointment);
    expect(() => send(deadline)).toThrow(); expect(JSON.stringify(appointment)).toBe(before);
  });
  test.each([{ schemaVersion: 2 }, { senderId: '/' }, { consultationId: 'bad' }, { lastAcceptedAt: null }, { extra: true }])('malformed rate state %#', patch => {
    expect(() => validateSendState({ ...send().rateState, ...patch })).toThrow();
  });
});
