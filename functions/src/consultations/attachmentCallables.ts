import {onCall,HttpsError} from '../shared/academicHttps';
import {onSchedule} from '../shared/academicHttps';
import {Timestamp,type Transaction} from 'firebase-admin/firestore';
import {db,storage} from '../shared/firestoreRefs';
import {createAuthorization,requireAuthenticated} from '../shared/authorization';
import {DomainValidationError,strictRecord} from '../profiles/domainValidation';
import {approvedDoctor} from '../scheduling/availabilityHandlers';
import {consultationTransaction} from './consultationStore';
import {authorizeHistory,authorizeNew,assertSendWindow} from './policy';
import {bindConsultation,consultationId,validateAppointmentProjection} from './domain';
import {attachmentId,prepareAttachmentInput,validateAttachmentBytes,UPLOAD_MINUTES,ATTACHMENT_MAX_BYTES} from './attachmentPolicy';
import type {ConsultationAttachment,PrepareAttachmentInput} from '../../../shared/types/consultationAttachments';
import type {PatientConsentState} from '../../../shared/types/consent';
import {DOCUMENT_VERSION} from '../privacy/consentPolicy';
import {writeEvent} from '../notifications/events';

interface Slot extends Omit<ConsultationAttachment,'status'> {
 state:'prepared'|'finalized'|'discarded';
 input:PrepareAttachmentInput;
 createdAt:Timestamp;
 expiresAt?:Timestamp;
 cleanupAt?:Timestamp;
 generation?:string;
 checksum?:string;
 uploadChecksum?:string;
 finalizedAt?:Timestamp;
}
const stamp=()=>Timestamp.now();
const domainTime=(t:Timestamp)=>({seconds:t.seconds,nanoseconds:t.nanoseconds});
const slotRef=(id:string)=>db.doc(`consultationAttachments/${id}`);
const fileFor=(s:Slot,generation?:string)=>storage.bucket().file(s.storagePath,generation?{generation}:undefined);

/** The same authoritative readers and policies used by text chat. */
async function authorize(tx:Transaction,uid:string,cid:string,writing:boolean){
 const readers=consultationTransaction(db,tx);
 const caller=await createAuthorization(readers.identity).requireActive({uid});
 const appointment=await readers.appointment(cid);
 if(!appointment)throw new HttpsError('permission-denied','Consultation unavailable.');
 const a=validateAppointmentProjection({appointmentId:appointment.appointmentId,patientId:appointment.patientId,doctorId:appointment.doctorId,startAt:appointment.startAt,endAt:appointment.endAt,status:appointment.status});
 authorizeHistory(a,caller);
 const room=bindConsultation(await readers.consultation(cid),a);
 if(writing){
  const patient=caller.role==='patient'?caller:await readers.identity(a.patientId);
  const doctor=caller.role==='doctor'?caller:await readers.identity(a.doctorId);
  authorizeNew(a,{caller,patient,doctor});
  await approvedDoctor(readers,a.doctorId);
  assertSendWindow(a,domainTime(stamp()));
  if(room.state!=='active')throw new HttpsError('failed-precondition','Consultation is read-only.');
  if(caller.role==='patient'){
   const consent=(await tx.get(db.doc(`patientConsents/${uid}`))).data() as PatientConsentState|undefined;
   if(!consent||consent.patientUid!==uid||consent.sharingDecision!=='granted'||consent.documentVersion!==DOCUMENT_VERSION)
    throw new HttpsError('failed-precondition','Review Privacy & Consent before sharing medical records.');
   // CP13 grants are explicitly development-only. They are never promoted into
   // an approved legal basis by this feature or by a client-controlled field.
   throw new HttpsError('failed-precondition','Patient medical-record sharing is disabled pending approved consent policy. Existing text chat remains available.');
  }
 }else if(caller.role==='doctor')await approvedDoctor(readers,a.doctorId);
 return {room,a,caller};
}
function identityInput(value:unknown){
 try{const v=strictRecord(value,['consultationId','attachmentId'],['consultationId','attachmentId']);return {consultationId:consultationId(v.consultationId),attachmentId:consultationId(v.attachmentId)};}
 catch{throw new HttpsError('invalid-argument','Supply the consultation and attachment identifiers only.');}
}
function bound(s:Slot|undefined,cid:string,id:string){
 if(!s||s.attachmentId!==id||s.consultationId!==cid||s.messageId!==id||s.storagePath!==`consultationAttachments/${cid}/${id}/document`)
  throw new HttpsError('not-found','Attachment unavailable.');
 return s;
}
async function safe<T>(action:()=>Promise<T>):Promise<T>{
 try{return await action();}catch(e){
  if(e instanceof HttpsError)throw e;
  if(e instanceof DomainValidationError)throw new HttpsError('permission-denied','Consultation access or timing does not permit this action.');
  if((e as {code?:number}).code===404)throw new HttpsError('not-found','The private document is missing.');
  throw new HttpsError('internal','Unable to complete the attachment operation. Retry or reload its status.');
 }
}
async function inspect(s:Slot){
 const [metadata]=await fileFor(s).getMetadata();
 const size=Number(metadata.size),generation=String(metadata.generation);
 if(metadata.metadata?.firebaseStorageDownloadTokens)throw new HttpsError('failed-precondition','Token-bearing upload rejected. Cancel and select the file again.');
 if(metadata.contentType!==s.contentType||size!==s.sizeBytes||!/^\d+$/.test(generation))throw new HttpsError('invalid-argument','Uploaded document metadata changed.');
 const [bytes]=await fileFor(s,generation).download();
 const checksum=validateAttachmentBytes(bytes,s.contentType,s.sizeBytes);
 return {bytes,generation,checksum};
}
function publicAttachment(s:Slot):ConsultationAttachment {
 return {attachmentId:s.attachmentId,consultationId:s.consultationId,messageId:s.messageId,senderId:s.senderId,
  filename:s.filename,contentType:s.contentType,sizeBytes:s.sizeBytes,storagePath:s.storagePath,status:'finalized'};
}

export const prepareConsultationAttachment=onCall(request=>safe(async()=>{
 const uid=requireAuthenticated(request.auth),input=prepareAttachmentInput(request.data);
 const id=attachmentId(input.consultationId,uid,input.requestId),ref=slotRef(id);
 return db.runTransaction(async tx=>{
  await authorize(tx,uid,input.consultationId,true);
  const existing=(await tx.get(ref)).data() as Slot|undefined;
  if(existing){
   if(Object.keys(input).some(k=>input[k as keyof typeof input]!==existing.input[k as keyof typeof input]))throw new HttpsError('already-exists','The upload request conflicts with a previous file.');
   if(existing.state==='discarded'||(existing.state==='prepared'&&existing.expiresAt!.toMillis()<=Date.now()))throw new HttpsError('failed-precondition','Upload expired or was cancelled. Select the file again.');
   return {attachmentId:id,storagePath:existing.storagePath,state:existing.state};
  }
  const quotaRef=db.doc(`consultations/${input.consultationId}/attachmentQuota/${uid}`),quota=(await tx.get(quotaRef)).data();
  if((quota?.count??0)>=50)throw new HttpsError('resource-exhausted','This consultation has reached its document limit.');
  if(quota?.lastAt instanceof Timestamp&&Date.now()-quota.lastAt.toMillis()<2000)throw new HttpsError('resource-exhausted','Please wait before starting another upload.');
  const now=stamp(),expires=Timestamp.fromMillis(now.toMillis()+UPLOAD_MINUTES*60000);
  const slot:Slot={attachmentId:id,messageId:id,consultationId:input.consultationId,senderId:uid,filename:input.filename,contentType:input.contentType,sizeBytes:input.sizeBytes,
   storagePath:`consultationAttachments/${input.consultationId}/${id}/document`,input,state:'prepared',createdAt:now,expiresAt:expires,cleanupAt:expires};
  tx.create(ref,slot);tx.set(quotaRef,{count:(quota?.count??0)+1,lastAt:now});
  return {attachmentId:id,storagePath:slot.storagePath,state:'prepared'};
 });
}));

/** Use GCS through the trusted server instead of the Firebase upload API, which
 * automatically issues bearer download tokens. Direct Storage writes are denied. */
export const uploadConsultationAttachment=onCall({memory:'512MiB',concurrency:2},request=>safe(async()=>{
 const uid=requireAuthenticated(request.auth);
 let input:{consultationId:string;attachmentId:string;base64:string};
 try{const v=strictRecord(request.data,['consultationId','attachmentId','base64'],['consultationId','attachmentId','base64']);
  const binding=identityInput({consultationId:v.consultationId,attachmentId:v.attachmentId});
  if(typeof v.base64!=='string'||v.base64.length>Math.ceil(ATTACHMENT_MAX_BYTES/3)*4||v.base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(v.base64))throw new Error('bytes');
  input={...binding,base64:v.base64};
 }catch{throw new HttpsError('invalid-argument','Supply a bounded, base64-encoded document for the prepared slot.');}
 const s=await db.runTransaction(async tx=>{
  await authorize(tx,uid,input.consultationId,true);
  const slot=bound((await tx.get(slotRef(input.attachmentId))).data() as Slot|undefined,input.consultationId,input.attachmentId);
  if(slot.senderId!==uid)throw new HttpsError('permission-denied','Upload owner required.');
  if(slot.state!=='prepared'||slot.expiresAt!.toMillis()<=Date.now())throw new HttpsError('failed-precondition','Upload expired or was cancelled.');
  return slot;
 });
 const bytes=Buffer.from(input.base64,'base64');
 if(bytes.toString('base64')!==input.base64)throw new HttpsError('invalid-argument','Invalid base64 document encoding.');
 const checksum=validateAttachmentBytes(bytes,s.contentType,s.sizeBytes);
 // Bind the bytes to the immutable upload intent before any Storage write.
 // Firebase's local Storage emulator ignores GCS generation preconditions; this
 // Firestore constraint independently prevents conflicting bytes from winning.
 await db.runTransaction(async tx=>{
  await authorize(tx,uid,input.consultationId,true);
  const ref=slotRef(input.attachmentId),current=bound((await tx.get(ref)).data() as Slot|undefined,input.consultationId,input.attachmentId);
  if(current.senderId!==uid)throw new HttpsError('permission-denied','Upload owner required.');
  if(current.state!=='prepared'||current.expiresAt!.toMillis()<=Date.now())throw new HttpsError('failed-precondition','Upload expired or was cancelled.');
  if(current.uploadChecksum&&current.uploadChecksum!==checksum)throw new HttpsError('already-exists','This upload intent already belongs to different bytes.');
  if(!current.uploadChecksum)tx.update(ref,{uploadChecksum:checksum});
 });
 try{const existing=await inspect(s);if(existing.checksum!==checksum)throw new HttpsError('already-exists','A different file already occupies this upload slot.');return {uploaded:true};}
 catch(e){if((e as {code?:number}).code!==404)throw e;}
 try{await fileFor(s).save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:s.contentType,cacheControl:'private, no-store'}});}
 catch(e){if((e as {code?:number}).code!==412)throw e;const existing=await inspect(s);if(existing.checksum!==checksum)throw new HttpsError('already-exists','A different file already occupies this upload slot.');}
 // This operation never publishes a chat message. Finalization rechecks all
 // authorization, timing and cancellation decisions after the private write.
 return {uploaded:true};
}));

export const finalizeConsultationAttachment=onCall({memory:'512MiB',concurrency:2},request=>safe(async()=>{
 const uid=requireAuthenticated(request.auth),input=identityInput(request.data),ref=slotRef(input.attachmentId);
 const before=await db.runTransaction(async tx=>{
  const {caller}=await authorize(tx,uid,input.consultationId,false);
  const s=bound((await tx.get(ref)).data() as Slot|undefined,input.consultationId,input.attachmentId);
  if(s.senderId!==uid||caller.role!=='doctor')throw new HttpsError('permission-denied','Only the sending doctor can finalize this upload.');
  return s;
 });
 // Exact finalization retries acknowledge a published message, even after closure.
 if(before.state==='finalized')return {attachment:publicAttachment(before),replayed:true};
 if(before.state!=='prepared'||before.expiresAt!.toMillis()<=Date.now())throw new HttpsError('failed-precondition','Upload no longer available.');
 const observed=await inspect(before);
 return db.runTransaction(async tx=>{
  const {room}=await authorize(tx,uid,input.consultationId,true);
  const s=bound((await tx.get(ref)).data() as Slot|undefined,input.consultationId,input.attachmentId);
  if(s.senderId!==uid)throw new HttpsError('permission-denied','Sending doctor required.');
  if(s.state==='finalized')return {attachment:publicAttachment(s),replayed:true};
  if(s.state!=='prepared'||s.expiresAt!.toMillis()<=Date.now())throw new HttpsError('failed-precondition','Upload expired or was cancelled.');
  if(s.uploadChecksum!==observed.checksum)throw new HttpsError('failed-precondition','Uploaded bytes do not match the immutable upload intent.');
  const [metadata]=await fileFor(s).getMetadata();
  if(String(metadata.generation)!==observed.generation||Number(metadata.size)!==s.sizeBytes||metadata.contentType!==s.contentType)throw new HttpsError('failed-precondition','Uploaded document changed.');
  // Recheck at the publication decision time, after all external I/O.
  const readers=consultationTransaction(db,tx),a=await readers.appointment(input.consultationId);
  if(!a)throw new HttpsError('permission-denied','Consultation unavailable.');
  const now=stamp();assertSendWindow(validateAppointmentProjection({appointmentId:a.appointmentId,patientId:a.patientId,doctorId:a.doctorId,startAt:a.startAt,endAt:a.endAt,status:a.status}),domainTime(now));
  const attachment=publicAttachment(s);
  const {expiresAt,cleanupAt,...retained}=s;
  tx.set(ref,{...retained,state:'finalized',generation:observed.generation,checksum:observed.checksum,finalizedAt:now});
  tx.create(db.doc(`consultations/${s.consultationId}/messages/${s.messageId}`),{messageId:s.messageId,senderId:uid,type:'attachment',attachment,createdAt:now,schemaVersion:1});
  writeEvent(db,tx,room.patientId,'message',s.messageId,s.consultationId,domainTime(now));
  return {attachment,replayed:false};
 });
}));

export const getConsultationAttachment=onCall({memory:'512MiB',concurrency:2},request=>safe(async()=>{
 const uid=requireAuthenticated(request.auth),input=identityInput(request.data);
 async function access(){return db.runTransaction(async tx=>{
  await authorize(tx,uid,input.consultationId,false);
  const s=bound((await tx.get(slotRef(input.attachmentId))).data() as Slot|undefined,input.consultationId,input.attachmentId);
  const message=(await tx.get(db.doc(`consultations/${s.consultationId}/messages/${s.messageId}`))).data();
  if(s.state!=='finalized'||message?.type!=='attachment'||message.attachment?.attachmentId!==s.attachmentId)throw new HttpsError('not-found','Published attachment unavailable.');
  return s;
 });}
 const s=await access(),observed=await inspect(s);
 // A late authorized retry can recreate identical bytes in the Storage emulator,
 // which ignores create-only preconditions. The immutable SHA-256 remains the
 // content identity; each physical read is still pinned to its observed generation.
 if(observed.checksum!==s.checksum)throw new HttpsError('failed-precondition','Private document integrity check failed.');
 const current=await access();
 if(current.generation!==s.generation||current.checksum!==s.checksum)throw new HttpsError('failed-precondition','Private document changed.');
 return {attachment:publicAttachment(s),base64:observed.bytes.toString('base64')};
}));

export const discardConsultationAttachment=onCall(request=>safe(async()=>{
 const uid=requireAuthenticated(request.auth),input=identityInput(request.data),ref=slotRef(input.attachmentId);
 const s=await db.runTransaction(async tx=>{
  // Cancellation remains possible after expiry/closure, but only for the owner.
  await createAuthorization(async id=>(await tx.get(db.doc(`users/${id}`))).data()).requireActive({uid});
  const slot=bound((await tx.get(ref)).data() as Slot|undefined,input.consultationId,input.attachmentId);
  if(slot.senderId!==uid)throw new HttpsError('permission-denied','Upload owner required.');
  if(slot.state==='finalized')throw new HttpsError('failed-precondition','Published clinical records cannot be deleted here.');
  tx.update(ref,{state:'discarded',cleanupAt:stamp()});return slot;
 });
 await fileFor(s).delete({ignoreNotFound:true});return {discarded:true};
}));

/** Retained tombstones make late/interrupted uploads inaccessible and
 * eligible for repeated deletion. A failed delete remains queued for retry. */
export async function cleanupAttachmentUploads(){
 const due=await db.collection('consultationAttachments').where('cleanupAt','<=',stamp()).limit(100).get();
 for(const item of due.docs){
  const s=await db.runTransaction(async tx=>{
   const slot=(await tx.get(item.ref)).data() as Slot|undefined;
   if(!slot||slot.state==='finalized'||!slot.cleanupAt||slot.cleanupAt.toMillis()>Date.now())return null;
   if(!/^[a-f0-9]{64}$/.test(slot.consultationId)||slot.attachmentId!==item.id
    ||slot.storagePath!==`consultationAttachments/${slot.consultationId}/${item.id}/document`)return null;
   tx.update(item.ref,{state:'discarded',cleanupAt:Timestamp.fromMillis(Date.now()+3600000)});return slot;
  });
  if(s){try{await fileFor(s).delete({ignoreNotFound:true});}catch{/* Retry next sweep; never log private paths. */}}
 }
}
export const cleanupConsultationAttachments=onSchedule('every 60 minutes',cleanupAttachmentUploads);
