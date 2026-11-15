import {durationMinutes,proportionalPrice,holdKeys} from '../scheduling/durations';
import {Timestamp,FieldValue,type Firestore,type Transaction} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {createAuthorization} from '../shared/authorization';
import {approvedDoctor} from '../scheduling/availabilityHandlers';
import {availabilityTransaction} from '../scheduling/availabilityStore';
import {appointmentId,availabilityId,bookingLockId,digestId} from '../scheduling/ids';
import {assertBookableStart,fromMilliseconds,bookingRequestId} from '../scheduling/primitives';
import {validateAppointment} from '../scheduling/validation';
import {assertCoverage,assertFullCoverage} from '../scheduling/reservationGuards';
import {scheduledLocks} from '../scheduling/policy';
import {SCHEDULING} from '../scheduling/constants';
import {strictRecord,safeId,fail} from '../profiles/domainValidation';
import {amountMinor,HOLD_MS,requireSimulationEnvironment,DEVELOPMENT_REFUND_POLICY} from './policy';
import {testPhone} from './policy';
import {decodeDraft,encodeDraft} from './reservations';
import {SimulatedMpesaProvider,type PaymentProvider} from './provider';
import {transition} from './ledger';
import type {PaymentView,ConsultationFee} from '../../../shared/types/payments';

const intervalDurationView=(p:FirebaseFirestore.DocumentData)=>durationMinutes((p.endAt-p.startAt)/60000);
export function paymentView(p:FirebaseFirestore.DocumentData):PaymentView{
 const keys=['paymentId','reservationId','appointmentId','doctorId','patientId','doctorDisplay','startAt','endAt','amountMinor','currency','method','provider','status','providerReference','refundReference','reasonCode','demo'];
 const view:any=Object.fromEntries(keys.map(k=>[k,p[k]]));for(const k of ['createdAt','updatedAt','expiresAt'])view[k]=p[k].toMillis();view.paidAt=p.paidAt?.toMillis()??null;view.durationMinutes=intervalDurationView(p);view.baseAmountMinor=p.baseAmountMinor??p.amountMinor;return view;
}
async function actor(db:Firestore,tx:Transaction,uid:string){return createAuthorization(async id=>(await tx.get(db.doc('users/'+id))).data()).requireActive({uid});}
export async function authorizePayment(db:Firestore,uid:string,id:string,patientOnly=false){
 requireSimulationEnvironment();digestId(id);return db.runTransaction(async tx=>{const a=await actor(db,tx,uid),p=(await tx.get(db.doc('consultationPayments/'+id))).data();
  if(!p||!(a.role==='patient'&&p.patientId===uid||!patientOnly&&a.role==='doctor'&&p.doctorId===uid))throw new HttpsError('permission-denied','Payment unavailable to this account.');return p;
 });
}
export async function quoteFee(db:Firestore,uid:string,doctorId:string):Promise<ConsultationFee|null>{
 requireSimulationEnvironment();safeId(doctorId);return db.runTransaction(async tx=>{const a=await actor(db,tx,uid);if(a.role!=='patient'&&!(a.role==='doctor'&&uid===doctorId))throw new HttpsError('permission-denied','Fee unavailable.');
  await approvedDoctor(availabilityTransaction(db,tx),doctorId);const fee=(await tx.get(db.doc('doctorFees/'+doctorId))).data();return fee?{doctorId,amountMinor:amountMinor(fee.amountMinor),currency:'KES',revision:fee.revision,demo:true}:null;
 });
}
export async function setFee(db:Firestore,uid:string,input:unknown){
 requireSimulationEnvironment();const d=strictRecord(input,['amountMinor','expectedRevision'],['amountMinor','expectedRevision']),amount=amountMinor(d.amountMinor);
 if(!Number.isSafeInteger(d.expectedRevision)||Number(d.expectedRevision)<0)fail('invalid-revision');
 return db.runTransaction(async tx=>{await approvedDoctor(availabilityTransaction(db,tx),uid);const ref=db.doc('doctorFees/'+uid),old=(await tx.get(ref)).data();
  if((old?.revision??0)!==d.expectedRevision)throw new HttpsError('aborted','Fee changed. Refresh before saving.');
  const fee={doctorId:uid,amountMinor:amount,currency:'KES' as const,revision:(old?.revision??0)+1,demo:true as const};
  const at=Timestamp.now();tx.set(ref,{...fee,updatedAt:at});tx.create(ref.collection('history').doc(String(fee.revision)),{...fee,updatedAt:at});return fee;
 });
}

export async function createCheckout(db:Firestore,uid:string,input:unknown,provider:PaymentProvider=new SimulatedMpesaProvider(db)){
 requireSimulationEnvironment();const d=strictRecord(input,['doctorId','startAt','requestId','expectedFeeRevision','phone','durationMinutes'],['doctorId','startAt','requestId','expectedFeeRevision']);
 const duration=durationMinutes(d.durationMinutes);
 const doctorId=safeId(d.doctorId),requestId=bookingRequestId(d.requestId),id=appointmentId(uid,requestId),start=Number(d.startAt);
 if(!Number.isSafeInteger(d.startAt))fail('invalid-start');const end=start+duration*60000;
 const result=await db.runTransaction(async tx=>{
  const a=await actor(db,tx,uid);if(a.role!=='patient')throw new HttpsError('permission-denied','Active patient required.');
  const scheduling=availabilityTransaction(db,tx),display=await approvedDoctor(scheduling,doctorId),ref=db.doc('consultationPayments/'+id),prior=(await tx.get(ref)).data(),existing=await scheduling.appointment(id);
  if(prior){if(prior.patientId!==uid||prior.doctorId!==doctorId||prior.startAt!==start||prior.endAt!==end)throw new HttpsError('already-exists','Checkout request has another intent.');return {kind:'payment' as const,paymentId:id};}
  if(existing){if(existing.patientId!==uid||existing.doctorId!==doctorId||existing.startAt.seconds*1000!==start||existing.endAt.seconds*1000!==end)throw new HttpsError('already-exists','Booking request has another intent.');return {kind:'free' as const,appointmentId:id};}
  const fee=(await tx.get(db.doc('doctorFees/'+doctorId))).data();if(!fee||fee.revision!==d.expectedFeeRevision)throw new HttpsError('failed-precondition','Doctor fee changed or is not configured. Refresh checkout.');
  const baseAmountMinor=amountMinor(fee.amountMinor),amount=proportionalPrice(baseAmountMinor,duration);if(amount>0)testPhone(d.phone);
  const day=new Date(start).toISOString().slice(0,10),availabilityKey=availabilityId(doctorId,day),available=await scheduling.availability(availabilityKey);
  if(!available)fail('missing-availability');
  const lockIds=holdKeys(uid,doctorId,start,end);
  if(await scheduling.isResourceBusy!('doctor',doctorId,start,end)||await scheduling.isResourceBusy!('patient',uid,start,end))throw new HttpsError('already-exists','An appointment or payment reservation overlaps this consultation.');
  for(const key of lockIds){if(await scheduling.lock(key)||await scheduling.paymentHold!(key))throw new HttpsError('already-exists','That slot is booked or reserved. Refresh available times.');}
  const now=Date.now();assertBookableStart(start,fromMilliseconds(now));
  const draft=validateAppointment({appointmentId:id,patientId:uid,doctorId,availabilityId:availabilityKey,availabilityRevision:available.revision,startAt:fromMilliseconds(start),endAt:fromMilliseconds(end),doctorDisplay:display,status:'scheduled',cancellation:null,outcome:null,schemaVersion:1,createdAt:fromMilliseconds(now),updatedAt:fromMilliseconds(now)});
  await assertFullCoverage(scheduling,draft,available);
  if(amount===0){scheduling.createAppointment(draft);for(const l of scheduledLocks(draft))scheduling.createLock(l.lockId,l.lock);return {kind:'free' as const,appointmentId:id};}
  const expires=Timestamp.fromMillis(Math.min(now+HOLD_MS,start-SCHEDULING.bookingLeadMs));if(expires.toMillis()<=now)fail('insufficient-payment-time');
  tx.create(db.doc('paymentReservations/'+id),{reservationId:id,patientId:uid,doctorId,state:'held',holdVersion:2,draft:encodeDraft(draft),expiresAt:expires,createdAt:Timestamp.fromMillis(now),updatedAt:Timestamp.fromMillis(now),demo:true});
  for(const key of lockIds)tx.create(db.doc('paymentSlotHolds/'+key),{reservationId:id});
  tx.create(ref,{paymentId:id,reservationId:id,appointmentId:null,patientId:uid,doctorId,doctorDisplay:display,startAt:start,endAt:end,amountMinor:amount,baseAmountMinor,durationMinutes:duration,roundingRule:'half-up-minor-v1',feeRevision:fee.revision,refundPolicyVersion:DEVELOPMENT_REFUND_POLICY.version,currency:'KES',method:'simulated_mpesa',provider:provider.id,status:'created',requestId,providerReference:null,refundReference:null,reasonCode:null,paidAt:null,expiresAt:expires,createdAt:Timestamp.fromMillis(now),updatedAt:Timestamp.fromMillis(now),nextReconcileAt:Timestamp.fromMillis(now),demo:true,schemaVersion:1});
  tx.create(ref.collection('audit').doc(),{from:null,to:'created',at:Timestamp.fromMillis(now),reasonCode:'checkout_requested',demo:true});return {kind:'payment' as const,paymentId:id};
 });
 if(result.kind==='payment'){try{await reconcilePayment(db,result.paymentId,provider);}catch{/* Durable created intent survives an unavailable provider. */}}
 return result;
}

/** Called by trusted reconciliation/operator operations; never accepts a client
 * outcome. External provider calls are outside Firestore and are idempotent. */
export async function reconcilePayment(db:Firestore,id:string,provider:PaymentProvider=new SimulatedMpesaProvider(db)){
 requireSimulationEnvironment();digestId(id);const before=(await db.doc('consultationPayments/'+id).get()).data();if(!before)return;
 if(before.status==='created')await provider.initiate(id,before.amountMinor,before.expiresAt.toMillis());
 const observed=await provider.lookup(id);
 if(observed.paymentId!==id||observed.currency!==before.currency||observed.amountMinor!==before.amountMinor)throw Error('Provider evidence binding mismatch');
 const evidence=before.status==='refund_pending'?await provider.refund(id):observed;
 await db.runTransaction(async tx=>{
  const ref=db.doc('consultationPayments/'+id),p=(await tx.get(ref)).data(),queue=db.doc('providerReconcileQueue/'+id),q=(await tx.get(queue)).data();if(!p)return;
  if(q&&q.sequence>evidence.sequence)return; // An outcome arrived after lookup: keep its durable queue entry.
  const rref=db.doc('paymentReservations/'+id),r=(await tx.get(rref)).data();if(!r||r.reservationId!==id||r.patientId!==p.patientId||r.doctorId!==p.doctorId)throw Error('Reservation binding');
  const scheduling=availabilityTransaction(db,tx),appointment=await scheduling.appointment(id),draft=decodeDraft(r.draft),start=p.startAt;
  const ids=holdKeys(p.patientId,p.doctorId,start,p.endAt,r.holdVersion??1),holds:(FirebaseFirestore.DocumentData|undefined)[]=[],locks=[];
  for(const key of ids){holds.push((await tx.get(db.doc('paymentSlotHolds/'+key))).data());locks.push(await scheduling.lock(key));}
  const release=()=>{for(let i=0;i<ids.length;i++)if(holds[i]?.reservationId===id)tx.delete(db.doc('paymentSlotHolds/'+ids[i]));};
  const finish=(status:Parameters<typeof transition>[4],extra:Record<string,unknown>={})=>{transition(db,tx,id,p,status,{providerReference:evidence.reference,providerSequence:evidence.sequence,nextReconcileAt:FieldValue.delete(),...extra});tx.delete(queue);};
  if(evidence.amountMinor!==p.amountMinor||evidence.paymentId!==id||evidence.currency!==p.currency)throw Error('Provider evidence binding mismatch');
  if(p.status==='refunded'){tx.delete(queue);return;}
  if(p.status==='refund_pending'){
   if(evidence.refundStatus==='succeeded')finish('refunded',{refundReference:evidence.refundReference});
   else if(evidence.refundStatus==='failed')finish('refund_failed',{reasonCode:'provider_refund_failed'});
   // A concurrent cancellation may have queued a refund after our lookup.
   else tx.update(ref,{nextReconcileAt:Timestamp.now()});return;
  }
  if(p.status==='refund_failed'){tx.delete(queue);return;}
  if(evidence.status==='succeeded'){
   if(p.status==='succeeded'){tx.delete(queue);return;}
   let eligible=r.state==='held'&&r.expiresAt.toMillis()>Date.now()&&holds.every(h=>h?.reservationId===id)&&locks.every(l=>!l)&&!appointment;
   if(eligible){
    try{if(await scheduling.isResourceBusy!('doctor',p.doctorId,start,p.endAt,id)||await scheduling.isResourceBusy!('patient',p.patientId,start,p.endAt,id))fail('overlapping-confirmation');const patient=await actor(db,tx,p.patientId);if(patient.role!=='patient')fail('patient-required');await approvedDoctor(scheduling,p.doctorId);
     const available=await scheduling.availability(draft.availabilityId);if(!available)fail('missing-availability');await assertFullCoverage(scheduling,draft,available);assertBookableStart(start,fromMilliseconds(Date.now()));
    }catch(e){if(e instanceof HttpsError&&e.code==='permission-denied'||(e as Error).name==='DomainValidationError')eligible=false;else throw e;}
   }
   if(eligible){const now=fromMilliseconds(Date.now()),confirmed=validateAppointment({...draft,createdAt:now,updatedAt:now});scheduling.createAppointment(confirmed);for(const l of scheduledLocks(confirmed))scheduling.createLock(l.lockId,l.lock);release();tx.update(rref,{state:'confirmed',updatedAt:Timestamp.now()});finish('succeeded',{appointmentId:id,reasonCode:null,paidAt:Timestamp.now()});}
   else{release();tx.update(rref,{state:'released',updatedAt:Timestamp.now()});finish('refund_pending',{reasonCode:'late_or_unavailable_success',paidAt:Timestamp.now(),nextReconcileAt:Timestamp.now()});}
   return;
  }
  if(['succeeded','failed','cancelled','expired'].includes(p.status)){tx.delete(queue);return;}
  if(['failed','cancelled','expired'].includes(evidence.status)){
   release();tx.update(rref,{state:'released',updatedAt:Timestamp.now()});finish(evidence.status as 'failed'|'cancelled'|'expired',{reasonCode:'provider_'+evidence.status});return;
  }
  const uncertain=evidence.status==='unknown'||r.expiresAt.toMillis()<=Date.now();
  finish(uncertain||p.status==='review_required'?'review_required':'pending',{reasonCode:uncertain?'awaiting_provider_reconciliation':'simulated_stk_acknowledged',nextReconcileAt:Timestamp.fromMillis(Date.now()+60000)});
 });
}

export async function reconcileDuePayments(db:Firestore){
 requireSimulationEnvironment();const due=await db.collection('consultationPayments').where('nextReconcileAt','<=',Timestamp.now()).limit(20).get(),queue=await db.collection('providerReconcileQueue').where('nextAt','<=',Timestamp.now()).limit(20).get();
 let processed=0,failed=0;for(const id of new Set([...due.docs,...queue.docs].map(d=>d.id))){try{await reconcilePayment(db,id);processed++;}catch{failed++;}}return {processed,failed};
}
