import {type Firestore} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {strictRecord} from '../profiles/domainValidation';
import {digestId} from '../scheduling/ids';
import {holdKeys} from '../scheduling/durations';
import {createAuthorization} from '../shared/authorization';
import {availabilityTransaction} from '../scheduling/availabilityStore';
import {approvedDoctor} from '../scheduling/availabilityHandlers';
import {assertFullCoverage} from '../scheduling/reservationGuards';
import {assertBookableStart,fromMilliseconds} from '../scheduling/primitives';
import {decodeDraft} from './reservations';
import {authorizePayment,paymentView,reconcilePayment} from './engine';
import {requireSimulationEnvironment} from './policy';
import {SimulatedMpesaProvider} from './provider';

/** Owner requests a simulator decision, never a financial status or amount.
 * One immutable provider event per payment serializes approve/decline races.
 * Durable event delivery survives a lost reconciliation response. */
export async function requestSimulationOutcome(db:Firestore,uid:string,input:unknown){
 requireSimulationEnvironment();
 const d=strictRecord(input,['paymentId','decision'],['paymentId','decision']),id=digestId(d.paymentId);
 if(d.decision!=='approve'&&d.decision!=='decline')throw new HttpsError('invalid-argument','Choose approve or decline.');
 const checkProvider=(p:FirebaseFirestore.DocumentData)=>{
  if(p.demo!==true||p.provider!=='simulated-mpesa'||p.method!=='simulated_mpesa'||p.currency!=='KES')
   throw new HttpsError('failed-precondition','Only simulated M-Pesa payments support this action.');
 };
 checkProvider(await authorizePayment(db,uid,id,true));
 // Resolve an earlier durable event or natural expiry before accepting a decision.
 await reconcilePayment(db,id);
 const current=await authorizePayment(db,uid,id,true);checkProvider(current);
 if(!['created','pending'].includes(current.status))return {payment:paymentView(current)};
 const provider=new SimulatedMpesaProvider(db);
 await provider.deliver(id,d.decision==='approve'?'success':'declined','patient-decision',async(tx,replay,evidence)=>{
  const a=await createAuthorization(async key=>(await tx.get(db.doc('users/'+key))).data()).requireActive({uid});
  const p=(await tx.get(db.doc('consultationPayments/'+id))).data();
  if(a.role!=='patient'||!p||p.patientId!==uid)throw new HttpsError('permission-denied','Own patient payment required.');
  checkProvider(p);
  if(evidence.amountMinor!==p.amountMinor||evidence.currency!==p.currency||evidence.paymentId!==id)throw new HttpsError('failed-precondition','Simulator evidence mismatch.');
  if(replay)return;
  if(!['created','pending'].includes(p.status)||evidence.status!=='pending')throw new HttpsError('failed-precondition','Refresh this payment before continuing.');
  const r=(await tx.get(db.doc('paymentReservations/'+id))).data();
  if(!r||r.state!=='held'||r.reservationId!==id||r.patientId!==uid||r.doctorId!==p.doctorId||r.expiresAt.toMillis()<=Date.now())
   throw new HttpsError('failed-precondition','Reservation expired or unavailable. Refresh payment status.');
  const draft=decodeDraft(r.draft),scheduling=availabilityTransaction(db,tx);
  if(draft.appointmentId!==id||draft.patientId!==uid||draft.doctorId!==p.doctorId||draft.startAt.seconds*1000!==p.startAt||draft.endAt.seconds*1000!==p.endAt)
   throw new HttpsError('failed-precondition','Reservation binding changed.');
  if(d.decision==='approve'){
   for(const key of holdKeys(uid,p.doctorId,p.startAt,p.endAt,r.holdVersion??1)){
    if((await tx.get(db.doc('paymentSlotHolds/'+key))).data()?.reservationId!==id||await scheduling.lock(key))throw new HttpsError('failed-precondition','Reservation no longer owns this time.');
   }
   if(await scheduling.appointment(id)||await scheduling.isResourceBusy!('doctor',p.doctorId,p.startAt,p.endAt,id)||await scheduling.isResourceBusy!('patient',uid,p.startAt,p.endAt,id))throw new HttpsError('failed-precondition','Appointment time unavailable.');
   await approvedDoctor(scheduling,p.doctorId);
   const available=await scheduling.availability(draft.availabilityId);if(!available)throw new HttpsError('failed-precondition','Availability changed.');
   await assertFullCoverage(scheduling,draft,available);assertBookableStart(p.startAt,fromMilliseconds(Date.now()));
  }
 });
 await reconcilePayment(db,id,provider);
 return {payment:paymentView(await authorizePayment(db,uid,id,true))};
}
