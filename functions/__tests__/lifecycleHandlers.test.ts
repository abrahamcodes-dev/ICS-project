import { createLifecycleHandlers } from '../src/scheduling/lifecycleHandlers';
import type { AvailabilityDependencies } from '../src/scheduling/availabilityHandlers';
import { appointmentId, availabilityId, bookingLockId } from '../src/scheduling/ids';
import { fromMilliseconds as ts } from '../src/scheduling/primitives';
import { scheduledLocks } from '../src/scheduling/policy';
import { validateAppointment } from '../src/scheduling/validation';
import { approvedDocuments, day, identity, now, start } from './availabilityFixtures';

const id = appointmentId('patient', '12345678-1234-4234-8234-123456789abc');
const cancel = (uid = 'patient', extra = {}) => ({ auth: { uid }, data: { appointmentId: id, ...extra } });
const outcome = (status = 'completed', uid = 'doctor', extra = {}) => ({ auth: { uid }, data: { appointmentId: id, outcome: status, ...extra } });
function setup() {
  const docs = approvedDocuments(), reads: string[] = [], writes: string[] = [];
  let clock = start - 1, attempts = 1;
  const appointment = validateAppointment({ appointmentId: id, patientId: 'patient', doctorId: 'doctor', availabilityId: availabilityId('doctor', day),
    availabilityRevision: 1, startAt: ts(start), endAt: ts(start + 1800000), doctorDisplay: { professionalName: 'Doctor Name', specialty: 'Medicine' },
    status: 'scheduled', cancellation: null, outcome: null, schemaVersion: 1, createdAt: ts(now), updatedAt: ts(now) });
  docs['appointments/' + id] = appointment;
  for (const entry of scheduledLocks(appointment)) docs['bookingLocks/' + entry.lockId] = entry.lock;
  const deps: AvailabilityDependencies = { now: () => ts(clock), transact: async action => {
    let result;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const pending: Record<string, unknown> = {}; let written = false;
      const read = async (path: string) => { if (written) throw new Error('read-after-write'); reads.push(path); return docs[path] ?? null; };
      const unexpected = () => { throw new Error('unrelated operation'); };
      result = await action({ identity: uid => read('users/' + uid), appointment: key => read('appointments/' + key), lock: key => read('bookingLocks/' + key),
        profile: unexpected, publicProfile: unexpected, verification: unexpected, availability: unexpected,
        saveAvailability: unexpected, createAppointment: unexpected, createLock: unexpected,
        saveTerminalAppointment: value => { written = true; pending['appointments/' + value.appointmentId] = value; },
        deleteLock: key => { written = true; pending['bookingLocks/' + key] = null; } });
      if (attempt === attempts - 1) for (const [path, value] of Object.entries(pending)) {
        writes.push(path); if (value === null) delete docs[path]; else docs[path] = value;
      }
    }
    return result!;
  } };
  return { docs, reads, writes, handler: createLifecycleHandlers(deps), clock: (value: number) => { clock = value; }, retry: () => { attempts = 2; } };
}

describe('lifecycle authorization and strict public input', () => {
  test.each(['cancel', 'outcome'] as const)('%s rejects guests', async method => {
    await expect(setup().handler[method]({ data: {} })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  test.each(['administrator', 'admin', 'unknown'])('canonical %s denied', async role => {
    const s = setup(); s.docs['users/patient'] = identity('patient', role); s.docs['users/doctor'] = identity('doctor', role);
    await expect(s.handler.cancel(cancel())).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(s.handler.outcome(outcome())).rejects.toMatchObject({ code: 'permission-denied' }); expect(s.writes).toEqual([]);
  });
  test.each(['patient', 'doctor'])('disabled %s and claim-only caller denied', async uid => {
    const s = setup(); s.docs['users/' + uid].status = 'disabled';
    await expect(s.handler.cancel(cancel(uid))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(s.handler.outcome(outcome('completed', uid))).rejects.toMatchObject({ code: 'permission-denied' });
    delete s.docs['users/' + uid];
    const request = { ...cancel(uid), auth: { uid, token: { role: 'doctor', verificationStatus: 'approved' } } };
    await expect(s.handler.cancel(request)).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test.each(['patient', 'doctor'])('unrelated %s sees no private state', async role => {
    const s = setup(); s.docs['users/other'] = identity('other', role);
    await expect(s.handler.cancel(cancel('other'))).rejects.toMatchObject({ code: 'permission-denied', message: 'Active authorized participant required.' });
    await expect(s.handler.outcome(outcome('completed', 'other'))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(s.reads.some(path => path.startsWith('bookingLocks/'))).toBe(false);
  });
  test.each([null, {}, identity('wrong', 'patient'), identity('patient', 'patient', { extra: true })])('malformed identity %# denied', async value => {
    const s = setup(); s.docs['users/patient'] = value;
    await expect(s.handler.cancel(cancel())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test('absent and malformed appointments use the same denial as nonparticipant', async () => {
    const s = setup(); delete s.docs['appointments/' + id];
    await expect(s.handler.cancel(cancel())).rejects.toMatchObject({ code: 'permission-denied', message: 'Active authorized participant required.' });
    s.docs['appointments/' + id] = { private: 'bad' };
    await expect(s.handler.cancel(cancel())).rejects.toMatchObject({ code: 'permission-denied', message: 'Active authorized participant required.' });
  });
  test.each(['actorId', 'cancelledBy', 'recordedBy', 'updatedAt', 'cancelledAt', 'lockId', 'patientId', 'doctorId', 'diagnosis', 'notes', '__proto__'])('rejects backend/medical field %s', async key => {
    const data = Object.assign(Object.create(null), { appointmentId: id }); data[key] = 'injected';
    await expect(setup().handler.cancel({ auth: { uid: 'patient' }, data })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(setup().handler.outcome({ auth: { uid: 'doctor' }, data: { ...data, outcome: 'completed' } })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  test.each(['', '../bad', 'A'.repeat(64), 'a'.repeat(63), null])('invalid appointment ID %p', async appointmentId => {
    await expect(setup().handler.cancel(cancel('patient', { appointmentId }))).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  test.each(['cancelled', 'scheduled', 'complete', '', null])('invalid outcome %p', async value => {
    await expect(setup().handler.outcome({ auth: { uid: 'doctor' }, data: { appointmentId: id, outcome: value } })).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  test('outcome cannot accept a reason; cancellation cannot accept an outcome', async () => {
    await expect(setup().handler.outcome(outcome('completed', 'doctor', { reason: 'bad' }))).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(setup().handler.cancel(cancel('patient', { outcome: 'completed' }))).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('cancellation and outcome policy', () => {
  test.each(['patient', 'doctor'])('%s cancels and atomically releases exactly two locks', async uid => {
    const s = setup(); expect(await s.handler.cancel(cancel(uid, { reason: '  changed plans  ' }))).toEqual({ appointmentId: id, status: 'cancelled', replayed: false });
    const appointment = s.docs['appointments/' + id];
    expect(appointment.cancellation).toEqual({ cancelledBy: uid, cancelledAt: ts(start - 1), reason: 'changed plans' });
    expect(appointment.outcome).toBeNull(); expect(appointment.updatedAt).toEqual(ts(start - 1)); expect(appointment.createdAt).toEqual(ts(now));
    expect(s.writes).toHaveLength(3); expect(Object.keys(s.docs).filter(path => path.startsWith('bookingLocks/'))).toEqual([]);
  });
  test.each(['pending', 'rejected'])('active %s doctor can cancel and record outcomes under 4B actor policy', async verificationStatus => {
    const cancelState = setup(); cancelState.docs['users/doctor'].verificationStatus = verificationStatus;
    delete cancelState.docs['doctorPublicProfiles/doctor'];
    await expect(cancelState.handler.cancel(cancel('doctor'))).resolves.toMatchObject({ status: 'cancelled' });
    for (const status of ['completed', 'no_show']) {
      const s = setup(); s.docs['users/doctor'].verificationStatus = verificationStatus; delete s.docs['doctorPublicProfiles/doctor']; s.clock(start + 1800000);
      await expect(s.handler.outcome(outcome(status))).resolves.toMatchObject({ status });
    }
  });
  test.each([start, start + 1, start + 1800000])('cancellation at/after start %p fails', async clock => {
    const s = setup(); s.clock(clock); await expect(s.handler.cancel(cancel())).rejects.toMatchObject({ code: 'failed-precondition' }); expect(s.writes).toEqual([]);
  });
  test.each([undefined, null, '', '   ', '\n\t'])('reason %p normalizes to null', async reason => {
    const s = setup(); await s.handler.cancel(cancel('patient', reason === undefined ? {} : { reason }));
    expect(s.docs['appointments/' + id].cancellation.reason).toBeNull();
  });
  test('500 characters accepted; 501 and nonstrings rejected', async () => {
    const s = setup(); await s.handler.cancel(cancel('patient', { reason: 'a'.repeat(500) })); expect(s.docs['appointments/' + id].cancellation.reason).toHaveLength(500);
    for (const reason of ['a'.repeat(501), 42, {}, 'bad\u0000reason']) await expect(setup().handler.cancel(cancel('patient', { reason }))).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  test.each(['completed', 'no_show'])('%s requires doctor, accepts exactly end/after, rejects before end', async status => {
    const early = setup(); early.clock(start + 1800000 - 1); await expect(early.handler.outcome(outcome(status))).rejects.toMatchObject({ code: 'failed-precondition' }); expect(early.writes).toEqual([]);
    for (const clock of [start + 1800000, start + 1800000 + 1]) {
      const s = setup(); s.clock(clock); expect(await s.handler.outcome(outcome(status))).toEqual({ appointmentId: id, status, replayed: false });
      expect(s.docs['appointments/' + id].outcome).toEqual({ recordedBy: 'doctor', recordedAt: ts(clock) });
      expect(s.docs['appointments/' + id].cancellation).toBeNull(); expect(s.docs['appointments/' + id].updatedAt).toEqual(ts(clock));
      expect(s.writes).toHaveLength(3); expect(Object.keys(s.docs).filter(path => path.startsWith('bookingLocks/'))).toEqual([]);
    }
    await expect(setup().handler.outcome(outcome(status, 'patient'))).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('fail-closed reservations and terminal retries', () => {
  test.each(['doctor', 'patient'] as const)('missing %s lock does not partially transition', async type => {
    const s = setup(); delete s.docs['bookingLocks/' + bookingLockId(type, type, start)]; const snapshot = JSON.stringify(s.docs);
    await expect(s.handler.cancel(cancel())).rejects.toMatchObject({ code: 'failed-precondition' }); expect(JSON.stringify(s.docs)).toBe(snapshot); expect(s.writes).toEqual([]);
  });
  test.each(['doctor', 'patient'] as const)('malformed/foreign %s lock fails closed', async type => {
    for (const patch of [{ extra: true }, { appointmentId: 'a'.repeat(64) }, { resourceId: 'foreign' }, { startAt: ts(start + 1800000), endAt: ts(start + 3600000) },
      { endAt: ts(start + 1) }, { resourceType: type === 'doctor' ? 'patient' : 'doctor' }, { createdAt: ts(now - 1) }]) {
      const s = setup(), path = 'bookingLocks/' + bookingLockId(type, type, start); s.docs[path] = { ...s.docs[path], ...patch }; const snapshot = JSON.stringify(s.docs);
      await expect(s.handler.cancel(cancel())).rejects.toMatchObject({ code: 'failed-precondition' }); expect(JSON.stringify(s.docs)).toBe(snapshot); expect(s.writes).toEqual([]);
    }
  });
  test.each(['cancelled', 'completed', 'no_show'])('exact %s replay preserves times and skips locks', async status => {
    const s = setup(); const act = () => status === 'cancelled' ? s.handler.cancel(cancel('doctor', { reason: ' text ' })) : s.handler.outcome(outcome(status));
    if (status !== 'cancelled') s.clock(start + 1800000);
    await act(); const first = s.docs['appointments/' + id], readCount = s.reads.length;
    // A replacement reservation is deliberately foreign: replay must not inspect or delete it.
    const path = 'bookingLocks/' + bookingLockId('doctor', 'doctor', start); s.docs[path] = { foreign: true }; s.clock(start + 86400000);
    expect(await act()).toEqual({ appointmentId: id, status, replayed: true }); expect(s.docs['appointments/' + id]).toEqual(first);
    expect(s.docs[path]).toEqual({ foreign: true }); expect(s.reads.slice(readCount).some(path => path.startsWith('bookingLocks/'))).toBe(false); expect(s.writes).toHaveLength(3);
  });
  test('different cancellation actor or normalized reason is a conflict', async () => {
    const s = setup(); await s.handler.cancel(cancel('patient', { reason: 'reason' }));
    await expect(s.handler.cancel(cancel('doctor', { reason: 'reason' }))).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(s.handler.cancel(cancel('patient', { reason: 'other' }))).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(s.handler.cancel(cancel('patient', { reason: ' reason ' }))).resolves.toMatchObject({ replayed: true });
  });
  test.each(['cancelled', 'completed', 'no_show'])('terminal %s cannot transition to either other status', async status => {
    const s = setup(); if (status !== 'cancelled') s.clock(start + 1800000);
    if (status === 'cancelled') await s.handler.cancel(cancel('doctor')); else await s.handler.outcome(outcome(status));
    s.clock(start + 86400000);
    for (const next of ['cancelled', 'completed', 'no_show'].filter(value => value !== status)) {
      await expect(next === 'cancelled' ? s.handler.cancel(cancel('doctor')) : s.handler.outcome(outcome(next))).rejects.toMatchObject({ code: 'failed-precondition' });
    }
    expect(s.writes).toHaveLength(3);
  });
  test('retry reruns authorization/reads and commits one terminal write plus two deletions', async () => {
    const s = setup(); s.retry(); await s.handler.cancel(cancel()); expect(s.reads.filter(path => path === 'users/patient')).toHaveLength(2); expect(s.writes).toHaveLength(3);
  });
  test('disabled actor cannot replay a previous success', async () => {
    const s = setup(); await s.handler.cancel(cancel()); s.docs['users/patient'].status = 'disabled';
    await expect(s.handler.cancel(cancel())).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
