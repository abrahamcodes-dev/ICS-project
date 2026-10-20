import { Timestamp } from 'firebase-admin/firestore';
import { createSchedulingReadStore } from '../src/scheduling/readStore';
import { planAvailabilityReplacement } from '../src/scheduling/policy';
import { approvedDocuments, input, day, now } from './availabilityFixtures';
import { fromMilliseconds } from '../src/scheduling/primitives';
import { availabilityId } from '../src/scheduling/ids';
function setup() {
  const data: Record<string, any> = {};
  const queries: any[] = [];
  const query: any = { orderBy: jest.fn(() => query), limit: jest.fn(() => query), startAfter: jest.fn(() => query), doc: (id: string) => ({ id }) };
  const tx = { get: jest.fn(async (ref: any) => ref === query ? { docs: [{ id: 'doctor' }] } : { data: () => data[ref.id] }) };
  const db: any = { collection: jest.fn((name: string) => { queries.push(name); return query; }), runTransaction: jest.fn((fn: any) => fn(tx)) };
  return { data, query, tx, db, run: createSchedulingReadStore(db) };
}
test('bounded document-ID query uses cursor and read-only transaction', async () => {
  const s = setup(); expect(await s.run(tx => tx.directory(40, 'before'))).toEqual(['doctor']);
  expect(s.query.limit).toHaveBeenCalledWith(40); expect(s.query.startAfter).toHaveBeenCalledWith('before');
  expect(s.db.collection).toHaveBeenCalledWith('doctorPublicProfiles');
  expect(s.db.runTransaction).toHaveBeenCalledWith(expect.any(Function), { readOnly: true });
});
test('missing availability remains null', async () => {
  const s = setup(); expect(await s.run(tx => tx.availability('absent'))).toBeNull();
});
test('real Firestore timestamps decoded and schema validated', async () => {
  const s = setup(), id = availabilityId('doctor', day);
  const value = planAvailabilityReplacement('doctor', null, input(), fromMilliseconds(now)).availability;
  const encode = (time: any) => new Timestamp(time.seconds, time.nanoseconds);
  s.data[id] = { ...value, createdAt: encode(value.createdAt), updatedAt: encode(value.updatedAt),
    windows: value.windows.map(w => ({ startAt: encode(w.startAt), endAt: encode(w.endAt) })) };
  expect(await s.run(tx => tx.availability(id))).toEqual(value);
  s.data[id].windows[0].startAt = value.windows[0].startAt;
  await expect(s.run(tx => tx.availability(id))).rejects.toThrow('stored-timestamp');
});
test('plain audit timestamp maps rejected', async () => {
  const s = setup(); s.data.doctor = approvedDocuments()['doctorProfiles/doctor'];
  await expect(s.run(tx => tx.profile('doctor'))).rejects.toThrow('stored-timestamp');
});
