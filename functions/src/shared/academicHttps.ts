import {onCall as firebaseOnCall, type CallableRequest, type CallableOptions, HttpsError} from 'firebase-functions/v2/https';
import {onSchedule as firebaseOnSchedule} from 'firebase-functions/v2/scheduler';
import {requireAcademicAdmission,academicEnvironment} from './academicAdmission';

// Every active callable imports this boundary. Domain authorization remains intact.
export function guardedCall<T,R>(handler:(request:CallableRequest<T>)=>R, enroll=false,admit=requireAcademicAdmission) {
  return async(request:CallableRequest<T>)=>{await admit(request.auth,enroll);return handler(request);};
}
function makeCall(args:any[],publicGoogle=false,enroll=false) {
  const options:CallableOptions=args.length===1?{}:args[0];
  const handler=args[args.length-1];
  return firebaseOnCall({...options,region:'us-central1',minInstances:0,maxInstances:2,
    concurrency:Math.min(typeof options.concurrency==='number'?options.concurrency:10,10)},
    publicGoogle?handler:guardedCall(handler,enroll));
}
export const onCall:typeof firebaseOnCall=((...args:any[])=>makeCall(args)) as typeof firebaseOnCall;
export const onRegistrationCall:typeof firebaseOnCall=((...args:any[])=>makeCall(args,false,true)) as typeof firebaseOnCall;
// Google verifies the Google-issued token and invitation before any account mutation.
export const onGoogleCall:typeof firebaseOnCall=((...args:any[])=>makeCall(args,true)) as typeof firebaseOnCall;
export const onSchedule:typeof firebaseOnSchedule=((options:any,handler:any)=>firebaseOnSchedule({
  ...(typeof options==='string'?{schedule:options}:options),region:'us-central1',minInstances:0,maxInstances:1,concurrency:1,
},async event=>{academicEnvironment();return handler(event);})) as typeof firebaseOnSchedule;
export {HttpsError};
