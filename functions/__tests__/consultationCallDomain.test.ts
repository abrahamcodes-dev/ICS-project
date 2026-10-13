import { DomainValidationError } from '../src/profiles/domainValidation';
import { CALL_LIMITS, callId, validateCall, validateDescriptionInput, validateIceInput, validateStoredCandidate,
  validateStoredDescription, validateStartInput, validateRespondInput, validateEndInput, validateGetInput, validatePublishInput,
  validateMutationResult, validatePublishResult, validateGetResult } from '../src/consultations/calls/domain';

const cid = 'c'.repeat(64), rid = '12345678-1234-4234-8234-123456789abc';
const t = (seconds: number, nanoseconds = 123456789) => ({ seconds, nanoseconds });
const offer = { type: 'offer' as const, sdp: 'v=0\r\ns=synthetic\r\n' };
const ice = { candidate: 'candidate:1 1 UDP 1 192.0.2.1 1234 typ host', sdpMid: '0', sdpMLineIndex: 0 };
const mutation = { consultationId: cid, callId: callId(cid, 'patient', rid), requestId: rid };
const start = { consultationId: cid, requestId: rid, mode: 'audio', offer };
const room = () => ({ callId: mutation.callId, consultationId: cid, appointmentId: cid, patientId: 'patient', doctorId: 'doctor',
  initiatorId: 'patient', recipientId: 'doctor', mode: 'audio', state: 'ringing', createdAt: t(100), ringExpiresAt: t(160),
  expiresAt: t(1000), acceptedAt: null, endedAt: null, endReason: null, schemaVersion: 1 });

describe('C6A strict requests', () => {
  test('approved limits are explicit', () => {
    expect(CALL_LIMITS).toEqual({ ringSeconds: 60, sdpBytes: 65536, candidateBytes: 2048, candidatesPerBatch: 32,
      candidatesPerSender: 128, batchIntervalSeconds: 1, attemptsPerConsultation: 8 });
  });
  test.each(['audio', 'video'])('start preserves %s and immutable input', mode => {
    const result = validateStartInput({ ...start, mode });
    expect(result).toEqual({ ...start, mode }); expect(Object.isFrozen(result.offer)).toBe(true);
  });
  test.each(['senderId', 'patientId', 'doctorId', 'canSend', 'createdAt', 'state', 'schemaVersion', 'extra'])('start rejects client %s', field => {
    expect(() => validateStartInput({ ...start, [field]: 'forged' })).toThrow(DomainValidationError);
  });
  test.each([null, [], 'input', Object.create({ ...start }), { ...start, mode: 'voice' }, { ...start, requestId: rid.toUpperCase() },
    { ...start, consultationId: '../room' }, { ...start, requestId: 'not-uuid' }, { ...start, offer: { ...offer, type: 'answer' } }])('rejects malformed start %#', value => {
    expect(() => validateStartInput(value)).toThrow(DomainValidationError);
  });
  test('IDs are deterministic and caller/room/request bound', () => {
    expect(callId(cid, 'patient', rid)).toMatch(/^[a-f0-9]{64}$/);
    expect(callId(cid, 'patient', rid)).toBe(mutation.callId);
    expect(new Set([mutation.callId, callId(cid, 'doctor', rid), callId('d'.repeat(64), 'patient', rid),
      callId(cid, 'patient', '22345678-1234-4234-8234-123456789abc')]).size).toBe(4);
  });
  test('accept requires answer; reject forbids even an undefined answer', () => {
    expect(validateRespondInput({ ...mutation, action: 'accept', answer: { ...offer, type: 'answer' } }).action).toBe('accept');
    expect(validateRespondInput({ ...mutation, action: 'reject' }).action).toBe('reject');
    for (const data of [{ ...mutation, action: 'accept' }, { ...mutation, action: 'reject', answer: undefined }, { ...mutation, action: 'cancel' }]) {
      expect(() => validateRespondInput(data)).toThrow(DomainValidationError);
    }
  });
  test('end/get strict envelopes', () => {
    expect(validateEndInput(mutation)).toEqual(mutation);
    expect(validateGetInput({ consultationId: cid })).toEqual({ consultationId: cid });
    expect(validateGetInput({ consultationId: cid, callId: mutation.callId }).callId).toBe(mutation.callId);
    expect(() => validateEndInput({ ...mutation, reason: 'expired' })).toThrow(DomainValidationError);
    expect(() => validateGetInput({ consultationId: cid, callId: undefined })).toThrow(DomainValidationError);
    expect(() => validateGetInput({ consultationId: cid, senderId: 'patient' })).toThrow(DomainValidationError);
  });
});

describe('signaling payload boundaries', () => {
  test('SDP byte limit, non-ASCII bytes and exact line endings', () => {
    const sdp = 'v=0\r\n' + 'x'.repeat(65531);
    expect(validateDescriptionInput({ type: 'offer', sdp }, 'offer').sdp).toBe(sdp);
    expect(() => validateDescriptionInput({ type: 'offer', sdp: sdp + 'x' }, 'offer')).toThrow(DomainValidationError);
    expect(() => validateDescriptionInput({ type: 'offer', sdp: 'v=0\n' + 'é'.repeat(32767) }, 'offer')).toThrow(DomainValidationError);
    expect(validateDescriptionInput(offer, 'offer')).toEqual(offer);
  });
  test.each(['', ' ', 'not-sdp', 'v=0\n\u0000', 'v=0\n\ud800', 'v=0\n\udc00'])('invalid SDP %#', sdp => {
    expect(() => validateDescriptionInput({ type: 'offer', sdp }, 'offer')).toThrow(DomainValidationError);
  });
  test('candidate byte limit and supplementary Unicode preserved', () => {
    const candidate = 'candidate:' + 'x'.repeat(2038);
    expect(validateIceInput({ ...ice, candidate }).candidate).toBe(candidate);
    expect(() => validateIceInput({ ...ice, candidate: candidate + 'x' })).toThrow(DomainValidationError);
    expect(() => validateIceInput({ ...ice, candidate: 'candidate:' + 'é'.repeat(1020) })).toThrow(DomainValidationError);
    expect(validateDescriptionInput({ ...offer, sdp: 'v=0\n😀\n' }, 'offer').sdp).toBe('v=0\n😀\n');
  });
  test.each([{ candidate: '' }, { candidate: null }, { candidate: 'candidate:x\n' }, { candidate: 'candidate:\ud800' },
    { sdpMid: null, sdpMLineIndex: null }, { sdpMLineIndex: -1 }, { sdpMLineIndex: 65536 }, { sdpMLineIndex: 0.1 },
    { usernameFragment: '' }, { senderId: 'forged' }, { createdAt: t(100) }])('invalid candidate %#', patch => {
    expect(() => validateIceInput({ ...ice, ...patch })).toThrow(DomainValidationError);
  });
  test('nullable routing fields and optional username fragment', () => {
    expect(validateIceInput({ ...ice, sdpMid: null }).sdpMLineIndex).toBe(0);
    expect(validateIceInput({ ...ice, sdpMLineIndex: null, usernameFragment: 'test' }).usernameFragment).toBe('test');
  });
  test('batch bounds, sparse arrays and nested immutability', () => {
    const result = validatePublishInput({ ...mutation, candidates: Array(32).fill(ice) });
    expect(result.candidates).toHaveLength(32); expect(Object.isFrozen(result.candidates)).toBe(true);
    expect(Object.isFrozen(result.candidates[0])).toBe(true);
    for (const candidates of [[], Array(33).fill(ice), new Array(1), [null], 'invalid']) {
      expect(() => validatePublishInput({ ...mutation, candidates })).toThrow(DomainValidationError);
    }
  });
});

describe('stored call integrity without authorization or persistence', () => {
  test('strict responses preserve metadata precision and omit private payloads', () => {
    expect(validateMutationResult({ call: room(), replayed: true }).call.createdAt).toEqual(t(100));
    expect(validateGetResult({ call: null })).toEqual({ call: null });
    expect(validateGetResult({ call: room() }).call).toEqual(room());
    expect(validatePublishResult({ call: room(), replayed: false, candidateIds: ['a'.repeat(64)] }).candidateIds).toEqual(['a'.repeat(64)]);
    expect(() => validateMutationResult({ call: room(), replayed: 1 })).toThrow(DomainValidationError);
    expect(() => validateGetResult({ call: undefined })).toThrow(DomainValidationError);
  });
  test.each(['offer', 'answer', 'candidates', 'rateState', 'receipt', 'canSend'])('response rejects leaked %s', field => {
    expect(() => validateMutationResult({ call: room(), replayed: false, [field]: 'private' })).toThrow(DomainValidationError);
  });
  test('candidate receipt IDs must be unique bounded digests', () => {
    for (const candidateIds of [[], ['bad'], Array(33).fill('a'.repeat(64)), ['a'.repeat(64), 'a'.repeat(64)], new Array(1)]) {
      expect(() => validatePublishResult({ call: room(), replayed: true, candidateIds })).toThrow(DomainValidationError);
    }
  });
  test('ringing/accepted/ended and precision', () => {
    const input = room(), validated = validateCall(input);
    expect(validated).toEqual(input); expect(validated.createdAt).not.toBe(input.createdAt);
    expect(Object.isFrozen(validated.createdAt)).toBe(true);
    expect(validateCall({ ...input, state: 'accepted', acceptedAt: t(120, 123456790) }).acceptedAt).toEqual(t(120, 123456790));
    expect(validateCall({ ...input, state: 'ended', endReason: 'rejected', endedAt: t(110) }).state).toBe('ended');
  });
  test.each(['rejected', 'cancelled', 'hangup', 'ring_timeout', 'consultation_closed', 'expired'])('legal terminal shape %s', endReason => {
    const acceptedAt = endReason === 'hangup' ? t(120) : null;
    const endedAt = endReason === 'expired' ? t(1000) : endReason === 'ring_timeout' ? t(160) : t(150);
    expect(validateCall({ ...room(), state: 'ended', acceptedAt, endedAt, endReason }).endReason).toBe(endReason);
  });
  test('ring deadline capped at expiry including Timestamp maximum', () => {
    expect(validateCall({ ...room(), expiresAt: t(120), ringExpiresAt: t(120) }).ringExpiresAt).toEqual(t(120));
    expect(validateCall({ ...room(), createdAt: t(253402300798), expiresAt: t(253402300799, 999999999),
      ringExpiresAt: t(253402300799, 999999999) }).expiresAt).toEqual(t(253402300799, 999999999));
  });
  test('nanoseconds decide exact ring cap', () => {
    expect(validateCall({ ...room(), expiresAt: t(160, 123456788), ringExpiresAt: t(160, 123456788) }).expiresAt.nanoseconds).toBe(123456788);
    expect(validateCall({ ...room(), expiresAt: t(160, 123456790) }).ringExpiresAt).toEqual(t(160));
  });
  test.each([{ patientId: 'doctor' }, { initiatorId: 'stranger' }, { recipientId: 'patient' }, { appointmentId: 'd'.repeat(64) },
    { callId: '../x' }, { schemaVersion: 2 }, { mode: 'voice' }, { state: 'connected' }, { extra: true },
    { createdAt: '2026-01-01' }, { createdAt: { seconds: 100, nanoseconds: 1e9 } }, { expiresAt: t(100) },
    { ringExpiresAt: t(160, 123456790) }, { acceptedAt: t(110) }, { state: 'accepted' },
    { state: 'accepted', acceptedAt: t(160) }, { state: 'accepted', acceptedAt: t(99) },
    { state: 'ended', endReason: 'hangup', endedAt: t(110) },
    { state: 'ended', endReason: 'cancelled', acceptedAt: t(110), endedAt: t(120) },
    { state: 'ended', endReason: 'ring_timeout', endedAt: t(159) },
    { state: 'ended', endReason: 'expired', endedAt: t(999) },
    { state: 'ended', endReason: 'unknown', endedAt: t(110) },
    { state: 'ended', endReason: 'consultation_closed', endedAt: t(1001) }])('rejects corrupt call %#', patch => {
    expect(() => validateCall({ ...room(), ...patch })).toThrow(DomainValidationError);
  });
  test('stored description/candidate retain precision, reject authority fields in input', () => {
    expect(validateStoredDescription({ ...offer, senderId: 'patient', createdAt: t(100), schemaVersion: 1 }, 'offer').createdAt).toEqual(t(100));
    const stored = { ...ice, senderId: 'patient', sequence: 128, createdAt: t(101), schemaVersion: 1 };
    expect(validateStoredCandidate(stored)).toEqual(stored);
    for (const patch of [{ sequence: 0 }, { sequence: 129 }, { schemaVersion: 2 }, { createdAt: { seconds: 1, nanoseconds: 1, extra: true } }]) {
      expect(() => validateStoredCandidate({ ...stored, ...patch })).toThrow(DomainValidationError);
    }
    expect(() => validateDescriptionInput({ ...offer, senderId: 'patient' }, 'offer')).toThrow(DomainValidationError);
  });
});
