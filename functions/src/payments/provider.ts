import {createHash} from 'crypto';
import {Timestamp,type Firestore} from 'firebase-admin/firestore';
import {requireSimulationEnvironment} from './policy';
export type ProviderStatus='pending'|'unknown'|'succeeded'|'failed'|'cancelled'|'expired';
export interface ProviderResult {paymentId:string;currency:'KES';status:ProviderStatus;reference:string;sequence:number;refundStatus:'none'|'succeeded'|'failed';refundReference:string|null;amountMinor:number}
export interface PaymentProvider {
 readonly id:string;
 initiate(paymentId:string,amountMinor:number,expiresAt:number):Promise<void>;
 lookup(paymentId:string):Promise<ProviderResult>;
 cancel(paymentId:string):Promise<void>;
 refund(paymentId:string):Promise<ProviderResult>;
}
export type SimulationOutcome='acknowledged'|'success'|'declined'|'cancelled'|'timeout'|'not_charged'|'delayed'|'refund_fail'|'refund_recover';
export class SimulatedMpesaProvider implements PaymentProvider {
 readonly id='simulated-mpesa';constructor(private db:Firestore){}
 private ref(id:string){requireSimulationEnvironment();if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid payment ID');return this.db.doc('simulatedProviderTransactions/'+id);}
 async initiate(id:string,amountMinor:number,expiresAt:number){const ref=this.ref(id);await this.db.runTransaction(async tx=>{const s=await tx.get(ref);if(s.exists){if(s.data()!.amountMinor!==amountMinor||s.data()!.paymentId!==id||s.data()!.currency!=='KES')throw Error('Provider intent conflict');return;}tx.create(ref,{paymentId:id,currency:'KES',status:'pending',reference:'DEMO-MPESA-'+id,sequence:1,amountMinor,expiresAt,acknowledged:true,refundStatus:'none',refundReference:null,refundFails:false,delayed:false,updatedAt:Timestamp.now()});});}
 async lookup(id:string):Promise<ProviderResult>{const ref=this.ref(id);return this.db.runTransaction(async tx=>{const s=(await tx.get(ref)).data();if(!s)throw Error('Provider intent unavailable');if(s.status==='pending'&&!s.delayed&&s.expiresAt<=Date.now()){s.status='expired';s.sequence++;tx.update(ref,{status:s.status,sequence:s.sequence,updatedAt:Timestamp.now()});}return s as ProviderResult;});}
 async cancel(id:string){const ref=this.ref(id);await this.db.runTransaction(async tx=>{const s=(await tx.get(ref)).data();if(!s)throw Error('Provider intent unavailable');if(s.status!=='pending')return;tx.update(ref,{status:'cancelled',sequence:s.sequence+1,updatedAt:Timestamp.now()});});}
 async refund(id:string){const ref=this.ref(id);await this.db.runTransaction(async tx=>{const s=(await tx.get(ref)).data();if(!s||s.status!=='succeeded')throw Error('Successful provider charge required');if(s.refundStatus==='succeeded')return;tx.update(ref,{refundStatus:s.refundFails?'failed':'succeeded',refundReference:s.refundFails?null:'DEMO-REFUND-'+id,sequence:s.sequence+1,updatedAt:Timestamp.now()});});return this.lookup(id);}
 /** Internal provider event API. Patient decisions use a transactional guard;
  * raw outcomes/event IDs are never exposed through a callable. */
 async deliver(id:string,outcome:SimulationOutcome,eventId:string,guard?:(tx:FirebaseFirestore.Transaction,replay:boolean,record:FirebaseFirestore.DocumentData)=>Promise<void>){
  if(!['acknowledged','success','declined','cancelled','timeout','not_charged','delayed','refund_fail','refund_recover'].includes(outcome)||!/^[-a-zA-Z0-9]{1,100}$/.test(eventId))throw Error('Invalid simulation event');
  const ref=this.ref(id),event=this.db.doc(`simulatedProviderEvents/${createHash('sha256').update(id+':'+eventId).digest('hex')}`);
  await this.db.runTransaction(async tx=>{const prior=await tx.get(event),s=(await tx.get(ref)).data();if(!s)throw Error('Provider intent unavailable');if(guard)await guard(tx,prior.exists,s);if(prior.exists){if(prior.data()!.outcome!==outcome)throw Error('Conflicting provider event replay');return;}
   const next:FirebaseFirestore.DocumentData={...s,sequence:s.sequence+1,updatedAt:Timestamp.now()};
   if(outcome==='success')next.status='succeeded';
   else if(outcome==='refund_fail'||outcome==='refund_recover')next.refundFails=outcome==='refund_fail';
   else if(s.status!=='succeeded'){
    if(outcome==='declined')next.status='failed';else if(outcome==='cancelled')next.status='cancelled';else if(outcome==='not_charged')next.status='expired';
    else if(outcome==='timeout')next.status='unknown';else if(outcome==='delayed'){next.status='pending';next.delayed=true;}
   }
   tx.set(ref,next);tx.set(this.db.doc('providerReconcileQueue/'+id),{sequence:next.sequence,nextAt:Timestamp.now()});tx.create(event,{paymentId:id,outcome,sequence:next.sequence,createdAt:Timestamp.now(),demo:true});
  });
 }
}
