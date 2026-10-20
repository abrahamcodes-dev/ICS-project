import { createPrescriptionHandlers, medications, type PrescriptionDependencies } from '../src/prescriptions/handlers';
import { documents, terminal, id, start, end, identity } from './consultationFixtures';
import { fromMilliseconds as t } from '../src/scheduling/primitives';
const med = { name: 'Synthetic medication', dosage: 'Clinician entry', frequency: 'Clinician entry', duration: 'Clinician entry', instructions: 'Synthetic instructions' };
const input = { consultationId: id, requestId: '12345678-1234-4234-8234-123456789abc', medications: [med] };
function fixture() {
  const data = documents(); terminal(data, 'completed');
  data['consultations/' + id] = { consultationId: id, appointmentId: id, patientId: 'patient', doctorId: 'doctor',
    appointmentStartAt: t(start), appointmentEndAt: t(end), createdAt: t(start), state: 'active', closedAt: null, schemaVersion: 1 };
  let abort = false, serial = Promise.resolve();
  const deps: PrescriptionDependencies = { now: () => t(end + 1), transact: action => {
    const result = serial.then(async () => {
      const staged: [string, unknown][] = []; let writing = false;
      const read = async (p: string) => { if (writing) throw Error('read-after-write'); return data[p] ?? null; };
      const save = (p: string, v: unknown) => { writing = true; staged.push([p, v]); };
      const value = await action({
        identity: uid => read('users/' + uid), profile: uid => read('doctorProfiles/' + uid),
        publicProfile: uid => read('doctorPublicProfiles/' + uid), verification: uid => read('verificationRequests/' + uid),
        appointment: uid => read('appointments/' + uid), consultation: uid => read('consultations/' + uid),
        prescription: uid => read('prescriptions/' + uid),
        create: () => { throw Error('unexpected room create'); }, close: c => save('consultations/' + id, c),
        createPrescription: p => { if (data['prescriptions/' + id]) throw Error('duplicate'); save('prescriptions/' + id, p); },
      });
      if (abort) throw Error('simulated storage failure');
      staged.forEach(([p, v]) => { data[p] = v; }); return value;
    });
    serial = result.then(() => undefined, () => undefined); return result;
  }};
  return { data, handlers: createPrescriptionHandlers(deps), abort: () => { abort = true; } };
}
const req = (uid = 'doctor', data: unknown = input) => ({ auth: { uid }, data });
test('approved doctor issues bound immutable record; both participants retrieve without private receipt', async () => {
  const f = fixture(); const result = await f.handlers.issue(req());
  expect(result.prescription).toMatchObject({ prescriptionId: id, doctorId: 'doctor', patientId: 'patient', issuedAt: end + 1 });
  expect(result.prescription).not.toHaveProperty('requestId'); expect(result.prescription).not.toHaveProperty('issuedBy');
  expect(f.data['consultations/' + id].state).toBe('closed');
  for (const uid of ['doctor', 'patient']) expect((await f.handlers.get(req(uid, { consultationId: id }))).prescription).toEqual(result.prescription);
});
test.each(['patient', 'stranger', 'administrator'])('%s cannot issue', async uid => {
  const f = fixture(); f.data['users/administrator'] = identity('administrator', 'administrator');
  await expect(f.handlers.issue(req(uid))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(f.data['prescriptions/' + id]).toBeUndefined();
});
test('guest and claim-only callers denied', async () => {
  const f = fixture();
  await expect(f.handlers.issue({ data: input })).rejects.toMatchObject({ code: 'unauthenticated' });
  delete f.data['users/doctor'];
  await expect(f.handlers.issue(req())).rejects.toMatchObject({ code: 'permission-denied' });
});
test.each(['disabled', 'approval', 'projection', 'patient'])('new issuance fails closed on %s', async kind => {
  const f = fixture();
  if (kind === 'disabled') f.data['users/doctor'].status = 'disabled';
  if (kind === 'approval') f.data['users/doctor'].verificationStatus = 'pending';
  if (kind === 'projection') delete f.data['doctorPublicProfiles/doctor'];
  if (kind === 'patient') f.data['users/patient'].status = 'disabled';
  await expect(f.handlers.issue(req())).rejects.toMatchObject({ code: 'permission-denied' });
});
test.each(['scheduled', 'no_show', 'cancelled'])('rejects %s appointment', async status => {
  const f = fixture();
  if (status === 'scheduled') f.data['appointments/' + id] = documents()['appointments/' + id];
  else terminal(f.data, status as 'no_show' | 'cancelled');
  await expect(f.handlers.issue(req())).rejects.toMatchObject({ code: 'failed-precondition' });
});
test('exact concurrent retries converge; changed content or request ID conflicts', async () => {
  const f = fixture(); const results = await Promise.all([f.handlers.issue(req()), f.handlers.issue(req())]);
  expect(results.map(r => r.replayed)).toEqual([false, true]);
  for (const change of [{ medications: [{ ...med, dosage: 'Changed' }] }, { requestId: '22345678-1234-4234-8234-123456789abc' }])
    await expect(f.handlers.issue(req('doctor', { ...input, ...change }))).rejects.toMatchObject({ code: 'already-exists' });
});
test('history and exact replay survive approval loss; disabled caller remains denied', async () => {
  const f = fixture(); await f.handlers.issue(req());
  f.data['users/doctor'].verificationStatus = 'pending'; delete f.data['doctorPublicProfiles/doctor'];
  expect((await f.handlers.issue(req())).replayed).toBe(true);
  expect((await f.handlers.get(req('patient', { consultationId: id }))).prescription).not.toBeNull();
  f.data['users/patient'].status = 'disabled';
  await expect(f.handlers.get(req('patient', { consultationId: id }))).rejects.toMatchObject({ code: 'permission-denied' });
});
test('unrelated reader and corrupted record bindings denied', async () => {
  const f = fixture(); await f.handlers.issue(req());
  f.data['users/other'] = identity('other', 'patient');
  await expect(f.handlers.get(req('other', { consultationId: id }))).rejects.toMatchObject({ code: 'permission-denied' });
  f.data['prescriptions/' + id].patientId = 'other';
  await expect(f.handlers.get(req('doctor', { consultationId: id }))).rejects.toMatchObject({ code: 'permission-denied' });
});
test('missing consultation denied; missing prescription returns null', async () => {
  const f = fixture(); expect((await f.handlers.get(req('patient', { consultationId: id }))).prescription).toBeNull();
  delete f.data['consultations/' + id];
  await expect(f.handlers.issue(req())).rejects.toMatchObject({ code: 'permission-denied' });
});
test('rollback leaves no prescription or closure', async () => {
  const f = fixture(); f.abort();
  await expect(f.handlers.issue(req())).rejects.toMatchObject({ code: 'internal' });
  expect(f.data['prescriptions/' + id]).toBeUndefined(); expect(f.data['consultations/' + id].state).toBe('active');
});
test.each([[], Array(11).fill(med), [{ ...med, dosage: '' }], [{ ...med, extra: true }], [{ ...med, instructions: 'a'.repeat(1001) }]].map(value => ({ value })))('invalid structured data rejected %#', ({ value }) => {
  expect(() => medications(value)).toThrow();
});
test('client binding/timestamp fields rejected', async () => {
  const f = fixture();
  for (const field of ['doctorId', 'patientId', 'issuedAt']) await expect(f.handlers.issue(req('doctor', { ...input, [field]: 'forged' }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
