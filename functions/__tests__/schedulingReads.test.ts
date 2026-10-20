import { createSchedulingReads, DIRECTORY_SCAN_LIMIT, SchedulingReadTransaction } from '../src/scheduling/readHandlers';
import { approvedDocuments, identity, day, input, now } from './availabilityFixtures';
import { planAvailabilityReplacement } from '../src/scheduling/policy';
import { fromMilliseconds } from '../src/scheduling/primitives';
import { availabilityId } from '../src/scheduling/ids';

function setup() {
  const docs = approvedDocuments(), reads: string[] = [];
  const read = async (path: string) => { reads.push(path); return docs[path] ?? null; };
  const directory = jest.fn(async (limit: number, after?: string) => Object.keys(docs)
    .filter(p => p.startsWith('doctorPublicProfiles/')).map(p => p.split('/')[1]).sort()
    .filter(id => !after || id > after).slice(0, limit));
  const tx: SchedulingReadTransaction = {
    identity: id => read('users/' + id), profile: id => read('doctorProfiles/' + id),
    publicProfile: id => read('doctorPublicProfiles/' + id), verification: id => read('verificationRequests/' + id),
    availability: id => read('doctorAvailability/' + id), directory,
  };
  return { docs, reads, directory, handlers: createSchedulingReads(action => action(tx)) };
}
const list = (data: unknown = {}, uid = 'patient') => ({ auth: { uid }, data });
const own = (data: unknown = { utcDate: day }, uid = 'doctor') => ({ auth: { uid }, data });
test.each(['list', 'ownDay'] as const)('%s denies guest', async method => {
  await expect(setup().handlers[method]({ data: {} })).rejects.toMatchObject({ code: 'unauthenticated' });
});
test.each(['doctor', 'administrator', 'admin', 'unknown'])('directory denies %s caller', async role => {
  const s = setup(); s.docs['users/patient'] = identity('patient', role);
  await expect(s.handlers.list(list())).rejects.toMatchObject({ code: 'permission-denied' });
  expect(s.directory).not.toHaveBeenCalled();
});
test.each(['patient', 'administrator', 'admin'])('own day denies %s', async role => {
  const s = setup(); s.docs['users/doctor'] = identity('doctor', role);
  await expect(s.handlers.ownDay(own())).rejects.toMatchObject({ code: 'permission-denied' });
});
test.each(['list', 'ownDay'] as const)('%s disabled and claim-only denied', async method => {
  const s = setup(), uid = method === 'list' ? 'patient' : 'doctor';
  s.docs['users/' + uid].status = 'disabled';
  const request = { auth: { uid, token: { role: 'administrator', verificationStatus: 'approved' } }, data: method === 'list' ? {} : { utcDate: day } };
  await expect(s.handlers[method](request)).rejects.toMatchObject({ code: 'permission-denied' });
  delete s.docs['users/' + uid];
  await expect(s.handlers[method](request)).rejects.toMatchObject({ code: 'permission-denied' });
});
test.each([0, 21, -1, 1.1, '10', null])('invalid directory limit %p', async limit => {
  await expect(setup().handlers.list(list({ limit }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
test.each([{ after: '../bad' }, { role: 'patient' }, { limit: 10, extra: true }])('strict directory input %p', async data => {
  await expect(setup().handlers.list(list(data))).rejects.toMatchObject({ code: 'invalid-argument' });
});
test('directory response contains only public DTO and explicit cursor', async () => {
  const s = setup(); expect(await s.handlers.list(list())).toEqual({
    items: [{ uid: 'doctor', professionalName: 'Doctor Name', specialty: 'Medicine' }], nextCursor: null,
  });
  expect(s.directory).toHaveBeenCalledWith(40, undefined);
});
test.each([{ status: 'disabled' }, { verificationStatus: 'pending' }, { verificationStatus: 'rejected' }, { extra: true }])('ineligible doctor omitted %p', async patch => {
  const s = setup(); Object.assign(s.docs['users/doctor'], patch);
  expect(await s.handlers.list(list())).toEqual({ items: [], nextCursor: null });
});
test.each(['doctorProfiles/doctor', 'doctorPublicProfiles/doctor', 'verificationRequests/approved'])('malformed binding fails closed: %s', async path => {
  const s = setup(); s.docs[path].unexpected = 'private';
  await expect(s.handlers.list(list())).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(s.handlers.ownDay(own())).rejects.toMatchObject({ code: 'failed-precondition' });
});
test('stale approval revision fails closed', async () => {
  const s = setup(); s.docs['doctorPublicProfiles/doctor'].approvedRevision++;
  await expect(s.handlers.list(list())).rejects.toMatchObject({ code: 'failed-precondition' });
});
test('scan cap with excluded records advances to valid doctor without infinite refill', async () => {
  const s = setup(); for (let i = 0; i < 45; i++) s.docs['doctorPublicProfiles/a' + String(i).padStart(2, '0')] = {};
  const first = await s.handlers.list(list({ limit: 1 }));
  expect(first).toEqual({ items: [], nextCursor: 'a39' });
  expect(s.directory).toHaveBeenCalledTimes(1);
  expect(await s.handlers.list(list({ limit: 1, after: first.nextCursor }))).toMatchObject({ items: [{ uid: 'doctor' }], nextCursor: null });
  expect(s.directory).toHaveBeenLastCalledWith(DIRECTORY_SCAN_LIMIT, 'a39');
});
test('page-full cursor resumes at last consumed record, not end of scan', async () => {
  const s = setup(); s.docs['doctorPublicProfiles/z'] = {};
  expect(await s.handlers.list(list({ limit: 1 }))).toMatchObject({ nextCursor: 'doctor' });
  expect(await s.handlers.list(list({ limit: 1, after: 'doctor' }))).toEqual({ items: [], nextCursor: null });
});
test.each(['2026-02-30', 'today', '2026-10-05T00:00:00Z', ''])('invalid date %s', async utcDate => {
  await expect(setup().handlers.ownDay(own({ utcDate }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
test('cannot supply another owner', async () => {
  await expect(setup().handlers.ownDay(own({ utcDate: day, doctorId: 'other' }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
test('missing day explicit null, existing day revision and windows only', async () => {
  const s = setup(); expect(await s.handlers.ownDay(own())).toEqual({ day: null });
  s.docs['doctorAvailability/' + availabilityId('doctor', day)] = planAvailabilityReplacement('doctor', null, input(), fromMilliseconds(now)).availability;
  expect(await s.handlers.ownDay(own())).toEqual({ day: { utcDate: day, timeZone: input().timeZone, revision: 1, windows: input().windows } });
  expect(s.reads.some(path => /bookingLocks|appointments/.test(path))).toBe(false);
});
test.each([{ doctorId: 'other' }, { utcDate: '2026-10-06' }, { revision: 0 }, { schemaVersion: 2 }])('corrupt availability %p', async patch => {
  const s = setup(); s.docs['doctorAvailability/' + availabilityId('doctor', day)] = {
    ...planAvailabilityReplacement('doctor', null, input(), fromMilliseconds(now)).availability, ...patch,
  };
  await expect(s.handlers.ownDay(own())).rejects.toMatchObject({ code: 'failed-precondition' });
});
test('unexpected storage failure is sanitized', async () => {
  const handlers = createSchedulingReads(async () => { throw new Error('private data'); });
  await expect(handlers.list(list())).rejects.toMatchObject({ code: 'internal', message: 'Unable to read scheduling data. Please retry.' });
});
