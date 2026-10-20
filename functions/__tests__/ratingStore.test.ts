import { Timestamp } from 'firebase-admin/firestore';
import { createRatingStore } from '../src/ratings/store';
const id = 'a'.repeat(64);
const record = { consultationId: id, appointmentId: id, doctorId: 'd', patientId: 'p', score: 0, comment: '',
  createdAt: { seconds: 100, nanoseconds: 123 }, schemaVersion: 1 as const };
function fixture(data: any = undefined) {
  const tx = { get: jest.fn(async () => ({ data: () => data })), create: jest.fn(), set: jest.fn() };
  const db = { collection: (c: string) => ({ doc: (k: string) => `${c}/${k}` }), runTransaction: (f: any) => f(tx) };
  return { tx, store: createRatingStore(db as any) };
}
test('deterministic rating create and aggregate set use same transaction and preserve Timestamp', async () => {
  const f = fixture(); const summary = { doctorId: 'd', count: 1, sum: 0, schemaVersion: 1 as const };
  await f.store.transact(async tx => { tx.createRating(record); tx.saveSummary(summary); });
  expect(f.tx.create).toHaveBeenCalledWith('ratings/' + id, { ...record, createdAt: new Timestamp(100, 123) });
  expect(f.tx.set).toHaveBeenCalledWith('doctorRatingSummaries/d', summary);
});
test('read Timestamp decoding and missing record', async () => {
  expect(await fixture().store.transact(tx => tx.rating(id))).toBeNull();
  expect(await fixture({ ...record, createdAt: new Timestamp(100, 123) }).store.transact(tx => tx.rating(id))).toEqual(record);
});
test.each(['timestamp','binding'])('corrupt %s rejected', async kind => {
  const f = fixture({ ...record, createdAt: kind === 'timestamp' ? record.createdAt : new Timestamp(100, 123),
    consultationId: kind === 'binding' ? 'b'.repeat(64) : id });
  await expect(f.store.transact(tx => tx.rating(id))).rejects.toThrow();
});
