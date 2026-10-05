import { createHash } from 'crypto';
import type { Appointment, SchedulingActor } from '../../shared/types/scheduling';
import { SCHEDULING, MIN_TIMESTAMP_MS, MAX_TIMESTAMP_MS } from '../src/scheduling/constants';
import { alignedStart, assertBookableStart, bookingRequestId, compareTimes, epochMilliseconds, fromMilliseconds as ts,
  positiveRevision, schedulingTimestamp, timeZone, toMilliseconds, utcDate } from '../src/scheduling/primitives';
import { availabilityId, appointmentId, bookingLockId, resourceType } from '../src/scheduling/ids';
import { availabilityWindows, contains, deriveSlots, fitsAvailability, interval, overlaps, sameInterval } from '../src/scheduling/intervals';
import { cancellationReason, validateAppointment, validateAvailability, validateAvailabilityInput, validateBookingLock,
  validateBookingRequest, validateDecision } from '../src/scheduling/validation';
import { lockIdsToRelease, matchBookingRetry, planAppointmentTransition, planAvailabilityReplacement, scheduledLocks } from '../src/scheduling/policy';

const day = '2026-10-04', start = Date.parse(day + 'T10:00:00Z'), duration = 1800000;
const uuid = '12345678-1234-4234-8234-123456789abc';
const request = { doctorId: 'doctor1', startAt: start, bookingRequestId: uuid };
const window = (a = start, b = start + duration) => ({ startAt: ts(a), endAt: ts(b) });
const input = () => ({ utcDate: day, timeZone: 'Africa/Nairobi', windows: [{ startAt: start, endAt: start + duration }], expectedRevision: 0 });
const appointment = (): Appointment => validateAppointment({ appointmentId: appointmentId('patient1', uuid), patientId: 'patient1', doctorId: 'doctor1',
  availabilityId: availabilityId('doctor1', day), availabilityRevision: 1, ...window(), doctorDisplay: { professionalName: 'Doctor One', specialty: 'General medicine' },
  status: 'scheduled', cancellation: null, outcome: null, schemaVersion: 1, createdAt: ts(start - 3600000), updatedAt: ts(start - 3600000) });
const doctor: SchedulingActor = { uid: 'doctor1', role: 'doctor' }, patient: SchedulingActor = { uid: 'patient1', role: 'patient' };
const locks = () => scheduledLocks(appointment()).map(x => x.lock);
const availability = () => planAvailabilityReplacement('doctor1', null, input(), ts(start - 3600000)).availability;

describe('scheduling primitives and strict transport', () => {
  test('central policy values', () => expect(SCHEDULING).toEqual({ appointmentDurationMs: duration, slotIntervalMs: duration,
    bookingLeadMs: 300000, horizonDays: 90, maxWindowsPerUtcDay: 8, maxDiscoveryDays: 7, cancellationReasonMax: 500, schemaVersion: 1, utcDayMs: 86400000 }));
  test.each([NaN, Infinity, -Infinity, 1.2, Number.MAX_SAFE_INTEGER + 1, MIN_TIMESTAMP_MS - 1, MAX_TIMESTAMP_MS + 1, '2026-10-04T10:00:00', null])('rejects invalid epoch %p', value => expect(() => epochMilliseconds(value)).toThrow());
  test.each([MIN_TIMESTAMP_MS, MAX_TIMESTAMP_MS, -1, 0, start])('epoch round trip %p', value => expect(toMilliseconds(ts(value))).toBe(value));
  test.each([{}, { seconds: 0 }, { seconds: NaN, nanoseconds: 0 }, { seconds: 0, nanoseconds: -1 }, { seconds: 0, nanoseconds: 1e9 },
    { seconds: 0.1, nanoseconds: 0 }, { seconds: 0, nanoseconds: 0, extra: true }, new Date(), { seconds: 253402300800, nanoseconds: 0 }])('rejects malformed timestamp %p', value => expect(() => schedulingTimestamp(value)).toThrow());
  test('nanosecond comparison is exact; slot times reject submilliseconds', () => {
    expect(compareTimes({ seconds: 253402300799, nanoseconds: 1 }, { seconds: 253402300799, nanoseconds: 2 })).toBe(-1);
    expect(() => toMilliseconds({ seconds: 1, nanoseconds: 1 })).toThrow();
  });
  test.each(['2026-02-29', '2026-13-01', '2026-04-31', '2026-1-01', '0000-01-01', '2026-10-04T00:00:00Z', ''])('rejects date %p', value => expect(() => utcDate(value)).toThrow());
  test.each(['2024-02-29', '0001-01-01', '9999-12-31'])('valid calendar date %s', value => expect(utcDate(value)).toBe(value));
  test.each(['Africa/Nairobi', 'UTC', 'America/New_York'])('valid runtime timezone %s', value => expect(timeZone(value)).toBe(value));
  test.each(['', ' ', 'Mars/Olympus', '+03:00', 'EST', ' UTC ', null])('invalid timezone %p', value => expect(() => timeZone(value)).toThrow());
  test('timezone aliases normalize through ICU', () => expect(timeZone('US/Eastern')).toBe(timeZone('America/New_York')));
  test.each([0, -1, 1.5, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER + 1])('invalid revision %p', value => expect(() => positiveRevision(value)).toThrow());
  test('revision zero allowed only for create expectation', () => expect(positiveRevision(0, true)).toBe(0));
  test('grid and trusted booking boundaries', () => {
    expect(alignedStart(start)).toBe(start);
    expect(() => alignedStart(start + 1)).toThrow();
    expect(assertBookableStart(start, ts(start - 300000))).toBe(start);
    expect(() => assertBookableStart(start, { seconds: (start - 300000) / 1000, nanoseconds: 1 })).toThrow();
    expect(() => assertBookableStart(start, ts(start))).toThrow();
    expect(assertBookableStart(start, ts(start - 90 * 86400000))).toBe(start);
    expect(() => assertBookableStart(start, ts(start - 90 * 86400000 - 1))).toThrow();
  });
  test.each(['', uuid.toUpperCase(), 'not-a-uuid', '00000000-0000-0000-0000-000000000000', uuid.replace('-8234-', '-7234-')])('rejects UUID %s', value => expect(() => bookingRequestId(value)).toThrow());
  test('canonical request', () => expect(validateBookingRequest(request)).toEqual(request));
  test.each(['patientId', 'endAt', 'appointmentId', 'status', 'createdAt', 'updatedAt', 'availabilityRevision', 'doctorDisplay', '__proto__', 'constructor'])('rejects supplied %s', key => {
    const value = Object.assign(Object.create(null), request); value[key] = 'injected';
    expect(() => validateBookingRequest(value)).toThrow();
  });
  test.each(['', ' ', 'x/y', 'x\\y', '..', 'bad\u0000id', '%2f'])('rejects identity %p', doctorId => expect(() => validateBookingRequest({ ...request, doctorId })).toThrow());
  test('rejects inherited and symbol properties and missing fields', () => {
    expect(() => validateBookingRequest(Object.assign(Object.create({ admin: true }), request))).toThrow();
    expect(() => validateBookingRequest({ ...request, [Symbol('hidden')]: true })).toThrow();
    expect(() => validateBookingRequest({ doctorId: 'doctor1' })).toThrow();
  });
});

describe('deterministic identifiers', () => {
  const hash = (tuple: unknown[]) => createHash('sha256').update(JSON.stringify(tuple), 'utf8').digest('hex');
  test('exact canonical JSON tuples and repeatability', () => {
    expect(availabilityId('doctor1', day)).toBe(hash(['doctor1', day]));
    expect(appointmentId('patient1', uuid)).toBe(hash(['patient1', uuid]));
    expect(bookingLockId('doctor', 'doctor1', start)).toBe(hash(['doctor', 'doctor1', start]));
    expect(appointmentId('patient1', uuid)).toBe(appointmentId('patient1', uuid));
  });
  test('tuple delimiters and quotes cannot inject boundaries', () => {
    expect(bookingLockId('doctor', 'a","b', start)).toBe(hash(['doctor', 'a","b', start]));
    expect(bookingLockId('doctor', 'a","b', start)).not.toBe(bookingLockId('doctor', 'a,b', start));
    expect(bookingLockId('doctor', 'same', start)).not.toBe(bookingLockId('patient', 'same', start));
    expect(appointmentId('patient1', uuid)).not.toBe(appointmentId('patient2', uuid));
    expect(availabilityId('doctor1', day)).not.toBe(availabilityId('doctor1', '2026-10-05'));
  });
  test.each(['admin', 'administrator', '', 'Doctor'])('invalid lock resource %s', value => expect(() => resourceType(value)).toThrow());
});

describe('availability and half-open intervals', () => {
  test('adjacency, overlap, containment, equality', () => {
    expect(overlaps(window(), window(start + duration, start + 2 * duration))).toBe(false);
    expect(overlaps(window(), window(start + 1, start + duration + 1))).toBe(true);
    expect(contains(window(start, start + 2 * duration), window())).toBe(true);
    expect(contains(window(), window(start - 1, start + duration))).toBe(false);
    expect(sameInterval(window(), window())).toBe(true);
    expect(sameInterval(window(), window(start + duration, start + 2 * duration))).toBe(false);
  });
  test.each([window(start, start), window(start, start - 1), { startAt: ts(start) }, { ...window(), extra: 1 }])('invalid interval %p', value => expect(() => interval(value)).toThrow());
  test('empty, adjacent, eight-window and midnight boundaries', () => {
    expect(availabilityWindows([], day)).toEqual([]);
    const eight = Array.from({ length: 8 }, (_, i) => window(start + i * duration, start + (i + 1) * duration));
    expect(availabilityWindows(eight, day)).toHaveLength(8);
    const midnight = Date.parse(day + 'T00:00:00Z');
    expect(availabilityWindows([window(midnight, midnight + 86400000)], day)).toHaveLength(1);
    expect(deriveSlots([window(midnight, midnight + 86400000)], day)).toHaveLength(48);
  });
  test.each([
    [window(start, start + 2 * duration), window()], [window(start + duration, start + 2 * duration), window()],
    [window(start + 1, start + duration)], [window(start, start + duration - 1)],
    [window(start - 86400000, start - 86400000 + duration)], [window(start, start + 86400000)],
    Array.from({ length: 9 }, (_, i) => window(start + i * duration, start + (i + 1) * duration)), new Array(1),
  ])('rejects invalid windows %#', value => expect(() => availabilityWindows(value, day)).toThrow());
  test('derived candidates are ordered, unique, contained, exactly 30 minutes', () => {
    const windows = [window(start, start + 2 * duration), window(start + 2 * duration, start + 3 * duration)];
    const slots = deriveSlots(windows, day);
    expect(slots.map(s => toMilliseconds(s.startAt))).toEqual([start, start + duration, start + 2 * duration]);
    for (const slot of slots) {
      expect(toMilliseconds(slot.endAt) - toMilliseconds(slot.startAt)).toBe(duration);
      expect(fitsAvailability(slot, windows, day)).toBe(true);
    }
    expect(deriveSlots(windows, day)).toEqual(slots);
    expect(fitsAvailability(window(start + 3 * duration, start + 4 * duration), windows, day)).toBe(false);
    expect(() => fitsAvailability(window(start, start + 2 * duration), windows, day)).toThrow();
  });
  test('transport validates and normalizes', () => {
    expect(validateAvailabilityInput(input())).toEqual(input());
    expect(() => validateAvailabilityInput({ ...input(), windows: [{ startAt: '2026-10-04T10:00:00', endAt: start + duration }] })).toThrow();
    expect(() => validateAvailabilityInput({ ...input(), windows: [{ ...input().windows[0], status: 'free' }] })).toThrow();
    expect(() => validateAvailabilityInput({ ...input(), doctorId: 'injected' })).toThrow();
  });
  test.each([{ revision: 0 }, { schemaVersion: 2 }, { doctorId: '' }, { utcDate: '2026-02-30' }, { timeZone: 'US/Eastern' }, { unknown: true }, { updatedAt: ts(start - 7200000) }])('invalid stored availability %p', patch => expect(() => validateAvailability({ ...availability(), ...patch })).toThrow());
});

describe('revisions and booking retries', () => {
  test('create, normalized no-op, meaningful replacement and stale revision', () => {
    const first = availability(); expect(first.revision).toBe(1);
    const same = planAvailabilityReplacement('doctor1', first, { ...input(), expectedRevision: 1 }, ts(start - 1800000));
    expect(same.changed).toBe(false); expect(same.availability).toEqual(first);
    const next = planAvailabilityReplacement('doctor1', first, { ...input(), windows: [], expectedRevision: 1 }, ts(start - 1800000));
    expect(next.changed).toBe(true); expect(next.availability.revision).toBe(2); expect(next.availability.createdAt).toEqual(first.createdAt);
    expect(() => planAvailabilityReplacement('doctor1', first, input(), ts(start - 1800000))).toThrow();
  });
  test('immutable owner, date, timezone; started windows cannot change', () => {
    const first = availability(), replacement = { ...input(), expectedRevision: 1 };
    expect(() => planAvailabilityReplacement('doctor2', first, replacement, ts(start - 1))).toThrow();
    expect(() => planAvailabilityReplacement('doctor1', first, { ...replacement, timeZone: 'UTC' }, ts(start - 1))).toThrow();
    expect(() => planAvailabilityReplacement('doctor1', first, { ...replacement, utcDate: '2026-10-05', windows: [] }, ts(start - 1))).toThrow();
    expect(() => planAvailabilityReplacement('doctor1', first, { ...replacement, windows: [] }, ts(start))).toThrow();
    expect(planAvailabilityReplacement('doctor1', first, replacement, ts(start)).changed).toBe(false);
    expect(() => planAvailabilityReplacement('doctor1', null, input(), ts(start))).toThrow();
  });
  test('availability calendar horizon and revision overflow', () => {
    expect(() => planAvailabilityReplacement('doctor1', null, input(), ts(start + 86400000))).toThrow();
    expect(() => planAvailabilityReplacement('doctor1', null, input(), ts(start - 91 * 86400000))).toThrow();
    expect(planAvailabilityReplacement('doctor1', null, input(), ts(start - 90 * 86400000)).changed).toBe(true);
    const max = { ...availability(), revision: Number.MAX_SAFE_INTEGER };
    expect(planAvailabilityReplacement('doctor1', max, { ...input(), expectedRevision: max.revision }, ts(start - 1)).changed).toBe(false);
    expect(() => planAvailabilityReplacement('doctor1', max, { ...input(), windows: [], expectedRevision: max.revision }, ts(start - 1))).toThrow();
  });
  test('retry is caller bound and rejects conflicting reuse', () => {
    expect(matchBookingRetry('patient1', request, null)).toBeNull();
    expect(matchBookingRetry('patient1', request, appointment())).toEqual(appointment());
    expect(() => matchBookingRetry('patient2', request, appointment())).toThrow();
    expect(() => matchBookingRetry('patient1', { ...request, startAt: start + duration }, appointment())).toThrow();
    expect(() => matchBookingRetry('patient1', { ...request, doctorId: 'doctor2' }, appointment())).toThrow();
  });
});

describe('appointment schema, reservations and lifecycle', () => {
  test.each([{ status: 'booked' }, { status: 'pending' }, { status: 'confirmed' }, { patientId: 'doctor1' }, { appointmentId: 'bad' },
    { availabilityId: 'bad' }, { availabilityRevision: 0 }, { schemaVersion: 2 }, { endAt: ts(start + 2 * duration) },
    { doctorDisplay: { professionalName: '', specialty: 'General' } }, { doctorDisplay: { professionalName: ' A ', specialty: 'General' } },
    { doctorDisplay: { professionalName: 'A', specialty: 'General', health: 'bad' } }, { diagnosis: 'forbidden' },
    { cancellation: {} }, { outcome: {} }, { createdAt: ts(start) }])('rejects invalid appointment %p', patch => expect(() => validateAppointment({ ...appointment(), ...patch })).toThrow());
  test.each([undefined, null, '', '   ', '\n\t'])('blank reason %p becomes null', value => expect(cancellationReason(value)).toBeNull());
  test('reason trims, bounds and rejects controls', () => {
    expect(cancellationReason('  changed plans  ')).toBe('changed plans');
    expect(cancellationReason('a'.repeat(500))).toHaveLength(500);
    expect(() => cancellationReason('a'.repeat(501))).toThrow();
    expect(() => cancellationReason(42)).toThrow();
    expect(() => cancellationReason('a\u0000b')).toThrow();
  });
  test.each([{ status: 'completed', reason: null }, { status: 'no_show', notes: 'bad' }, { status: 'cancelled', cancelledBy: 'bad' }, { status: 'scheduled' }])('invalid decision %p', value => expect(() => validateDecision(value)).toThrow());
  test('exactly two separate owner-bound reservations', () => {
    const entries = scheduledLocks(appointment());
    expect(entries.map(x => x.lock.resourceType)).toEqual(['doctor', 'patient']);
    expect(new Set(entries.map(x => x.lockId)).size).toBe(2);
    expect(lockIdsToRelease(appointment(), locks().reverse())).toEqual(entries.map(x => x.lockId));
  });
  test.each([{ resourceType: 'administrator' }, { resourceId: '' }, { appointmentId: 'bad' }, { schemaVersion: 2 }, { status: 'scheduled' }, { endAt: ts(start + 1) }])('rejects malformed lock %p', patch => expect(() => validateBookingLock({ ...locks()[0], ...patch })).toThrow());
  test('never release missing, duplicated, foreign or rebound locks', () => {
    expect(() => lockIdsToRelease(appointment(), [])).toThrow();
    expect(() => lockIdsToRelease(appointment(), [locks()[0], locks()[0]])).toThrow();
    for (const patch of [{ appointmentId: 'a'.repeat(64) }, { resourceId: 'someoneElse' }, { createdAt: ts(start - 3600001) }, window(start + duration, start + 2 * duration)]) {
      expect(() => lockIdsToRelease(appointment(), [{ ...locks()[0], ...patch }, locks()[1]])).toThrow();
    }
  });
  test.each([patient, doctor])('participant cancellation %p before start', actor => {
    const result = planAppointmentTransition(appointment(), actor, { status: 'cancelled', reason: '  later  ' }, ts(start - 1), locks());
    expect(result.appointment.status).toBe('cancelled'); expect(result.releaseLockIds).toHaveLength(2);
    expect(result.appointment.cancellation?.reason).toBe('later'); expect(appointment().status).toBe('scheduled');
    expect(() => planAppointmentTransition(appointment(), actor, { status: 'cancelled' }, ts(start), locks())).toThrow();
  });
  test.each(['completed', 'no_show'] as const)('%s only by doctor at/after end', status => {
    expect(() => planAppointmentTransition(appointment(), doctor, { status }, ts(start + duration - 1), locks())).toThrow();
    const result = planAppointmentTransition(appointment(), doctor, { status }, ts(start + duration), locks());
    expect(result.appointment.status).toBe(status); expect(result.releaseLockIds).toHaveLength(2);
    expect(() => planAppointmentTransition(appointment(), patient, { status }, ts(start + duration), locks())).toThrow();
  });
  test.each([{ uid: 'doctor1', role: 'administrator' }, { uid: 'patient1', role: 'admin' }, { uid: 'other', role: 'doctor' }, { uid: 'doctor1', role: 'patient' }])('denies actor %p', actor => {
    expect(() => planAppointmentTransition(appointment(), actor as SchedulingActor, { status: 'cancelled' }, ts(start - 1), locks())).toThrow();
  });
  test.each(['cancelled', 'completed', 'no_show'] as const)('%s exact retry preserves history without lock deletion or recreation', status => {
    const at = status === 'cancelled' ? start - 1 : start + duration;
    const terminal = planAppointmentTransition(appointment(), doctor, { status }, ts(at), locks()).appointment;
    const retry = planAppointmentTransition(terminal, doctor, { status }, ts(at + 86400000), locks());
    expect(retry.changed).toBe(false); expect(retry.releaseLockIds).toEqual([]); expect(retry.appointment).toEqual(terminal);
    expect(matchBookingRetry('patient1', request, terminal)).toEqual(terminal);
    expect(() => scheduledLocks(terminal)).toThrow();
    for (const other of ['cancelled', 'completed', 'no_show'].filter(s => s !== status)) {
      expect(() => planAppointmentTransition(terminal, doctor, { status: other }, ts(at + 86400000))).toThrow();
    }
  });
  test('conflicting cancellation replay and backwards clock fail', () => {
    const terminal = planAppointmentTransition(appointment(), doctor, { status: 'cancelled' }, ts(start - 1), locks()).appointment;
    expect(() => planAppointmentTransition(terminal, patient, { status: 'cancelled' }, ts(start))).toThrow();
    expect(() => planAppointmentTransition(terminal, doctor, { status: 'cancelled', reason: 'different' }, ts(start))).toThrow();
    expect(() => planAppointmentTransition(appointment(), doctor, { status: 'cancelled' }, ts(start - 7200000), locks())).toThrow();
  });
});
