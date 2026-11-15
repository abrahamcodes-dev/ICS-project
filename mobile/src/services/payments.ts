import type {ConsultationFee,PaymentView} from '@shared/types/payments';
export function formatKsh(minor:number){if(!Number.isSafeInteger(minor)||minor<0)throw Error('Invalid amount');return `KSh ${Math.trunc(minor/100).toLocaleString('en-KE')}.${String(minor%100).padStart(2,'0')}`;}
export function parseKsh(text:string){if(!/^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$/.test(text))throw Error('Enter a fee with at most two decimal places.');const [whole,cents='']=text.split('.'),minor=parseInt(whole,10)*100+parseInt((cents+'00').slice(0,2),10);if(minor>10000000||minor>0&&minor<100)throw Error('Use zero for free, or KSh 1 to KSh 100,000.');return minor;}
export function normalizeTestPhone(value:string){const s=value.replace(/[ ()-]/g,'').replace(/^\+/,''),n=s.startsWith('0')?'254'+s.slice(1):s;if(!/^254[71][0-9]{8}$/.test(n))throw Error('Enter a Kenyan test mobile number beginning 07, 01 or +254.');return n;}
export function paymentError(e:unknown){const code=(e as {code?:string}).code??'';if(/already-exists/.test(code))return 'That time is already booked or reserved. Refresh available times.';if(/permission-denied|unauthenticated/.test(code))return 'Your account or this doctor is unavailable. Refresh or sign in again.';if(/failed-precondition|aborted/.test(code))return 'The fee, slot or payment state changed. Refresh before confirming.';return 'Payment status is uncertain. Refresh this request or check Payment history before starting another.';}
export function createPaymentSession(uid:string){
 let disposed=false;
 const config=()=>require('./firebaseConfig') as typeof import('./firebaseConfig');
 const check=()=>{if(disposed||config().auth.currentUser?.uid!==uid)throw Error('Payment session ended.');};
 async function call<T>(name:string,data:unknown){check();const {httpsCallable}=require('firebase/functions') as typeof import('firebase/functions');const result=await httpsCallable<unknown,T>(config().functions,name)(data);check();return result.data;}
 return {dispose(){disposed=true;},
  fee:async(doctorId:string,durationMinutes:15|30|60=30)=>(await call<{fee:ConsultationFee|null}>('getConsultationFee',{doctorId,...(durationMinutes!==30?{durationMinutes}:{})})).fee,
  setFee:async(amountMinor:number,expectedRevision:number)=>(await call<{fee:ConsultationFee}>('setDoctorConsultationFee',{amountMinor,expectedRevision})).fee,
  checkout:(input:{doctorId:string;startAt:number;requestId:string;expectedFeeRevision:number;phone?:string;durationMinutes?:15|30|60})=>call<{kind:'free';appointmentId:string}|{kind:'payment';paymentId:string;payment:PaymentView}>('createConsultationCheckout',input),
  status:async(paymentId:string)=>(await call<{payment:PaymentView}>('getConsultationPayment',{paymentId})).payment,
  decide:async(paymentId:string,decision:'approve'|'decline')=>(await call<{payment:PaymentView}>('submitSimulatedPaymentDecision',{paymentId,decision})).payment,
  cancel:async(paymentId:string)=>(await call<{payment:PaymentView}>('cancelConsultationPayment',{paymentId})).payment,
  retryRefund:async(paymentId:string)=>(await call<{payment:PaymentView}>('retryConsultationRefund',{paymentId})).payment,
  history:(after?:string)=>call<{payments:PaymentView[];nextCursor:string|null}>('listConsultationPayments',after?{after}:{}),
  summary:()=>call<{demo:true;confirmed:{minor:number;count:number};refunded:{minor:number;count:number};refundPending:{minor:number;count:number};refundFailed:{minor:number;count:number}}>('getDoctorPaymentSummary',{}),
 };
}
