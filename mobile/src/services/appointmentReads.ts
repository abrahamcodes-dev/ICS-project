import {collection, query, where, orderBy, limit, onSnapshot, Timestamp} from 'firebase/firestore';
import type {AppointmentStatus} from '@shared/types/scheduling';
import {db} from './firebaseConfig';

export type ParticipantRole = 'patient' | 'doctor';
export interface AppointmentRow {
  appointmentId: string; patientId: string; doctorId: string;
  startAt: number; endAt: number; status: AppointmentStatus;
}
export function parseAppointment(id: string, data: any, uid: string, role: ParticipantRole): AppointmentRow {
  if (!/^[a-f0-9]{64}$/.test(id) || data.appointmentId !== id || data.schemaVersion !== 1
    || typeof data.patientId !== 'string' || typeof data.doctorId !== 'string'
    || data.patientId === data.doctorId || data[`${role}Id`] !== uid
    || !['scheduled','cancelled','completed','no_show'].includes(data.status)
    || !(data.startAt instanceof Timestamp) || !(data.endAt instanceof Timestamp)
    || data.endAt.toMillis() <= data.startAt.toMillis()) throw new Error('Invalid appointment');
  return {appointmentId:id,patientId:data.patientId,doctorId:data.doctorId,
    startAt:data.startAt.toMillis(),endAt:data.endAt.toMillis(),status:data.status};
}
/** Presentation hint only; backend time, identities and approval remain authoritative. */
export function consultationUnavailable(a: AppointmentRow, uid: string, role: ParticipantRole, now: number): string | null {
  if (a[`${role}Id`] !== uid) return 'This appointment does not belong to your account.';
  if (a.status !== 'scheduled') return `This appointment is ${a.status.replace('_',' ')}.`;
  if (now < a.startAt) return 'Consultation opens at the appointment start time.';
  if (now >= a.endAt + 15 * 60 * 1000) return 'The consultation window has expired.';
  return null;
}
/** Existing participant/startAt descending indexes; no client writes or legacy booking service. */
export function observeAppointments(uid: string, role: ParticipantRole,
  next: (rows: AppointmentRow[]) => void, error: () => void) {
  let active = true;
  const stop = onSnapshot(query(collection(db,'appointments'), where(`${role}Id`,'==',uid),
    orderBy('startAt','desc'), limit(50)), snapshot => {
      if (!active) return;
      try { next(snapshot.docs.map(d => parseAppointment(d.id,d.data(),uid,role))); }
      catch { error(); }
    }, () => { if (active) error(); });
  return () => { active = false; stop(); };
}
