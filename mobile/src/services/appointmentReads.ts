import {collection, query, where, orderBy, limit, onSnapshot, Timestamp, getDocs, startAfter, documentId,
  type QueryDocumentSnapshot, type DocumentData, type QueryConstraint} from 'firebase/firestore';
import type {AppointmentStatus} from '@shared/types/scheduling';
import {db} from './firebaseConfig';

export type ParticipantRole = 'patient' | 'doctor';
export type AppointmentCursor = QueryDocumentSnapshot<DocumentData>;
export type AppointmentPageMode = 'upcoming' | 'history' | 'day';
export async function readAppointmentPage(uid: string, role: ParticipantRole, mode: AppointmentPageMode,
  boundary: number, cursor?: AppointmentCursor, end?: number) {
  const constraints: QueryConstraint[] = [where(`${role}Id`, '==', uid)];
  if (mode === 'upcoming') constraints.push(where('status', '==', 'scheduled'), where('startAt', '>=', Timestamp.fromMillis(boundary)));
  if (mode === 'day') {
    if (!Number.isFinite(end) || end! <= boundary) throw new Error('Invalid schedule range.');
    constraints.push(where('startAt', '>=', Timestamp.fromMillis(boundary)), where('startAt', '<', Timestamp.fromMillis(end!)));
  }
  const direction = mode === 'upcoming' ? 'asc' : 'desc';
  constraints.push(orderBy('startAt', direction), orderBy(documentId(), direction));
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(20));
  const result = await getDocs(query(collection(db, 'appointments'), ...constraints));
  return { rows: result.docs.map(d => parseAppointment(d.id, d.data(), uid, role)),
    cursor: result.docs.length === 20 ? result.docs[result.docs.length - 1] : null };
}
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
  next: (rows: AppointmentRow[]) => void, error: () => void, upcoming = false) {
  let active = true;
  const filters: QueryConstraint[] = [where(`${role}Id`,'==',uid)];
  if (upcoming) filters.push(where('status','==','scheduled'), where('startAt','>=',Timestamp.fromMillis(Date.now()-45*60000)));
  const stop = onSnapshot(query(collection(db,'appointments'), ...filters,
    orderBy('startAt',upcoming?'asc':'desc'), limit(50)), snapshot => {
      if (!active) return;
      try { next(snapshot.docs.map(d => parseAppointment(d.id,d.data(),uid,role))); }
      catch { error(); }
    }, () => { if (active) error(); });
  return () => { active = false; stop(); };
}
