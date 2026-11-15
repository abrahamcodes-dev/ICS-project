import {Timestamp,type Firestore,type Transaction} from 'firebase-admin/firestore';
import {fail} from '../profiles/domainValidation';
import {validateAppointment} from '../scheduling/validation';
import {bookingLockId} from '../scheduling/ids';
import {toMilliseconds} from '../scheduling/primitives';
import type {Appointment} from '../../../shared/types/scheduling';
import {holdKeys} from '../scheduling/durations';
import type {RawReader} from '../scheduling/cellLocks';
export function decodeDraft(raw:FirebaseFirestore.DocumentData):Appointment{
 const time=(v:Timestamp)=>{if(!(v instanceof Timestamp))return fail('reservation-time');return {seconds:v.seconds,nanoseconds:v.nanoseconds};};
 return validateAppointment({...raw,startAt:time(raw.startAt),endAt:time(raw.endAt),createdAt:time(raw.createdAt),updatedAt:time(raw.updatedAt)});
}
export function encodeDraft(a:Appointment){const t=(v:{seconds:number;nanoseconds:number})=>new Timestamp(v.seconds,v.nanoseconds);return {...a,startAt:t(a.startAt),endAt:t(a.endAt),createdAt:t(a.createdAt),updatedAt:t(a.updatedAt)};}
/** Expiry is not authority to free an uncertain payment. Reconciliation releases
 * both ownership-bound hold documents only after definitive provider evidence. */
export async function paymentHold(db:Firestore,tx:Transaction,id:string,read:RawReader=async path=>(await tx.get(db.doc(path))).data()??null):Promise<Appointment|null>{
 const hold=await read('paymentSlotHolds/'+id);if(!hold)return null;
 const r=await read('paymentReservations/'+hold.reservationId);
 if(!r||r.state!=='held'||r.reservationId!==hold.reservationId)fail('orphan-payment-hold');
 const a=decodeDraft(r.draft),start=toMilliseconds(a.startAt),ids=holdKeys(a.patientId,a.doctorId,start,toMilliseconds(a.endAt),r.holdVersion??1);
 if(!ids.includes(id))fail('payment-hold-binding');
 for(const key of ids){const pair=await read('paymentSlotHolds/'+key);if(pair?.reservationId!==r.reservationId)fail('payment-hold-pair');}
 return a;
}
