import {doc, getDocFromServer, Timestamp} from 'firebase/firestore';
import {db} from './firebaseConfig';
import {parseAppointment, type ParticipantRole} from './appointmentReads';
import type {ConsultationView} from './consultationService';

/** Read existing records only. Never open/reconcile a room or read an individual message. */
export async function readConsultationHistory(id:string, uid:string, role:ParticipantRole):Promise<ConsultationView> {
  if (!uid || !['patient','doctor'].includes(role) || !/^[a-f0-9]{64}$/.test(id)) throw new Error('Unavailable');
  const appointment = await getDocFromServer(doc(db,'appointments',id));
  if (!appointment.exists()) throw new Error('Unavailable');
  const a = parseAppointment(id,appointment.data(),uid,role);
  if (a.status !== 'completed') throw new Error('Unavailable');
  const snapshot = await getDocFromServer(doc(db,'consultations',id));
  if (!snapshot.exists()) throw new Error('Unavailable');
  const c = snapshot.data();
  if (c.schemaVersion !== 1 || c.consultationId !== id || c.appointmentId !== id || c.state !== 'closed'
    || c.patientId !== a.patientId || c.doctorId !== a.doctorId
    || !(c.appointmentStartAt instanceof Timestamp) || c.appointmentStartAt.toMillis() !== a.startAt
    || !(c.appointmentEndAt instanceof Timestamp) || c.appointmentEndAt.toMillis() !== a.endAt
    || !(c.createdAt instanceof Timestamp) || !(c.closedAt instanceof Timestamp)) throw new Error('Unavailable');
  return {consultationId:id, appointmentId:id, patientId:a.patientId, doctorId:a.doctorId,
    appointmentStartAt:a.startAt, appointmentEndAt:a.endAt, state:'closed',
    createdAt:c.createdAt.toMillis(), closedAt:c.closedAt.toMillis(), canSend:false};
}
