import { approvedDocuments, start, now, identity } from './availabilityFixtures';
import { fromMilliseconds as t } from '../src/scheduling/primitives';
import { availabilityId } from '../src/scheduling/ids';
import type { ConsultationDependencies, ConsultationTransaction } from '../src/consultations/openHandler';
export { start, identity };
export const end = start + 1800000, deadline = end + 900000, id = 'c'.repeat(64), path = 'consultations/' + id;
export function documents(): Record<string, any> {
  return { ...approvedDocuments(), ['appointments/' + id]: { appointmentId: id, patientId: 'patient', doctorId: 'doctor',
    availabilityId: availabilityId('doctor', '2026-10-05'), availabilityRevision: 1, startAt: t(start), endAt: t(end),
    doctorDisplay: { professionalName: 'Doctor Name', specialty: 'Medicine' }, status: 'scheduled', cancellation: null, outcome: null,
    schemaVersion: 1, createdAt: t(now), updatedAt: t(now) } };
}
export function terminal(data: Record<string, any>, status: 'cancelled' | 'completed' | 'no_show', at = status === 'cancelled' ? start - 1 : end) {
  data['appointments/' + id] = { ...data['appointments/' + id], status, updatedAt: t(at),
    cancellation: status === 'cancelled' ? { cancelledBy: 'patient', cancelledAt: t(at), reason: null } : null,
    outcome: status === 'cancelled' ? null : { recordedBy: 'doctor', recordedAt: t(at) } };
}
export const request = (uid = 'patient', data: unknown = { appointmentId: id }) => ({ auth: { uid }, data });
export function memory(data = documents(), time = start) {
  const calls: string[] = [];
  const deps: ConsultationDependencies = { now: () => t(time), transact: async action => {
    const writes: (() => void)[] = []; let writing = false;
    const read = async (p: string) => { if (writing) throw new Error('read after write'); calls.push(p); return data[p] ?? null; };
    const tx: ConsultationTransaction = {
      identity: uid => read('users/' + uid), profile: uid => read('doctorProfiles/' + uid), publicProfile: uid => read('doctorPublicProfiles/' + uid),
      verification: uid => read('verificationRequests/' + uid), appointment: uid => read('appointments/' + uid), consultation: uid => read('consultations/' + uid),
      create: c => { writing = true; writes.push(() => { if (data[path]) throw new Error('exists'); data[path] = c; }); },
      close: c => { writing = true; writes.push(() => { data[path] = c; }); },
    };
    const result = await action(tx); writes.forEach(write => write()); return result;
  } };
  return { deps, data, calls };
}
