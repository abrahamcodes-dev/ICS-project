import {Timestamp} from 'firebase-admin/firestore';
import {onCall,HttpsError} from '../shared/academicHttps';
import {academicEnvironment,invitationEmail,admissionAuditId} from '../shared/academicAdmission';
import {authorization} from '../shared/authorization';
import {db} from '../shared/firestoreRefs';
import {getAuth} from 'firebase-admin/auth';

export function requireAdmissionAdministrator(role:string,claim:unknown) {
  if(role!=='administrator'||claim!==true)throw new HttpsError('permission-denied','Privileged admission administrator required.');
}
export const manageAcademicDemoTester=onCall(async request=>{
  if(academicEnvironment()!=='hosted')throw new HttpsError('failed-precondition','Hosted administration only.');
  const actor=await authorization.requireAdministrator(request.auth);
  requireAdmissionAdministrator(actor.role,request.auth?.token.academicDemoAdmin);
  requireAdmissionAdministrator(actor.role,(await getAuth().getUser(actor.uid)).customClaims?.academicDemoAdmin);
  const v=request.data;
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['email','enabled','expiresAt'].includes(k))
    ||typeof v.enabled!=='boolean'||typeof v.expiresAt!=='string')throw new HttpsError('invalid-argument','Email, enabled and expiry are required.');
  const email=invitationEmail(v.email),ms=Date.parse(v.expiresAt);
  if(!Number.isFinite(ms)||(v.enabled&&ms<=Date.now()))throw new HttpsError('invalid-argument','Supply a future expiry.');
  await db.runTransaction(async tx=>{
    const ref=db.doc('academicDemoInvitations/'+email),old=(await tx.get(ref)).data();
    const memberRef=old?.uid?db.doc('academicDemoTesters/'+old.uid):null;
    const member=memberRef?(await tx.get(memberRef)).data():null;
    tx.set(ref,{email,uid:old?.uid??null,enabled:v.enabled,expiresAt:Timestamp.fromMillis(ms)});
    if(member&&memberRef)tx.update(memberRef,{enabled:v.enabled,expiresAt:Timestamp.fromMillis(ms)});
    tx.create(db.collection('academicDemoAdmissionAudit').doc(),{actorUid:actor.uid,emailDigest:admissionAuditId(email),enabled:v.enabled,expiresAt:Timestamp.fromMillis(ms),at:Timestamp.now()});
  });
  return {updated:true};
});
