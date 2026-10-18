import {doc,getDoc} from 'firebase/firestore';
import {httpsCallable} from 'firebase/functions';
import {ref,uploadBytesResumable} from 'firebase/storage';
import {auth,db,functions,storage} from './firebaseConfig';
import {loadOwnIdentity} from './identityService';
import type {DoctorDraftInput,DoctorProfile} from '@shared/types/profiles';
import type {CredentialCategory,CredentialContentType,DoctorCredentialRecord,VerificationRequest} from '@shared/types/verification';

export const fields = {professionalName:200,specialty:120,registrationNumber:120,issuingAuthority:200,phoneNumber:32} as const;
export const categories: CredentialCategory[]=['medical_license','professional_certificate','identity_document','other_supporting_document'];
export const mimeTypes: CredentialContentType[]=['application/pdf','image/jpeg','image/png'];
class VerificationInputError extends Error {}
export function draftInput(values:DoctorDraftInput,complete=false):DoctorDraftInput {
 const result:DoctorDraftInput={};
 for(const key of Object.keys(fields) as (keyof DoctorDraftInput)[]){
  const value=values[key]?.trim();
  if(!value){if(complete&&key!=='phoneNumber')throw new Error('Complete all four professional fields before submitting.');continue;}
  if(value.length>fields[key]||/[\u0000-\u001f\u007f]/.test(value))throw new Error('Check professional field lengths and remove control characters.');
  if(key==='phoneNumber'&&(!/^\+?[0-9 ()-]{3,32}$/.test(value)||(value.match(/[0-9]/g)?.length??0)<3))throw new Error('Enter a valid phone number.');
  result[key]=value;
 }
 return result;
}
export function safeDocumentId(id:string){if(!id||id.length>128||id!==id.trim()||/[\/\\\u0000-\u001f\u007f]/.test(id)||/^(\.|\.\.)$|%2f|%5c/i.test(id))throw new Error('Enter a valid recovery ID.');return id;}
export function validateFile(type:string|undefined,size:number|undefined){
 if(!mimeTypes.includes(type as CredentialContentType)||!Number.isSafeInteger(size)||size!<=0||size!>5*1024*1024)throw new VerificationInputError('Choose a PDF, JPEG or PNG between 1 byte and 5 MiB.');
}
export function verificationError(error:unknown){
 if(error instanceof VerificationInputError)return error.message;
 const code=(error as {code?:string})?.code;
 if(code?.includes('permission-denied')||code?.includes('unauthenticated'))return 'Your account cannot perform this operation. Refresh your account status.';
 if(code?.includes('failed-precondition'))return 'The draft, upload slot or verification state has changed. Refresh; expired uploads require a new selection.';
 return 'Operation could not be completed. Check your connection, then refresh or retry using the saved recovery ID.';
}
export function createVerificationSession(uid:string){
 let disposed=false;
 const tasks=new Set<ReturnType<typeof uploadBytesResumable>>();
 const check=()=>{if(disposed||auth.currentUser?.uid!==uid)throw new Error('Session ended.');};
 async function eligible(){check();const identity=await loadOwnIdentity(uid);check();if(identity?.role!=='doctor'||identity.status!=='active'||!['pending','rejected'].includes(identity.verificationStatus))throw new Error('Eligible doctor required.');}
 async function read<T>(collection:string,id:string):Promise<T|null>{check();const snap=await getDoc(doc(db,collection,safeDocumentId(id)));check();return snap.exists()?snap.data() as T:null;}
 async function call<T>(name:string,input:unknown){await eligible();const response=await httpsCallable<unknown,T>(functions,name)(input);check();return response.data;}
 async function credential(id:string){await eligible();const row=await read<DoctorCredentialRecord>('doctorCredentials',id);if(!row||row.doctorUid!==uid||row.credentialId!==id||row.storagePath!==`doctorCredentials/${uid}/${id}/document`)throw new Error('Credential unavailable.');return row;}
 return {
  dispose(){disposed=true;tasks.forEach(task=>task.cancel());tasks.clear();},
  async profile(){await eligible();const row=await read<DoctorProfile>('doctorProfiles',uid);if(row&&(row.uid!==uid||row.schemaVersion!==1||!Number.isSafeInteger(row.revision)||row.revision<1))throw new Error('Invalid profile.');return row;},
  async request(id:string){await eligible();const row=await read<VerificationRequest>('verificationRequests',id);if(!row||row.doctorUid!==uid||row.requestId!==id)throw new Error('Request unavailable.');return row;},
  credential,
  save(values:DoctorDraftInput){return call<{revision:number;changed:boolean}>('saveDoctorProfileDraft',draftInput(values));},
  async finalize(id:string){await credential(id);await call('finalizeDoctorCredential',{credentialId:id});return credential(id);},
  async upload(file:{uri:string;mimeType?:string;size?:number},category:CredentialCategory,onPrepared:(id:string)=>void,onProgress:(percent:number)=>void){
   validateFile(file.mimeType,file.size);if(!categories.includes(category))throw new Error('Invalid category.');await eligible();
   const response=await fetch(file.uri);const blob=await response.blob();
   try {
    check();validateFile(file.mimeType,blob.size);if(blob.size!==file.size)throw new Error('File size changed.');
    const slot=await call<{credentialId:string;storagePath:string;expiresAt:{seconds:number;nanoseconds:number}}>('prepareDoctorCredential',{category,contentType:file.mimeType,sizeBytes:blob.size});
    safeDocumentId(slot.credentialId);
    if(slot.storagePath!==`doctorCredentials/${uid}/${slot.credentialId}/document`)throw new Error('Invalid upload path.');
    onPrepared(slot.credentialId);
    const expiry=slot.expiresAt.seconds*1000+slot.expiresAt.nanoseconds/1e6;
    if(!Number.isFinite(expiry)||Date.now()>=expiry)throw new VerificationInputError('Upload slot expired. Select the file again to prepare a new upload.');
    check();
    const task=uploadBytesResumable(ref(storage,slot.storagePath),blob,{contentType:file.mimeType});tasks.add(task);
    try {await new Promise<void>((resolve,reject)=>{task.on('state_changed',snapshot=>{if(!disposed)onProgress(Math.round(snapshot.bytesTransferred/snapshot.totalBytes*100));},reject,resolve);});}finally{tasks.delete(task);}
    check();await call('finalizeDoctorCredential',{credentialId:slot.credentialId});return credential(slot.credentialId);
   } finally {(blob as Blob & {close?:()=>void}).close?.();}
  },
  async submit(profile:DoctorProfile,records:DoctorCredentialRecord[]){
   draftInput(profile,true);
   if(profile.uid!==uid||!Number.isSafeInteger(profile.revision)||profile.revision<1||records.length<1||records.length>5||new Set(records.map(r=>r.credentialId)).size!==records.length||!records.some(r=>r.category==='medical_license')||records.some(r=>r.doctorUid!==uid||!['ready','attached'].includes(r.state)))throw new VerificationInputError('Select 1–5 finalized credentials including a medical license.');
   return call<{requestId:string;state:string;profileRevision:number}>('submitDoctorVerification',{expectedRevision:profile.revision,credentialIds:records.map(r=>r.credentialId)});
  }
 };
}
