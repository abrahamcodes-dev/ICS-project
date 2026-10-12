import { documents, id, path, start } from './consultationFixtures';
import { planOpen } from '../src/consultations/policy';
import { fromMilliseconds as t } from '../src/scheduling/primitives';
import type { MessageDependencies, MessageTransaction } from '../src/consultations/messageHandler';
export { id, path, start };
export const uuid = '12345678-1234-4234-8234-123456789abc';
export const secondUuid = '22345678-1234-4234-8234-123456789abc';
export const input = (messageRequestId = uuid, text = 'Synthetic text') => ({ consultationId: id, messageRequestId, text });
export const sendRequest = (uid = 'patient', data: unknown = input()) => ({ auth: { uid }, data });
export function messageDocuments() {
  const data = documents(), a = data['appointments/' + id];
  data[path] = planOpen({ appointmentId: id }, { appointmentId: id, patientId: a.patientId, doctorId: a.doctorId,
    startAt: a.startAt, endAt: a.endAt, status: a.status }, null,
    { caller: data['users/patient'], patient: data['users/patient'], doctor: data['users/doctor'] }, t(start)).consultation;
  return data;
}
export function messageMemory(data = messageDocuments(), clock= start) {
  const reads: string[] = [];
  const deps: MessageDependencies = { now: () => t(clock), transact: async action => {
    let writing = false; const writes: (() => void)[] = [];
    const read = async (key: string) => { if (writing) throw new Error('read after write'); reads.push(key); return data[key]?? null; };
    const tx: MessageTransaction = {
      identity: uid => read('users/' + uid), profile: uid => read('doctorProfiles/' + uid), publicProfile: uid => read('doctorPublicProfiles/' + uid),
      verification: key => read('verificationRequests/' + key), appointment: key => read('appointments/' + key), consultation: key => read('consultations/' + key),
      message: (room, key) => read('consultations/' + room + '/messages/' + key), senderState: (room, uid) => read('consultations/' + room + '/senderState/' + uid),
      createMessage: (room, value) => { writing = true; const key = 'consultations/' + room + '/messages/' + value.messageId;
        writes.push(() => { if (data[key]) throw new Error('already exists'); data[key] = value; }); },
      saveSenderState: value => { writing = true; writes.push(() => { data['consultations/' + value.consultationId + '/senderState/' + value.senderId] = value; }); },
      close: value => { writing = true; writes.push(() => { data['consultations/' + value.consultationId] = value; }); },
    };
    const result = await action(tx); writes.forEach(write => write()); return result;
  } };
  return { data, reads, deps };
}
