import {randomUUID,createHash} from 'crypto';
import {Timestamp,FieldPath,FieldValue,type Query} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {db,storage} from '../shared/firestoreRefs';
import {safeId} from '../profiles/domainValidation';
import {validateCredentialRecord} from '../profiles/verificationPolicy';
import {DELETION_PHASES,type DeletionPhase} from './deletionPolicy';
import type {AccountDeletionView} from '../../../shared/types/accountDeletion';
import type {DoctorCredentialRecord} from '../../../shared/types/verification';

export interface DeletionJob {
 uid:string;role:'patient'|'doctor';requestId:string;state:AccountDeletionView['state'];phase:DeletionPhase;
 legalErasure:'retention_pending';retainedCategories:string[];requestedAt:Timestamp;updatedAt:Timestamp;
 nextAttemptAt?:Timestamp;attempts:number;cursor:string|null;leaseToken:string|null;leaseUntil:Timestamp|null;schemaVersion:1;
}
export function viewDeletionJob(j:DeletionJob):AccountDeletionView{return {state:j.state,phase:j.phase,legalErasure:'retention_pending',retainedCategories:j.retainedCategories,requestReference:j.requestId,requestedAt:j.requestedAt.toDate().toISOString(),updatedAt:j.updatedAt.toDate().toISOString()};}
const jobRef=(uid:string)=>db.doc(`accountDeletionJobs/${uid}`);
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
class WaitForUploadExpiry extends Error {constructor(readonly until:number){super('upload-expiry');}}
async function authOperation(action:()=>Promise<unknown>){try{await action();}catch(e){if((e as {code?:string}).code!=='auth/user-not-found')throw e;}}
async function deleteQuery(query:Query){const page=await query.limit(100).get();if(page.empty)return true;const batch=db.batch();page.docs.forEach(d=>batch.delete(d.ref));await batch.commit();return page.size<100;}

/** Preserve byte-identical verification evidence in token-free, backend-only
 * archival storage before deleting its old token-bearing object. Immutable
 * verification documents remain unchanged; a private manifest preserves provenance. */
async function archiveCredential(uid:string,row:FirebaseFirestore.QueryDocumentSnapshot){
 const raw=row.data();
 const time=(v:unknown)=>{if(!(v instanceof Timestamp))throw Error('credential-time');return {seconds:v.seconds,nanoseconds:v.nanoseconds};};
 const record={...raw,createdAt:time(raw.createdAt),updatedAt:time(raw.updatedAt),expiresAt:time(raw.expiresAt)} as DoctorCredentialRecord;
 validateCredentialRecord(record);
 if(record.doctorUid!==uid||record.credentialId!==row.id||record.storagePath!==`doctorCredentials/${uid}/${row.id}/document`)throw Error('credential-binding');
 // Do not open the old create-only path again while an upload capability is live.
 if(record.state==='prepared'&&raw.expiresAt.toMillis()>Date.now())throw new WaitForUploadExpiry(raw.expiresAt.toMillis()+60000);
 const manifestRef=db.doc(`accountRetentions/${uid}/objects/${row.id}`),manifest=await manifestRef.get(),source=storage.bucket().file(record.storagePath);
 if(manifest.exists){
  const saved=manifest.data()!;
  if(saved.originalPath!==record.storagePath||typeof saved.archivePath!=='string'||!saved.archivePath.startsWith(`retainedAccountData/${uid}/credentials/${row.id}/`))throw Error('retention-binding');
  const [bytes]=await storage.bucket().file(saved.archivePath).download();
  if(hash(bytes)!==saved.checksum)throw Error('retention-integrity');
  await source.delete({ignoreNotFound:true});return;
 }
 let metadata;
 try{[metadata]=await source.getMetadata();}catch(e){if((e as {code?:number}).code===404&&record.state==='prepared')return;throw e;}
 const size=Number(metadata.size),generation=String(metadata.generation);
 if(size<1||size>5*1024*1024||size!==record.sizeBytes||metadata.contentType!==record.contentType)throw Error('credential-metadata');
 const [bytes]=await storage.bucket().file(record.storagePath,{generation}).download(),checksum=hash(bytes);
 if(record.generation!==null&&(record.generation!==generation||record.checksum!==checksum))throw Error('credential-integrity');
 const archivePath=`retainedAccountData/${uid}/credentials/${row.id}/${checksum}`,archive=storage.bucket().file(archivePath);
 if(!(await archive.exists())[0])await archive.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:record.contentType,cacheControl:'private, no-store'}});
 const [copy]=await archive.download(),[archivedMetadata]=await archive.getMetadata();
 if(hash(copy)!==checksum||archivedMetadata.metadata?.firebaseStorageDownloadTokens)throw Error('retention-integrity');
 const evidence={uid,category:'professional_verification',retention:'unresolved',originalPath:record.storagePath,originalGeneration:generation,archivePath,checksum,sizeBytes:size,contentType:record.contentType,archivedAt:Timestamp.now()};
 try{await manifestRef.create(evidence);}catch(e){if((e as {code?:number}).code!==6)throw e;const existing=(await manifestRef.get()).data();if(existing?.checksum!==checksum||existing?.archivePath!==archivePath)throw Error('retention-conflict');}
 await source.delete({ignoreNotFound:true});
}

async function phase(uid:string,job:DeletionJob):Promise<{done:boolean;cursor?:string|null}>{
 const userRef=db.doc(`users/${uid}`);
 switch(job.phase){
  case 'sessions':
   await authOperation(()=>getAuth().updateUser(uid,{disabled:true}));
   await authOperation(()=>getAuth().revokeRefreshTokens(uid));return {done:true};
  case 'devices':{
   if(!await deleteQuery(db.collection('notificationDevices').where('uid','==',uid)))return {done:false};
   if(!await deleteQuery(db.collection(`notificationInboxes/${uid}/items`)))return {done:false};
   await db.doc(`notificationInboxes/${uid}`).delete();return {done:true};
  }
  case 'avatars':{
   const state=(await userRef.collection('avatar').doc('state').get()).data();
   if(state?.pending&&Number(state.expiresAt)>Date.now())throw new WaitForUploadExpiry(Number(state.expiresAt)+60000);
   const [files]=await storage.bucket().getFiles({prefix:`avatars/${uid}/`,autoPaginate:false,maxResults:100});
   for(const file of files)await file.delete({ignoreNotFound:true});
   return {done:files.length<100};
  }
  case 'profiles':{
   const batch=db.batch();batch.delete(db.doc(`patientProfiles/${uid}`));batch.delete(userRef.collection('avatar').doc('state'));
   batch.delete(db.doc(`doctorPublicProfiles/${uid}/avatar/current`));batch.delete(db.doc(`doctorPublicProfiles/${uid}`));
   const professional=db.doc(`doctorProfiles/${uid}`);
   if((await professional.get()).exists)batch.update(professional,{phoneNumber:FieldValue.delete()});
   await batch.commit();return {done:true};
  }
  case 'staging':{
   let query=db.collection('consultationAttachments').where('senderId','==',uid).orderBy(FieldPath.documentId()).limit(50);
   if(job.cursor)query=query.startAfter(job.cursor);
   const page=await query.get();
   for(const row of page.docs){
    const discarded=await db.runTransaction(async tx=>{
     const s=(await tx.get(row.ref)).data();if(!s||s.state==='finalized')return null;
     if(s.senderId!==uid||s.attachmentId!==row.id||!/^([a-f0-9]{64})$/.test(s.consultationId)||s.storagePath!==`consultationAttachments/${s.consultationId}/${row.id}/document`)throw Error('staging-binding');
     // Reuse CP14 tombstones/sweeper for late in-flight writes. Remove the
     // unnecessary draft filename/input while preserving cleanup provenance.
     tx.set(row.ref,{attachmentId:row.id,consultationId:s.consultationId,senderId:uid,storagePath:s.storagePath,state:'discarded',cleanupAt:Timestamp.now()});return s.storagePath as string;
    });
    if(discarded)await storage.bucket().file(discarded).delete({ignoreNotFound:true});
   }
   return {done:page.size<50,cursor:page.docs[page.docs.length-1]?.id??job.cursor};
  }
  case 'evidence':{
   if(job.role!=='doctor')return {done:true};
   let query=db.collection('doctorCredentials').where('doctorUid','==',uid).orderBy(FieldPath.documentId()).limit(10);
   if(job.cursor)query=query.startAfter(job.cursor);
   const page=await query.get();for(const row of page.docs)await archiveCredential(uid,row);
   return {done:page.size<10,cursor:page.docs[page.docs.length-1]?.id??job.cursor};
  }
  case 'authentication':
   // All required cleanup/archive phases were checkpointed before deleting Auth.
   await authOperation(()=>getAuth().deleteUser(uid));return {done:true};
  case 'complete':return {done:true};
 }
}

/** Internal worker only; no caller can select an arbitrary UID through a callable.
 * All destructive steps are idempotent. CAS leases fence progress/error updates;
 * a crashed invocation resumes its persisted phase after lease expiry. */
export async function processAccountDeletion(uid:string){
 safeId(uid);const ref=jobRef(uid),token=randomUUID();
 const claimed=await db.runTransaction(async tx=>{
  const snapshot=await tx.get(ref),job=snapshot.data() as DeletionJob|undefined;
  if(!job||job.uid!==uid||job.state==='completed'||(job.leaseUntil&&job.leaseUntil.toMillis()>Date.now()))return false;
  const identity=(await tx.get(db.doc(`users/${uid}`))).data();
  if(identity?.uid!==uid||identity.status!=='disabled'){
   tx.update(ref,{state:'retryable',errorCode:'access_revocation_conflict',nextAttemptAt:Timestamp.fromMillis(Date.now()+3600000),updatedAt:Timestamp.now()});return false;
  }
  const until=Timestamp.fromMillis(Date.now()+10*60000);
  tx.update(ref,{state:'processing',leaseToken:token,leaseUntil:until,nextAttemptAt:until,attempts:job.attempts+1,updatedAt:Timestamp.now()});return true;
 });
 if(!claimed)return false;
 try{
  for(let step=0;step<DELETION_PHASES.length;step++){
   const job=(await ref.get()).data() as DeletionJob;
   if(job.leaseToken!==token)return false;
   const result=await phase(uid,job),last=job.phase==='complete';
   const proceed=await db.runTransaction(async tx=>{
    const current=(await tx.get(ref)).data() as DeletionJob;
    if(current.leaseToken!==token||current.phase!==job.phase)return false;
    const next=DELETION_PHASES[DELETION_PHASES.indexOf(job.phase)+1];
    if(last){tx.update(ref,{state:'completed',leaseToken:null,leaseUntil:null,nextAttemptAt:FieldValue.delete(),cursor:null,updatedAt:Timestamp.now()});return false;}
    if(!result.done){tx.update(ref,{state:'requested',leaseToken:null,leaseUntil:null,nextAttemptAt:Timestamp.now(),cursor:result.cursor??null,updatedAt:Timestamp.now()});return false;}
    tx.update(ref,{phase:next,cursor:null,updatedAt:Timestamp.now()});return true;
   });
   if(!proceed)return true;
  }
 }catch(e){
  await db.runTransaction(async tx=>{
   const job=(await tx.get(ref)).data() as DeletionJob;
   if(job.leaseToken!==token)return;
   const wait=e instanceof WaitForUploadExpiry;
   tx.update(ref,{state:wait?'requested':'retryable',leaseToken:null,leaseUntil:null,nextAttemptAt:Timestamp.fromMillis(wait?e.until:Date.now()+Math.min(3600000,30000*2**Math.min(job.attempts,7))),updatedAt:Timestamp.now(),errorCode:wait?'waiting_for_upload_expiry':'cleanup_retryable'});
  });
 }
 return true;
}
