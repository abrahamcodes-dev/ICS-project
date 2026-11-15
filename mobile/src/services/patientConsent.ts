import type {PatientConsentInput,PatientConsentState,SharingDecision} from '@shared/types/consent';
export const CONSENT_VERSION='development-2026-11-03-v1';
export type ConsentChoice={privacyAcknowledged:boolean;sharingDecision:'granted'|'declined'|null};
export function validateConsentChoice(choice?:ConsentChoice) {
 if(!choice?.privacyAcknowledged)throw new Error('Acknowledge the development privacy notice before continuing.');
 if(!choice.sharingDecision)throw new Error('Choose whether to allow medical-record sharing. You can decline and still create an account.');
}
export async function loadPatientConsent(uid:string):Promise<PatientConsentState|null>{
 const {httpsCallable}=require('firebase/functions') as typeof import('firebase/functions');
 const {auth,functions}=require('./firebaseConfig') as typeof import('./firebaseConfig');
 if(auth.currentUser?.uid!==uid)throw new Error('Session changed.');
 const result=await httpsCallable<{}, {state:PatientConsentState|null}>(functions,'getOwnPatientConsent')({});
 if(auth.currentUser?.uid!==uid)throw new Error('Session changed.');
 return result.data.state;
}
export function consentRequest(revision:number,decision:SharingDecision,source:'registration'|'profile'):PatientConsentInput {
 const {collection,doc}=require('firebase/firestore') as typeof import('firebase/firestore');
 const {db}=require('./firebaseConfig') as typeof import('./firebaseConfig');
 return {requestId:doc(collection(db,'patientConsents')).id,expectedRevision:revision,documentVersion:CONSENT_VERSION,privacyAcknowledged:true,sharingDecision:decision,source};
}
export async function savePatientConsent(uid:string,input:PatientConsentInput):Promise<PatientConsentState>{
 const {httpsCallable}=require('firebase/functions') as typeof import('firebase/functions');
 const {auth,functions}=require('./firebaseConfig') as typeof import('./firebaseConfig');
 if(auth.currentUser?.uid!==uid)throw new Error('Session changed.');
 const result=await httpsCallable<PatientConsentInput,{state:PatientConsentState}>(functions,'updateOwnPatientConsent')(input);
 if(auth.currentUser?.uid!==uid)throw new Error('Session changed.');
 return result.data.state;
}
