import { createAvailabilityHandlers, AvailabilityTransaction } from '../src/scheduling/availabilityHandlers';
import { fromMilliseconds as ts } from '../src/scheduling/primitives';
import { availabilityId } from '../src/scheduling/ids';
import { planAvailabilityReplacement } from '../src/scheduling/policy';
import { approvedDocuments, day, identity, input, now, start } from './availabilityFixtures';

function setup() {
  const docs = approvedDocuments(); let clock = now; let attempts = 1;
  const reads: string[] = [], writes: string[] = [];
  const handlers = createAvailabilityHandlers({ now: () => ts(clock), transact: async action => {
    let result;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const pending: Record<string, unknown> = {};
      let written = false;
      const read = async (path: string) => { if (written) throw new Error('read after write'); reads.push(path); return docs[path] ?? null; };
      const tx: AvailabilityTransaction = { identity: uid => read('users/' + uid), profile: uid => read('doctorProfiles/' + uid),
        publicProfile: uid => read('doctorPublicProfiles/' + uid), verification: id => read('verificationRequests/' + id),
        availability: id => read('doctorAvailability/' + id), appointment: id => read('appointments/' + id), lock: id => read('bookingLocks/' + id),
        createAppointment: () => { throw new Error('availability must not create appointments'); },
        createLock: () => { throw new Error('availability must not create reservations'); },
        saveTerminalAppointment: () => { throw new Error('availability must not change appointments'); },
        deleteLock: () => { throw new Error('availability must not release reservations'); },
        saveAvailability: (id, value) => { written = true; pending['doctorAvailability/' + id] = value; } };
      result = await action(tx);
      if (attempt === attempts - 1) { Object.assign(docs, pending); writes.push(...Object.keys(pending)); }
    }
    return result!;
  } });
  return { docs, reads, writes, handlers, setClock: (value: number) => { clock = value; }, retry: () => { attempts = 2; } };
}
const mutation = (data: unknown = input(), uid = 'doctor') => ({ auth: { uid }, data });
const discovery = (data: unknown = { doctorId: 'doctor', fromDate: day, days: 1 }, uid = 'patient') => ({ auth: { uid }, data });

describe('availability authorization and input', () => {
  test.each(['replace', 'discover'] as const)('%s denies guests', async method => {
    await expect(setup().handlers[method]({ data: input() })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  test.each(['patient', 'administrator', 'admin', 'unknown'])('mutation denies canonical %s', async role => {
    const s = setup(); s.docs['users/doctor'] = identity('doctor', role);
    await expect(s.handlers.replace(mutation())).rejects.toMatchObject({ code: 'permission-denied' }); expect(s.writes).toEqual([]);
  });
  test.each([{ status: 'disabled' }, { verificationStatus: 'pending' }, { verificationStatus: 'rejected' }, { uid: 'different' }, { extra: 'bad' }, { schemaVersion: 2 }])('mutation denies identity %p', async patch => {
    const s = setup(); Object.assign(s.docs['users/doctor'], patch);
    await expect(s.handlers.replace(mutation())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test('custom claims cannot replace canonical authority', async () => {
    const s = setup(); delete s.docs['users/doctor'];
    const request = { ...mutation(), auth: { uid: 'doctor', token: { role: 'administrator', verificationStatus: 'approved' } } };
    await expect(s.handlers.replace(request)).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test.each(['doctorId', 'createdAt', 'revision', 'status', 'schemaVersion', '__proto__'])('mutation rejects backend field %s', async key => {
    const s = setup(), data = Object.assign(Object.create(null), input()); data[key] = 'bad';
    await expect(s.handlers.replace(mutation(data))).rejects.toMatchObject({ code: 'invalid-argument' }); expect(s.reads).toEqual([]);
  });
  test.each([null, undefined, -1, 0.1, '0'])('create expectation %p rejected', async expectedRevision => {
    await expect(setup().handlers.replace(mutation({ ...input(), expectedRevision }))).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  test.each([
    ['doctorPublicProfiles/doctor', { approvedRevision: 3 }], ['doctorPublicProfiles/doctor', { uid: 'other' }],
    ['doctorPublicProfiles/doctor', { professionalName: 'Wrong' }], ['doctorPublicProfiles/doctor', { specialty: 'Wrong' }],
    ['doctorPublicProfiles/doctor', { secret: 'unexpected' }], ['doctorPublicProfiles/doctor', { publishedAt: ts(now) }],
    ['doctorPublicProfiles/doctor', { approvedRequestId: '../bad' }], ['doctorProfiles/doctor', { approvedRequestId: 'other' }],
    ['doctorProfiles/doctor', { revision: 3 }], ['doctorProfiles/doctor', { registrationNumber: 'changed' }],
    ['verificationRequests/approved', { state: 'submitted' }], ['verificationRequests/approved', { doctorUid: 'other' }],
    ['verificationRequests/approved', { requestId: 'other' }], ['verificationRequests/approved', { profileRevision: 3 }],
  ] as const)('rejects inconsistent binding %#', async (path, patch) => {
    const s = setup(); Object.assign(s.docs[path], patch);
    await expect(s.handlers.replace(mutation())).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(s.handlers.discover(discovery())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test.each(['users/doctor', 'doctorProfiles/doctor', 'doctorPublicProfiles/doctor', 'verificationRequests/approved'])('missing %s denies both operations', async path => {
    const s = setup(); delete s.docs[path];
    await expect(s.handlers.replace(mutation())).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(s.handlers.discover(discovery())).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('replacement behavior', () => {
  test('create, no-op, stale retry, replace, preserve creation and empty document', async () => {
    const s = setup(), id = availabilityId('doctor', day), path = 'doctorAvailability/' + id;
    expect(await s.handlers.replace(mutation())).toEqual({ availabilityId: id, revision: 1, changed: true });
    const first = s.docs[path]; s.setClock(now + 1);
    expect(await s.handlers.replace(mutation({ ...input(), expectedRevision: 1 }))).toEqual({ availabilityId: id, revision: 1, changed: false });
    expect(s.docs[path]).toEqual(first); expect(s.writes).toHaveLength(1);
    await expect(s.handlers.replace(mutation())).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(await s.handlers.replace(mutation({ ...input(), expectedRevision: 1, windows: [] }))).toEqual({ availabilityId: id, revision: 2, changed: true });
    expect(s.docs[path].windows).toEqual([]); expect(s.docs[path].createdAt).toEqual(first.createdAt); expect(s.docs[path].updatedAt).toEqual(ts(now + 1));
  });
  test('timezone is immutable, aliases normalize before comparison', async () => {
    const s = setup(); await s.handlers.replace(mutation({ ...input(), timeZone: 'US/Eastern' }));
    expect((await s.handlers.replace(mutation({ ...input(), timeZone: 'America/New_York', expectedRevision: 1 }))).changed).toBe(false);
    await expect(s.handlers.replace(mutation({ ...input(), expectedRevision: 1 }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  test('fully elapsed day and horizon rejected', async () => {
    const s = setup(); await s.handlers.replace(mutation());
    s.setClock(start + 86400000);
    await expect(s.handlers.replace(mutation({ ...input(), expectedRevision: 1 }))).rejects.toMatchObject({ code: 'failed-precondition' });
    s.setClock(start - 91 * 86400000);
    await expect(s.handlers.replace(mutation({ ...input(), expectedRevision: 1 }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  test('partially elapsed day preserves started window, permits future addition', async () => {
    const s = setup(); await s.handlers.replace(mutation()); s.setClock(start);
    await expect(s.handlers.replace(mutation({ ...input(), windows: [], expectedRevision: 1 }))).rejects.toMatchObject({ code: 'failed-precondition' });
    const data = { ...input(), expectedRevision: 1, windows: [...input().windows, { startAt: start + 7200000, endAt: start + 9000000 }] };
    expect((await s.handlers.replace(mutation(data))).revision).toBe(2);
    s.setClock(start + 3600000);
    await expect(s.handlers.replace(mutation({ ...data, expectedRevision: 2, windows: [data.windows[1]] }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  test('transaction retries re-read authorization and only commit once', async () => {
    const s = setup(); s.retry(); expect((await s.handlers.replace(mutation())).revision).toBe(1);
    expect(s.reads.filter(path => path === 'users/doctor')).toHaveLength(2); expect(s.writes).toHaveLength(1);
  });
  test('UTC midnight ending is valid; crossing day is not', async () => {
    const s = setup(), end = Date.parse(day + 'T00:00:00Z') + 86400000;
    await expect(s.handlers.replace(mutation({ ...input(), windows: [{ startAt: end - 1800000, endAt: end }] }))).resolves.toMatchObject({ revision: 1 });
    await expect(s.handlers.replace(mutation({ ...input(), expectedRevision: 1, windows: [{ startAt: end - 1800000, endAt: end + 1800000 }] }))).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  test('unexpected failures are sanitized', async () => {
    const handler = createAvailabilityHandlers({ now: () => ts(now), transact: async () => { throw new Error('private storage data'); } });
    await expect(handler.replace(mutation())).rejects.toMatchObject({ code: 'internal', message: 'Scheduling operation failed. Please retry later.' });
  });
});

describe('sanitized candidate discovery', () => {
  test.each(['doctor', 'administrator', 'admin', 'unknown'])('caller role %s denied', async role => {
    const s = setup(); s.docs['users/patient'] = identity('patient', role);
    await expect(s.handlers.discover(discovery())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test.each([null, {}, identity('patient', 'patient', { status: 'disabled' }), identity('wrong', 'patient')])('invalid caller %# denied', async value => {
    const s = setup(); s.docs['users/patient'] = value;
    await expect(s.handlers.discover(discovery())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test.each([{ verificationStatus: 'pending' }, { verificationStatus: 'rejected' }, { status: 'disabled' }, { role: 'patient' }])('target %p denied', async patch => {
    const s = setup(); Object.assign(s.docs['users/doctor'], patch);
    await expect(s.handlers.discover(discovery())).rejects.toMatchObject({ code: 'permission-denied' });
  });
  test.each([0, 8, -1, 1.5, '7', null, NaN, Infinity])('invalid days %p', async days => {
    await expect(setup().handlers.discover(discovery({ doctorId: 'doctor', fromDate: day, days }))).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  test.each([{ patientId: 'injected' }, { fromDate: '2026-10-05T00:00:00' }, { fromDate: '2026-02-30' }, { doctorId: '../doctor' }, { now: 1 }])('invalid discovery %p', async patch => {
    await expect(setup().handlers.discover(discovery({ doctorId: 'doctor', fromDate: day, days: 1, ...patch }))).rejects.toMatchObject({ code: 'invalid-argument' });
  });
  test('one/seven days, exact fields, ordering and lead-time boundary', async () => {
    const s = setup(); await s.handlers.replace(mutation());
    const seven = await s.handlers.discover(discovery({ doctorId: 'doctor', fromDate: day, days: 7 }));
    expect(seven).toEqual(await s.handlers.discover(discovery()));
    expect(Object.keys(seven)).toEqual(['times']);
    expect(seven.times.map(time => time.startAt)).toEqual([start, start + 1800000]);
    expect(seven.times[0]).toEqual({ doctorId: 'doctor', startAt: start, endAt: start + 1800000, availabilityId: availabilityId('doctor', day), availabilityRevision: 1 });
    expect(JSON.stringify(seven)).not.toMatch(/private|credential|phone|professional|reviewer/);
    s.setClock(start - 300000); expect((await s.handlers.discover(discovery())).times).toHaveLength(2);
    s.setClock(start - 300000 + 1); expect((await s.handlers.discover(discovery())).times.map(time => time.startAt)).toEqual([start + 1800000]);
    s.setClock(start + 1800000); expect((await s.handlers.discover(discovery())).times).toEqual([]);
  });
  test('missing/empty days return empty; range must not cross calendar horizon', async () => {
    const s = setup(); expect(await s.handlers.discover(discovery())).toEqual({ times: [] });
    const far = new Date(Date.parse(day + 'T00:00:00Z') + 90 * 86400000).toISOString().slice(0, 10);
    expect(await s.handlers.discover(discovery({ doctorId: 'doctor', fromDate: far, days: 1 }))).toEqual({ times: [] });
    await expect(s.handlers.discover(discovery({ doctorId: 'doctor', fromDate: far, days: 2 }))).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(s.handlers.discover(discovery({ doctorId: 'doctor', fromDate: '2026-10-04', days: 1 }))).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  test('seven populated UTC partitions return deterministic chronological candidates', async () => {
    const s = setup();
    // Insert in reverse order to ensure output follows requested UTC partitions.
    for (let offset = 6; offset >= 0; offset--) {
      const first = start + offset * 86400000, date = new Date(first).toISOString().slice(0, 10);
      await s.handlers.replace(mutation({ ...input(), utcDate: date, windows: [{ startAt: first, endAt: first + 1800000 }] }));
    }
    const result = await s.handlers.discover(discovery({ doctorId: 'doctor', fromDate: day, days: 7 }));
    expect(result.times.map(value => value.startAt)).toEqual(Array.from({ length: 7 }, (_, i) => start + i * 86400000));
    expect(new Set(result.times.map(value => value.availabilityId)).size).toBe(7);
    expect(result.times.every(value => value.availabilityRevision === 1)).toBe(true);
  });
  test('rolling 90-day start horizon filters last-day slots', async () => {
    const s = setup(), farMs = start + 90 * 86400000, far = new Date(farMs).toISOString().slice(0, 10);
    const data = { ...input(), utcDate: far, windows: [{ startAt: farMs - 3600000, endAt: farMs + 1800000 }] };
    s.docs['doctorAvailability/' + availabilityId('doctor', far)] = planAvailabilityReplacement('doctor', null, data, ts(now)).availability;
    expect((await s.handlers.discover(discovery({ doctorId: 'doctor', fromDate: far, days: 1 }))).times.map(t => t.startAt)).toEqual([farMs - 3600000]);
  });
  test('stored identity/day mismatch fails closed', async () => {
    const s = setup(); await s.handlers.replace(mutation());
    const path = 'doctorAvailability/' + availabilityId('doctor', day);
    s.docs[path] = { ...s.docs[path], doctorId: 'other' };
    await expect(s.handlers.discover(discovery())).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
