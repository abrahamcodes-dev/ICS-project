import {collection, doc, query, where, orderBy, limit, onSnapshot, Timestamp, getDocs, startAfter, documentId,
  type QueryDocumentSnapshot, type DocumentData, type QueryConstraint} from 'firebase/firestore';
import type {AppointmentStatus} from '@shared/types/scheduling';
import {db} from './firebaseConfig';

export type ParticipantRole = 'patient' | 'doctor';
export type AppointmentCursor = QueryDocumentSnapshot<DocumentData>;
export type AppointmentPageMode = 'upcoming' | 'history' | 'day';
/** Rules authorize the participant; parse again before exposing any appointment state. */
export function observeAppointment(uid:string,role:ParticipantRole,id:string,next:(row:AppointmentRow)=>void,error:()=>void){
  if(!/^[a-f0-9]{64}$/.test(id)){error();return()=>{};}
  let active=true;
  const stop=onSnapshot(doc(db,'appointments',id),snapshot=>{
    if(!active)return;
    try{if(!snapshot.exists())throw new Error('Unavailable');next(parseAppointment(snapshot.id,snapshot.data(),uid,role));}catch{error();}
  },()=>{if(active)error();});
  return()=>{active=false;stop();};
}
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
  doctorDisplay?: {professionalName:string;specialty:string};
}
export function parseAppointment(id: string, data: any, uid: string, role: ParticipantRole): AppointmentRow {
  if (!/^[a-f0-9]{64}$/.test(id) || data.appointmentId !== id || data.schemaVersion !== 1
    || typeof data.patientId !== 'string' || typeof data.doctorId !== 'string'
    || data.patientId === data.doctorId || data[`${role}Id`] !== uid
    || !['scheduled','cancelled','completed','no_show'].includes(data.status)
    || !(data.startAt instanceof Timestamp) || !(data.endAt instanceof Timestamp)
    || data.endAt.toMillis() <= data.startAt.toMillis()) throw new Error('Invalid appointment');
  const display=data.doctorDisplay;
  const validDisplay=display&&typeof display==='object'&&!Array.isArray(display)&&Object.keys(display).sort().join(',')==='professionalName,specialty'
    &&[display.professionalName,display.specialty].every((value,index)=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=(index===0?200:120)&&!/[\u0000-\u001f\u007f]/.test(value));
  return {appointmentId:id,patientId:data.patientId,doctorId:data.doctorId,...(validDisplay?{doctorDisplay:{professionalName:display.professionalName,specialty:display.specialty}}:{}),
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
  if (upcoming) filters.push(where('status','==','scheduled'), where('startAt','>=',Timestamp.fromMillis(Date.now()-75*60000)));
  const stop = onSnapshot(query(collection(db,'appointments'), ...filters,
    orderBy('startAt',upcoming?'asc':'desc'), limit(50)), snapshot => {
      if (!active) return;
      try { next(snapshot.docs.map(d => parseAppointment(d.id,d.data(),uid,role))); }
      catch { error(); }
    }, () => { if (active) error(); });
  return () => { active = false; stop(); };
}
