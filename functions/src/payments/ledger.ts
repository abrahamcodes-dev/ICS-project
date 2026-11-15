import {Timestamp,type Firestore,type Transaction} from 'firebase-admin/firestore';
import type {Appointment} from '../../../shared/types/scheduling';
import type {PaymentStatus} from '../../../shared/types/payments';
import {assertTransition} from './policy';
export function transition(db:Firestore,tx:Transaction,id:string,record:FirebaseFirestore.DocumentData,status:PaymentStatus,extra:Record<string,unknown>={}){
 assertTransition(record.status,status);const now=Timestamp.now();
 const {auditActorUid=null,...updates}=extra;
 tx.update(db.doc('consultationPayments/'+id),{...updates,status,updatedAt:now});
 if(record.status!==status)tx.create(db.collection(`consultationPayments/${id}/audit`).doc(),{from:record.status,to:status,at:now,reasonCode:extra.reasonCode??null,actorUid:auditActorUid,providerSequence:extra.providerSequence??record.providerSequence??null,demo:true});
}
/** Prepare all reads before lifecycle writes; return only a trusted write plan. */
export async function cancellationRefund(db:Firestore,tx:Transaction,appointment:Appointment){
 const record=(await tx.get(db.doc('consultationPayments/'+appointment.appointmentId))).data();
 if(!record)return ()=>{};if(record.patientId!==appointment.patientId||record.doctorId!==appointment.doctorId||record.appointmentId!==appointment.appointmentId)throw Error('Payment binding');
 return ()=>{if(record.status==='succeeded')transition(db,tx,appointment.appointmentId,record,'refund_pending',{reasonCode:'appointment_cancelled',auditActorUid:appointment.cancellation?.cancelledBy??null,nextReconcileAt:Timestamp.now()});};
}
