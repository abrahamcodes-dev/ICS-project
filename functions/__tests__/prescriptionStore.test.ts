import { Timestamp } from 'firebase-admin/firestore';
import { createPrescriptionStore } from '../src/prescriptions/store';
const id = 'a'.repeat(64);
const record = { prescriptionId: id, consultationId: id, appointmentId: id, doctorId: 'doctor', patientId: 'patient',
  medications: [{ name: 'Synthetic', dosage: 'Entry', frequency: 'Entry', duration: 'Entry', instructions: 'Entry' }],
  issuedAt: { seconds: 100, nanoseconds: 123 }, schemaVersion: 1 as const, issuedBy: 'doctor',
  requestId: '12345678-1234-4234-8234-123456789abc' };
function fixture(stored: any = null) {
  const tx = { get: jest.fn(async () => ({ exists: stored !== null, data: () => stored })), create: jest.fn() };
  const db = { collection: (name: string) => ({ doc: (key: string) => `${name}/${key}` }),
    runTransaction: (f: any) => f(tx) };
  return { tx, store: createPrescriptionStore(db as any) };
}
test('writes use immutable create and exact Timestamp precision', async () => {
  const f = fixture(); await f.store.transact(async tx => tx.createPrescription(record));
  expect(f.tx.create).toHaveBeenCalledWith('prescriptions/' + id, { ...record, issuedAt: new Timestamp(100, 123) });
});
test('reads decode timestamps and tolerate Firestore map key ordering', async () => {
  const m = record.medications[0], f = fixture({ ...record, medications: [{ instructions: m.instructions, duration: m.duration,
    frequency: m.frequency, dosage: m.dosage, name: m.name }], issuedAt: new Timestamp(100, 123) });
  expect(await f.store.transact(tx => tx.prescription(id))).toEqual(record);
});
test('missing document is explicitly null', async () => {
  expect(await fixture().store.transact(tx => tx.prescription(id))).toBeNull();
});
test.each(['timestamp', 'binding'])('malformed %s fails closed', async kind => {
  const f = fixture({ ...record, issuedAt: kind === 'timestamp' ? record.issuedAt : new Timestamp(100, 123),
    prescriptionId: kind === 'binding' ? 'b'.repeat(64) : id });
  await expect(f.store.transact(tx => tx.prescription(id))).rejects.toThrow();
});
