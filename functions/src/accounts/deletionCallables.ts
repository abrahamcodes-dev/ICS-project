import {intervalDuration} from '../scheduling/durations';
import {onCall,HttpsError} from '../shared/academicHttps';
import {onSchedule} from '../shared/academicHttps';
import {Timestamp} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {db} from '../shared/firestoreRefs';
import {requireAuthenticated} from '../shared/authorization';
import {validIdentity} from '../auth/registrationPolicy';
import {strictRecord,safeId} from '../profiles/domainValidation';
import {bookingRequestId} from '../scheduling/primitives';
import {SCHEDULING} from '../scheduling/constants';
import {POST_END_GRACE_MS} from '../consultations/domain';
import {assertNoCareCommitment,requireRecentAuthentication,RETAINED_CATEGORIES} from './deletionPolicy';
import {processAccountDeletion,viewDeletionJob,type DeletionJob} from './deletionWorker';
import {UNRESOLVED_PAYMENTS} from '../payments/policy';

export const requestOwnAccountDeletion=onCall(async request=>{
 const uid=requireAuthenticated(request.auth);safeId(uid);
 let requestId:string;
 try{const input=strictRecord(request.data,['requestId','confirmation'],['requestId','confirmation']);requestId=bookingRequestId(input.requestId);if(input.confirmation!=='delete-account')throw Error('confirmation');}
 catch{throw new HttpsError('invalid-argument','Explicit account-deletion confirmation required.');}
 try{return await db.runTransaction(async tx=>{
  const ref=db.doc(`accountDeletionJobs/${uid}`),existing=await tx.get(ref);
  // Replays acknowledge an already-authorized deletion; never restart phases or
  // reactivate access. No new destructive intent is created by a stale retry.
  if(existing.exists){const job=existing.data() as DeletionJob;
   if(job.uid!==uid)throw new HttpsError('permission-denied','Deletion state unavailable.');
   if(job.state==='retryable'){const now=Timestamp.now();tx.update(ref,{state:'requested',nextAttemptAt:now,updatedAt:now});job.state='requested';job.updatedAt=now;}
   return {job:viewDeletionJob(job)};
  }
  requireRecentAuthentication(request.auth!.token.auth_time);
  const user=await getAuth().getUser(uid);
  if(user.disabled)throw new HttpsError('permission-denied','Account cannot request this operation.');
  const snapshot=await tx.get(db.doc(`users/${uid}`)),identity=snapshot.data();
  if(!validIdentity(identity)||identity.uid!==uid||identity.status!=='active'||!['patient','doctor'].includes(identity.role))
   throw new HttpsError('permission-denied','Active patient or doctor account required.');
  // Reuse the existing ascending scheduling index. A single decision time keeps
  // a window expiring during this query from hiding a later future commitment.
  const decisionTime=Date.now();
  const commitments=await tx.get(db.collection('appointments').where(`${identity.role}Id`,'==',uid).where('status','==','scheduled')
   .where('startAt','>',Timestamp.fromMillis(decisionTime-3600000-POST_END_GRACE_MS)).orderBy('startAt','asc').limit(10));
  for(const row of commitments.docs){const latest=row.data();if(!(latest.startAt instanceof Timestamp)||!(latest.endAt instanceof Timestamp)||![900000,1800000,3600000].includes(latest.endAt.toMillis()-latest.startAt.toMillis()))throw new HttpsError('failed-precondition','Appointment state requires review before deletion.');assertNoCareCommitment(latest as {endAt:Timestamp},decisionTime);}
  if(commitments.size===10)throw new HttpsError('failed-precondition','Appointment state requires review before deletion.');
  const financial=await tx.get(db.collection('consultationPayments').where(`${identity.role}Id`,'==',uid).where('status','in',UNRESOLVED_PAYMENTS).limit(1));
  if(!financial.empty)throw new HttpsError('failed-precondition','Resolve pending payments or refunds before account deletion.',{reason:'financial_obligation'});
  const now=Timestamp.now();
  const job:DeletionJob={uid,role:identity.role as 'patient'|'doctor',requestId,state:'requested',phase:'sessions',legalErasure:'retention_pending',retainedCategories:RETAINED_CATEGORIES,
   requestedAt:now,updatedAt:now,nextAttemptAt:now,attempts:0,cursor:null,leaseToken:null,leaseUntil:null,schemaVersion:1};
  tx.create(ref,job);
  // Preserve the canonical schema so every existing active-identity check denies
  // access immediately. UID references remain pseudonymous, never anonymous.
  tx.set(snapshot.ref,{...identity,status:'disabled',fullName:'Deleted account',email:`${uid}@deleted.invalid`,updatedAt:now.toDate().toISOString()});
  tx.delete(db.doc(`doctorPublicProfiles/${uid}`));
  return {job:viewDeletionJob(job)};
 });}catch(e){if(e instanceof HttpsError)throw e;throw new HttpsError('internal','Deletion could not be confirmed. Check its status before retrying.');}
});

export const getOwnAccountDeletion=onCall(async request=>{
 const uid=requireAuthenticated(request.auth);safeId(uid);
 if(!request.data||typeof request.data!=='object'||Array.isArray(request.data)||Object.keys(request.data).length)throw new HttpsError('invalid-argument','No target identifiers are accepted.');
 try{const snapshot=await db.doc(`accountDeletionJobs/${uid}`).get();
 // This narrowly scoped status read is allowed for the authenticated job owner
 // after canonical access is disabled. It grants no clinical/profile access.
 if(snapshot.exists&&snapshot.data()!.uid!==uid)throw new HttpsError('permission-denied','Deletion state unavailable.');
 return {job:snapshot.exists?viewDeletionJob(snapshot.data() as DeletionJob):null};
 }catch(e){if(e instanceof HttpsError)throw e;throw new HttpsError('internal','Unable to confirm deletion status. An accepted request continues on the server.');}
});

export const resumeAccountDeletions=onSchedule({schedule:'every 5 minutes',timeoutSeconds:300,memory:'512MiB',concurrency:1},async()=>{
 const due=await db.collection('accountDeletionJobs').where('nextAttemptAt','<=',Timestamp.now()).limit(10).get();
 for(const row of due.docs)await processAccountDeletion(row.id);
});
