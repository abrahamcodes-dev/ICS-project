import {durationMinutes,proportionalPrice} from '../scheduling/durations';
import {onCall,HttpsError} from '../shared/academicHttps';
import {onSchedule} from '../shared/academicHttps';
import {Timestamp,FieldPath,AggregateField} from 'firebase-admin/firestore';
import {db} from '../shared/firestoreRefs';
import {createAuthorization,requireAuthenticated} from '../shared/authorization';
import {DomainValidationError,strictRecord,safeId} from '../profiles/domainValidation';
import {digestId} from '../scheduling/ids';
import {requireSimulationEnvironment} from './policy';
import {quoteFee,setFee,createCheckout,authorizePayment,reconcilePayment,reconcileDuePayments,paymentView} from './engine';
import {SimulatedMpesaProvider} from './provider';
import {transition} from './ledger';
import {requestSimulationOutcome} from './simulation';
type Request={auth?:{uid:string};data:unknown};
function callable(action:(uid:string,data:unknown)=>Promise<unknown>){return onCall(async (r:Request)=>{
 requireSimulationEnvironment();const uid=requireAuthenticated(r.auth);safeId(uid);
 try{return await action(uid,r.data);}catch(e){if(e instanceof HttpsError)throw e;if(e instanceof DomainValidationError)throw new HttpsError('failed-precondition','Payment input, fee, slot or account state changed. Refresh before retrying.');throw new HttpsError('unavailable','Unable to confirm demo payment status. Refresh the same request before starting another.');}
});}
export const getConsultationFee=callable(async(uid,data)=>{const d=strictRecord(data,['doctorId','durationMinutes'],['doctorId']),duration=durationMinutes(d.durationMinutes),fee=await quoteFee(db,uid,safeId(d.doctorId));return {fee:fee?{...fee,durationMinutes:duration,totalMinor:proportionalPrice(fee.amountMinor,duration)}:null};});
export const setDoctorConsultationFee=callable(async(uid,data)=>({fee:await setFee(db,uid,data)}));
export const submitSimulatedPaymentDecision=callable((uid,data)=>requestSimulationOutcome(db,uid,data));
export const createConsultationCheckout=callable(async(uid,data)=>{
 const result=await createCheckout(db,uid,data);if(result.kind==='free')return result;
 return {...result,payment:paymentView(await authorizePayment(db,uid,result.paymentId,true))};
});
export const getConsultationPayment=callable(async(uid,data)=>{const d=strictRecord(data,['paymentId'],['paymentId']),id=digestId(d.paymentId);await authorizePayment(db,uid,id);await reconcilePayment(db,id);return {payment:paymentView(await authorizePayment(db,uid,id))};});
export const cancelConsultationPayment=callable(async(uid,data)=>{const d=strictRecord(data,['paymentId'],['paymentId']),id=digestId(d.paymentId);const p=await authorizePayment(db,uid,id,true),provider=new SimulatedMpesaProvider(db);
 if(p.status==='created')await provider.initiate(id,p.amountMinor,p.expiresAt.toMillis());
 await provider.cancel(id);await reconcilePayment(db,id,provider);return {payment:paymentView(await authorizePayment(db,uid,id,true))};
});
export const retryConsultationRefund=callable(async(uid,data)=>{const d=strictRecord(data,['paymentId'],['paymentId']),id=digestId(d.paymentId);await db.runTransaction(async tx=>{
 const actor=await createAuthorization(async key=>(await tx.get(db.doc('users/'+key))).data()).requireActive({uid}),p=(await tx.get(db.doc('consultationPayments/'+id))).data();
 if(!p||!(actor.role==='patient'&&p.patientId===uid||actor.role==='doctor'&&p.doctorId===uid))throw new HttpsError('permission-denied','Payment unavailable.');
 if(p.status==='refund_pending'||p.status==='refunded')return;
 if(p.status!=='refund_failed')throw new HttpsError('failed-precondition','No failed refund is available to retry.');
 transition(db,tx,id,p,'refund_pending',{reasonCode:'refund_retry_requested',auditActorUid:uid,nextReconcileAt:Timestamp.now()});
 });return {payment:paymentView(await authorizePayment(db,uid,id))};
});
export const listConsultationPayments=callable(async(uid,data)=>{
 const d=strictRecord(data,['after']),identity=await createAuthorization(async key=>(await db.doc('users/'+key).get()).data()).requireActive({uid});if(!['patient','doctor'].includes(identity.role))throw new HttpsError('permission-denied','Participant required.');
 let query=db.collection('consultationPayments').where(`${identity.role}Id`,'==',uid).orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc').limit(20);
 if(d.after){const cursor=await db.doc('consultationPayments/'+digestId(d.after)).get();if(!cursor.exists||cursor.data()![`${identity.role}Id`]!==uid)throw new HttpsError('permission-denied','Invalid payment page.');query=query.startAfter(cursor);}
 const page=await query.get();return {payments:page.docs.map(row=>paymentView(row.data())),nextCursor:page.size===20?page.docs[19].id:null};
});
export const getDoctorPaymentSummary=callable(async(uid,data)=>{
 strictRecord(data,[],[]);const a=await createAuthorization(async key=>(await db.doc('users/'+key).get()).data()).requireActive({uid});if(a.role!=='doctor')throw new HttpsError('permission-denied','Doctor required.');
 const total=async(status:string)=>{const s=(await db.collection('consultationPayments').where('doctorId','==',uid).where('status','==',status).aggregate({minor:AggregateField.sum('amountMinor'),count:AggregateField.count()}).get()).data();if(!Number.isSafeInteger(s.minor)||!Number.isSafeInteger(s.count))throw Error('Summary bounds');return s;};
 return {demo:true,currency:'KES',confirmed:await total('succeeded'),refunded:await total('refunded'),refundPending:await total('refund_pending'),refundFailed:await total('refund_failed')};
});
export const reconcileConsultationPayments=onSchedule({schedule:'every 1 minutes',timeoutSeconds:300,memory:'512MiB',concurrency:1},async()=>{const result=await reconcileDuePayments(db);if(result.failed)throw Error('Demo reconciliation has retryable entries.');});
