import { createBookingHandler } from '../src/scheduling/bookingHandler';
import { AvailabilityDependencies, createAvailabilityHandlers } from '../src/scheduling/availabilityHandlers';
import { appointmentId, availabilityId, bookingLockId } from '../src/scheduling/ids';
import { fromMilliseconds as ts } from '../src/scheduling/primitives';
import { planAppointmentTransition, planAvailabilityReplacement, scheduledLocks } from '../src/scheduling/policy';
import { approvedDocuments, day, identity, input, now, start } from './availabilityFixtures';

const uuid = '12345678-1234-4234-8234-123456789abc';
const id = appointmentId('patient', uuid), availabilityKey = availabilityId('doctor', day);
const request = (data: unknown = { doctorId: 'doctor', startAt: start, bookingRequestId: uuid }, uid = 'patient') => ({ auth: { uid }, data });
const discovery = { auth: { uid: 'patient' }, data: { doctorId: 'doctor', fromDate: day, days: 1 } };
function setup() {
  const docs = approvedDocuments(); let clock = now, attempts = 1;
  docs['doctorAvailability/' + availabilityKey] = planAvailabilityReplacement('doctor', null, input(), ts(now)).availability;
  const reads: string[] = [], writes: string[] = [];
  const deps: AvailabilityDependencies = { now: () => ts(clock), transact: async action => {
    let result;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const pending: Record<string, unknown> = {}; let written = false;
      const read = async (path: string) => { if (written) throw new Error('read-after-write'); reads.push(path); return docs[path] ?? null; };
      const write = (path: string, value: unknown, create = false) => {
        if (create && (docs[path] || pending[path])) throw new Error('overwrite');
        written = true; pending[path] = value;
      };
      result = await action({ identity: uid => read('users/' + uid), profile: uid => read('doctorProfiles/' + uid), publicProfile: uid => read('doctorPublicProfiles/' + uid),
        verification: key => read('verificationRequests/' + key), availability: key => read('doctorAvailability/' + key),
        appointment: key => read('appointments/' + key), lock: key => read('bookingLocks/' + key),
        saveTerminalAppointment: () => { throw new Error('booking must not change terminal state'); },
        deleteLock: () => { throw new Error('booking must not release reservations'); },
        saveAvailability: (key, value) => write('doctorAvailability/' + key, value),
        createAppointment: value => write('appointments/' + value.appointmentId, value, true), createLock: (key, value) => write('bookingLocks/' + key, value, true) });
      if (attempt === attempts - 1) { Object.assign(docs, pending); writes.push(...Object.keys(pending)); }
    }
    return result!;
  } };
  return { docs, reads, writes, book: createBookingHandler(deps), availability: createAvailabilityHandlers(deps),
    clock: (value: number) => { clock = value; }, retry: () => { attempts = 2; } };
}

describe('booking authorization and input', () => {
  test('guest rejected', async () => { await expect(setup().book({ data: request().data })).rejects.toMatchObject({ code: 'unauthenticated' }); });
  test.each(['doctor', 'administrator', 'admin', 'unknown'])('caller role %s denied', async role => {
    const s = setup(); s.docs['users/patient'] = identity('patient', role);
    await expect(s.book(request())).rejects.toMatchObject({ code: 'permission-denied' }); expect(s.writes).toEqual([]);
  });
  test.each([null, {}, identity('patient', 'patient', { status: 'disabled' }), identity('other', 'patient'), identity('patient', 'patient', { schemaVersion: 2 })])('invalid patient %# denied', async data => {
    const s = setup(); s.docs['users/patient'] = data;
    await expect(s.book(request())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test('claims grant no authority', async () => {
    const s = setup(); delete s.docs['users/patient'];
    await expect(s.book({ ...request(), auth: { uid: 'patient', token: { role: 'administrator' } } } as ReturnType<typeof request>)).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test.each([null, {}, identity('doctor', 'doctor', { verificationStatus: 'pending' }), identity('doctor', 'doctor', { verificationStatus: 'rejected' }),
    identity('doctor', 'doctor', { status: 'disabled' }), identity('doctor', 'patient')])('invalid target %# denied', async data => {
    const s = setup(); s.docs['users/doctor'] = data;
    await expect(s.book(request())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test.each([
    ['doctorPublicProfiles/doctor', { approvedRevision: 99 }], ['doctorPublicProfiles/doctor', { professionalName: 'different' }],
    ['doctorPublicProfiles/doctor', { private: true }], ['doctorProfiles/doctor', { approvedRequestId: 'other' }],
    ['verificationRequests/approved', { doctorUid: 'other' }], ['verificationRequests/approved', { state: 'rejected' }],
  ] as const)('approval binding %# denied', async (path, patch) => {
    const s = setup(); Object.assign(s.docs[path], patch);
    await expect(s.book(request())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test.each(['patientId', 'endAt', 'appointmentId', 'availabilityRevision', 'availabilityId', 'doctorDisplay', 'status', 'createdAt', 'updatedAt', '__proto__'])('backend field %s rejected', async key => {
    const s = setup(), data = Object.assign(Object.create(null), request().data); data[key] = 'injected';
    await expect(s.book(request(data))).rejects.toMatchObject({ code: 'invalid-argument' }); expect(s.reads).toEqual([]);
  });
  test.each([{ bookingRequestId: 'not-uuid' }, { bookingRequestId: uuid.toUpperCase() }, { startAt: NaN }, { startAt: Infinity }, { startAt: '2026-10-05T10:00:00' },
    { startAt: start + 1 }, { startAt: start + 900000 }, { doctorId: '' }])('invalid transport %p', async patch => {
    await expect(setup().book(request({ ...request().data as object, ...patch }))).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('authoritative booking and retries', () => {
  test('complete server-derived document and exact response, two locks, read-before-write', async () => {
    const s = setup(); const result = await s.book(request());
    expect(result).toEqual({ appointmentId: id, doctorId: 'doctor', startAt: start, endAt: start + 1800000, status: 'scheduled', replayed: false });
    const appointment = s.docs['appointments/' + id];
    expect(appointment).toEqual({ appointmentId: id, patientId: 'patient', doctorId: 'doctor', availabilityId: availabilityKey, availabilityRevision: 1,
      startAt: ts(start), endAt: ts(start + 1800000), doctorDisplay: { professionalName: 'Doctor Name', specialty: 'Medicine' },
      status: 'scheduled', cancellation: null, outcome: null, schemaVersion: 1, createdAt: ts(now), updatedAt: ts(now) });
    expect(s.writes).toEqual(['appointments/' + id, 'bookingLocks/' + bookingLockId('doctor', 'doctor', start), 'bookingLocks/' + bookingLockId('patient', 'patient', start)]);
    expect(s.reads).toEqual(expect.arrayContaining(['users/patient', 'users/doctor', 'doctorProfiles/doctor', 'doctorPublicProfiles/doctor', 'verificationRequests/approved',
      'appointments/' + id, 'doctorAvailability/' + availabilityKey, 'bookingLocks/' + bookingLockId('doctor', 'doctor', start), 'bookingLocks/' + bookingLockId('patient', 'patient', start)]));
    expect(JSON.stringify(appointment)).not.toMatch(/private|phone|credential|reviewer|registrationNumber/);
  });
  test('exact lead accepted; too-soon rejected; beyond horizon rejected', async () => {
    const good = setup(); good.clock(start - 300000); await expect(good.book(request())).resolves.toMatchObject({ replayed: false });
    const soon = setup(); soon.clock(start - 300000 + 1); await expect(soon.book(request())).rejects.toMatchObject({ code: 'failed-precondition' }); expect(soon.writes).toEqual([]);
    const far = setup(); far.clock(start - 90 * 86400000 - 1); await expect(far.book(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  test.each([null, { windows: [] }, { doctorId: 'wrong' }, { revision: 0 }, { windows: [{ startAt: ts(start), endAt: ts(start + 900000) }, { startAt: ts(start + 900000), endAt: ts(start + 1800000) }] }])('missing/malformed/uncovered availability %#', async patch => {
    const s = setup(); s.docs['doctorAvailability/' + availabilityKey] = patch ? { ...s.docs['doctorAvailability/' + availabilityKey], ...patch } : null;
    await expect(s.book(request())).rejects.toMatchObject({ code: 'failed-precondition' }); expect(s.writes).toEqual([]);
  });
  test('exact boundary containment and adjacent windows, no off-grid spanning', async () => {
    const s = setup(); s.docs['doctorAvailability/' + availabilityKey] = { ...s.docs['doctorAvailability/' + availabilityKey],
      windows: [{ startAt: ts(start), endAt: ts(start + 1800000) }, { startAt: ts(start + 1800000), endAt: ts(start + 3600000) }] };
    await s.book(request());
    await expect(s.book(request({ doctorId: 'doctor', startAt: start + 1800000, bookingRequestId: uuid.replace('12345678', '22345678') }))).resolves.toMatchObject({ status: 'scheduled' });
    await expect(s.book(request({ doctorId: 'doctor', startAt: start + 3600000, bookingRequestId: uuid.replace('12345678', '32345678') }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  test('lost-response retry preserves appointment, locks and original revision after availability changes', async () => {
    const s = setup(); await s.book(request()); const snapshot = JSON.stringify(s.docs);
    s.clock(start + 86400000);
    expect(await s.book(request())).toMatchObject({ appointmentId: id, replayed: true });
    expect(JSON.stringify(s.docs)).toBe(snapshot); expect(s.writes).toHaveLength(3);
    s.clock(now + 1);
    await s.availability.replace({ auth: { uid: 'doctor' }, data: { ...input(), expectedRevision: 1, windows: [{ startAt: start, endAt: start + 1800000 }] } });
    expect(await s.book(request())).toMatchObject({ replayed: true }); expect(s.docs['appointments/' + id].availabilityRevision).toBe(1);
  });
  test.each(['doctor', 'start'] as const)('conflicting retry %s fails without mutation', async field => {
    const s = setup(); await s.book(request());
    if (field === 'doctor') {
      s.docs['users/other'] = identity('other');
      s.docs['doctorProfiles/other'] = { ...s.docs['doctorProfiles/doctor'], uid: 'other', approvedRequestId: 'other-approved' };
      s.docs['doctorPublicProfiles/other'] = { ...s.docs['doctorPublicProfiles/doctor'], uid: 'other', approvedRequestId: 'other-approved' };
      s.docs['verificationRequests/other-approved'] = { ...s.docs['verificationRequests/approved'], requestId: 'other-approved', doctorUid: 'other' };
    }
    await expect(s.book(request({ doctorId: field === 'doctor' ? 'other' : 'doctor', startAt: field === 'start' ? start + 1800000 : start, bookingRequestId: uuid }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(s.writes).toHaveLength(3);
  });
  test.each(['cancelled', 'completed', 'no_show'] as const)('terminal %s retry never recreates or touches locks', async status => {
    const s = setup(); await s.book(request()); const appointment = s.docs['appointments/' + id];
    const entries = scheduledLocks(appointment);
    const at = status === 'cancelled' ? start - 1 : start + 1800000;
    s.docs['appointments/' + id] = planAppointmentTransition(appointment, { uid: 'doctor', role: 'doctor' }, { status }, ts(at), entries.map(e => e.lock)).appointment;
    for (const entry of entries) delete s.docs['bookingLocks/' + entry.lockId];
    const before = JSON.stringify(s.docs), readCount = s.reads.length; s.clock(start + 86400000);
    expect(await s.book(request())).toMatchObject({ replayed: true, status });
    expect(JSON.stringify(s.docs)).toBe(before); expect(s.writes).toHaveLength(3);
    expect(s.reads.slice(readCount).some(path => path.startsWith('bookingLocks/'))).toBe(false);
  });
  test('scheduled retry with missing lock fails closed', async () => {
    const s = setup(); await s.book(request()); delete s.docs['bookingLocks/' + bookingLockId('patient', 'patient', start)];
    await expect(s.book(request())).rejects.toMatchObject({ code: 'failed-precondition' }); expect(s.writes).toHaveLength(3);
  });
  test('transaction retry produces one appointment and two locks', async () => {
    const s = setup(); s.retry(); await s.book(request()); expect(s.writes).toHaveLength(3);
    expect(s.reads.filter(path => path === 'users/patient')).toHaveLength(2);
  });
  test('stale discovery cannot bypass a generic occupied-slot conflict', async () => {
    const s = setup(); expect((await s.availability.discover(discovery)).times).toHaveLength(2);
    await s.book(request()); s.docs['users/other-patient'] = identity('other-patient', 'patient');
    await expect(s.book(request(request().data, 'other-patient'))).rejects.toMatchObject({ code: 'already-exists', message: 'Scheduling conflict. Choose another time.' });
    const times = (await s.availability.discover(discovery)).times;
    expect(times.map(t => t.startAt)).toEqual([start + 1800000]);
    expect(Object.keys(times[0]).sort()).toEqual(['availabilityId', 'availabilityRevision', 'doctorId', 'endAt', 'startAt']);
  });
});

describe('reservation coverage protection', () => {
  test.each([{ windows: [] }, { windows: [{ startAt: start + 1800000, endAt: start + 3600000 }] }])('removal of booked coverage %# rejected', async ({ windows }) => {
    const s = setup(); await s.book(request());
    await expect(s.availability.replace({ auth: { uid: 'doctor' }, data: { ...input(), expectedRevision: 1, windows } })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(s.docs['doctorAvailability/' + availabilityKey].revision).toBe(1);
  });
  test.each(['malformed-lock', 'wrong-owner', 'wrong-time', 'missing-appointment', 'wrong-appointment', 'missing-patient-lock', 'terminal-appointment'])('inconsistency %s fails closed', async corruption => {
    const s = setup(); await s.book(request()); const lockPath = 'bookingLocks/' + bookingLockId('doctor', 'doctor', start);
    if (corruption === 'malformed-lock') s.docs[lockPath] = { ...s.docs[lockPath], extra: true };
    if (corruption === 'wrong-owner') s.docs[lockPath] = { ...s.docs[lockPath], resourceId: 'other' };
    if (corruption === 'wrong-time') s.docs[lockPath] = { ...s.docs[lockPath], startAt: ts(start + 1800000), endAt: ts(start + 3600000) };
    if (corruption === 'missing-appointment') delete s.docs['appointments/' + id];
    if (corruption === 'wrong-appointment') s.docs['appointments/' + id] = { ...s.docs['appointments/' + id], appointmentId: 'a'.repeat(64) };
    if (corruption === 'missing-patient-lock') delete s.docs['bookingLocks/' + bookingLockId('patient', 'patient', start)];
    if (corruption === 'terminal-appointment') s.docs['appointments/' + id] = { ...s.docs['appointments/' + id], status: 'cancelled' };
    await expect(s.availability.replace({ auth: { uid: 'doctor' }, data: { ...input(), expectedRevision: 1 } })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(s.availability.discover(discovery)).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  test('unrelated doctor reservation does not block replacement', async () => {
    const s = setup(); s.docs['bookingLocks/' + bookingLockId('doctor', 'other', start)] = { deliberately: 'not read' };
    await expect(s.availability.replace({ auth: { uid: 'doctor' }, data: { ...input(), expectedRevision: 1, windows: [] } })).resolves.toMatchObject({ revision: 2 });
    expect(s.reads.filter(path => path.startsWith('bookingLocks/'))).toHaveLength(48);
  });
});
