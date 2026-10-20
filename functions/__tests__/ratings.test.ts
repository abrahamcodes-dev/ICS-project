import { createRatingHandlers, type RatingDependencies, score, comment } from '../src/ratings/handlers';
import { documents, terminal, id, start, end, identity, memory } from './consultationFixtures';
import { fromMilliseconds as t } from '../src/scheduling/primitives';
function fixture() {
  const data = documents(); terminal(data, 'completed');
  data['consultations/' + id] = { consultationId: id, appointmentId: id, patientId: 'patient', doctorId: 'doctor',
    appointmentStartAt: t(start), appointmentEndAt: t(end), createdAt: t(start), state: 'closed', closedAt: t(end), schemaVersion: 1 };
  const base = memory(data, end + 1); let serial = Promise.resolve(), abort = false;
  const deps: RatingDependencies = { now: base.deps.now, transact: action => {
    const result = serial.then(() => base.deps.transact(async tx => {
      const writes: (() => void)[] = []; let writing = false;
      const read = (p: string) => { if (writing) throw Error('read after write'); return Promise.resolve(data[p] ?? null); };
      const value = await action({ ...tx, rating: cid => read('ratings/' + cid), summary: uid => read('doctorRatingSummaries/' + uid),
        createRating: r => { writing = true; writes.push(() => { data['ratings/' + r.consultationId] = r; }); },
        saveSummary: s => { writing = true; writes.push(() => { data['doctorRatingSummaries/' + s.doctorId] = s; }); },
      });
      if (abort) throw Error('storage failure'); writes.forEach(w => w()); return value;
    }));
    serial = result.then(() => undefined, () => undefined); return result;
  }};
  return { data, h: createRatingHandlers(deps), abort: () => { abort = true; } };
}
const req = (uid = 'patient', data: unknown = { consultationId: id, score: 0, comment: '' }) => ({ auth: { uid }, data });
test('zero accepted with trusted bindings and private comment; doctor receives aggregate only', async () => {
  const f = fixture(), before = JSON.stringify(f.data['consultations/' + id]);
  expect(await f.h.rate(req())).toMatchObject({ rating: { consultationId: id, score: 0, comment: '', createdAt: end + 1 }, replayed: false });
  expect(f.data['ratings/' + id]).toMatchObject({ patientId: 'patient', doctorId: 'doctor', appointmentId: id, schemaVersion: 1 });
  expect(await f.h.summary(req('doctor', {}))).toEqual({ count: 1, average: 0 });
  expect(JSON.stringify(f.data['consultations/' + id])).toBe(before);
});
test('empty summary is not a fabricated zero rating', async () => {
  expect(await fixture().h.summary(req('doctor', {}))).toEqual({ count: 0, average: null });
});
test.each(['doctor', 'administrator', 'other'])('%s cannot create or read a patient rating', async uid => {
  const f = fixture(); f.data['users/administrator'] = identity('administrator', 'administrator'); f.data['users/other'] = identity('other', 'patient');
  await expect(f.h.rate(req(uid))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(f.h.get(req(uid, { consultationId: id }))).rejects.toMatchObject({ code: 'permission-denied' });
});
test('guest, missing canonical identity and disabled patient denied', async () => {
  const f = fixture(); await expect(f.h.rate({ data: {} })).rejects.toMatchObject({ code: 'unauthenticated' });
  f.data['users/patient'].status = 'disabled'; await expect(f.h.rate(req())).rejects.toMatchObject({ code: 'permission-denied' });
  delete f.data['users/patient']; await expect(f.h.rate(req())).rejects.toMatchObject({ code: 'permission-denied' });
});
test.each(['scheduled', 'cancelled', 'no_show'])('rejects %s without modifying lifecycle', async status => {
  const f = fixture(); if (status === 'scheduled') f.data['appointments/' + id] = documents()['appointments/' + id];
  else terminal(f.data, status as 'cancelled' | 'no_show');
  await expect(f.h.rate(req())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(f.data['ratings/' + id]).toBeUndefined();
});
test('missing or mismatched room denied', async () => {
  const f = fixture(); f.data['consultations/' + id].patientId = 'other';
  await expect(f.h.rate(req())).rejects.toMatchObject({ code: 'permission-denied' });
  delete f.data['consultations/' + id]; await expect(f.h.rate(req())).rejects.toMatchObject({ code: 'permission-denied' });
});
test('parallel duplicate retries do not double aggregate; conflicting retry rejected', async () => {
  const f = fixture(); const results = await Promise.all([f.h.rate(req()), f.h.rate(req())]);
  expect(results).toEqual([expect.objectContaining({ replayed: false }), expect.objectContaining({ replayed: true })]);
  expect(await f.h.summary(req('doctor', {}))).toEqual({ count: 1, average: 0 });
  await expect(f.h.rate(req('patient', { consultationId: id, score: 5 }))).rejects.toMatchObject({ code: 'already-exists' });
});
test('own rating retrieval survives doctor approval loss', async () => {
  const f = fixture(); f.data['users/doctor'].verificationStatus = 'pending';
  await f.h.rate(req()); expect(await f.h.get(req('patient', { consultationId: id }))).toHaveProperty('rating.score', 0);
});
test('rollback leaves rating and aggregate absent', async () => {
  const f = fixture(); f.abort(); await expect(f.h.rate(req())).rejects.toMatchObject({ code: 'internal' });
  expect(f.data['ratings/' + id]).toBeUndefined(); expect(f.data['doctorRatingSummaries/doctor']).toBeUndefined();
});
test('corrupt aggregate or existing binding fails closed', async () => {
  const f = fixture(); f.data['doctorRatingSummaries/doctor'] = { doctorId: 'other', sum: 1, count: 1, schemaVersion: 1 };
  await expect(f.h.rate(req())).rejects.toMatchObject({ code: 'permission-denied' });
  delete f.data['doctorRatingSummaries/doctor']; await f.h.rate(req()); f.data['ratings/' + id].patientId = 'other';
  await expect(f.h.get(req('patient', { consultationId: id }))).rejects.toMatchObject({ code: 'permission-denied' });
});
test.each([-1,6,1.5,'5',null,NaN])('invalid score %p', value => { expect(() => score(value)).toThrow(); });
test('bounded optional comment and unknown fields', async () => {
  expect(comment(undefined)).toBe(''); expect(comment(' note ')).toBe('note'); expect(() => comment('x'.repeat(1001))).toThrow();
  const f = fixture(); await expect(f.h.rate(req('patient', { consultationId: id, score: 2, doctorId: 'forged' }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
test('summary derives own doctor ID and denies patients and injected target', async () => {
  const f = fixture(); await expect(f.h.summary(req('patient', {}))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(f.h.summary(req('doctor', { doctorId: 'other' }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
