import {HttpsError} from 'firebase-functions/v2/https';
import {fail} from '../profiles/domainValidation';
import type {PaymentStatus} from '../../../shared/types/payments';
export const HOLD_MS=5*60000,MAX_FEE_MINOR=10000000;
export const DEVELOPMENT_REFUND_POLICY=Object.freeze({version:'development-full-refund-v1',patientCancellation:'full',doctorCancellation:'full',lateSuccess:'full',failedSetup:'manual_review'});
export const UNRESOLVED_PAYMENTS=['created','pending','refund_pending','refund_failed','review_required'];
/** Local emulators are the default. Hosted simulation requires an explicit,
 * dedicated academic-demo project and server-only opt-in; never a real provider. */
export function requireSimulationEnvironment(env:NodeJS.ProcessEnv=process.env){
 const demo=env.GCLOUD_PROJECT==='demo-calladoc'&&env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8080';
 const isolated=env.GCLOUD_PROJECT==='demo-calladoc-payments-tests'&&env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8106';
 const academic=env.PAYMENT_SIMULATION_MODE==='academic-demo'
  &&!!env.PAYMENT_SIMULATION_PROJECT_ID&&/^[a-z][a-z0-9-]*-academic-demo$/.test(env.PAYMENT_SIMULATION_PROJECT_ID)
  &&env.GCLOUD_PROJECT===env.PAYMENT_SIMULATION_PROJECT_ID
  &&!env.FUNCTIONS_EMULATOR&&!env.FIRESTORE_EMULATOR_HOST&&!env.FIREBASE_AUTH_EMULATOR_HOST;
 if(!(env.FUNCTIONS_EMULATOR==='true'&&(demo||isolated))&&!academic)throw new HttpsError('failed-precondition','Payment simulation is not enabled for this environment.');
}
export function amountMinor(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>MAX_FEE_MINOR||Number(value)>0&&Number(value)<100)fail('invalid-fee');return value as number;}
export function testPhone(value:unknown){if(typeof value!=='string')fail('invalid-phone');const s=value.replace(/[ ()-]/g,'').replace(/^\+/,''),n=s.startsWith('0')?'254'+s.slice(1):s;if(!/^254[71][0-9]{8}$/.test(n))fail('invalid-phone');return n;}
const transitions:Record<PaymentStatus,PaymentStatus[]>={
 created:['pending','succeeded','failed','cancelled','expired','refund_pending','review_required'],pending:['succeeded','failed','cancelled','expired','refund_pending','review_required'],
 succeeded:['refund_pending'],failed:['refund_pending'],cancelled:['refund_pending'],expired:['refund_pending'],
 refund_pending:['refunded','refund_failed'],refunded:[],refund_failed:['refund_pending'],review_required:['succeeded','failed','cancelled','expired','refund_pending'],
};
export function assertTransition(from:PaymentStatus,to:PaymentStatus){if(from!==to&&!transitions[from]?.includes(to))fail('invalid-payment-transition');}
