import {createHash} from 'node:crypto';
import {getAuth} from 'firebase-admin/auth';
import {Timestamp} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {db} from './firestoreRefs';
import {ACADEMIC_NOTICE_VERSION} from './academicNotice';

export function academicEnvironment(env:NodeJS.ProcessEnv=process.env):'local'|'hosted' {
  const project=env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || '';
  if (env.FUNCTIONS_EMULATOR==='true' && /^demo-calladoc(?:-[a-z0-9-]+)?$/.test(project)
    && /^127\.0\.0\.1:\d+$/.test(env.FIRESTORE_EMULATOR_HOST || '')
    && /^127\.0\.0\.1:\d+$/.test(env.FIREBASE_AUTH_EMULATOR_HOST || '')) return 'local';
  if (/^[a-z][a-z0-9-]*-academic-demo$/.test(project) && !project.startsWith('demo-')
    && !env.FUNCTIONS_EMULATOR && !Object.keys(env).some(k=>k.endsWith('_EMULATOR_HOST')&&env[k])) return 'hosted';
  throw new HttpsError('failed-precondition','Academic environment is not safely configured.');
}
export function invitationEmail(value:unknown):string {
  if(typeof value!=='string'||value.length>254||!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(value))
    throw new HttpsError('invalid-argument','A valid invitation email is required.');
  return value.toLowerCase();
}
export function admitted(member:any,invite:any,uid:string,email:string,now:number):boolean {
  return !!member && !!invite && member.enabled===true && invite.enabled===true
    && member.uid===uid && invite.uid===uid && member.email===email && invite.email===email
    && member.expiresAt instanceof Timestamp && invite.expiresAt instanceof Timestamp
    && member.expiresAt.toMillis()>now && invite.expiresAt.toMillis()>now;
}
export async function requireGoogleInvitation(email:string,env:NodeJS.ProcessEnv=process.env) {
  if(academicEnvironment(env)==='local')return;
  const normalized=invitationEmail(email),snap=await db.doc('academicDemoInvitations/'+normalized).get(),v=snap.data();
  if(!v||v.enabled!==true||v.email!==normalized||!(v.expiresAt instanceof Timestamp)||v.expiresAt.toMillis()<=Date.now())
    throw new HttpsError('permission-denied','An active academic invitation is required.');
}
/** No session cache: trusted Auth state and both private records are checked each request. */
export async function requireAcademicAdmission(auth:{uid:string;token?:Record<string,any>}|undefined,enroll=false,env:NodeJS.ProcessEnv=process.env) {
  if(academicEnvironment(env)==='local')return;
  if(!auth?.uid)throw new HttpsError('unauthenticated','Sign in required.');
  const user=await getAuth().getUser(auth.uid);
  if(user.disabled||!user.emailVerified||!user.email || auth.token?.email_verified!==true
    || auth.token?.email?.toLowerCase()!==user.email.toLowerCase()
    || typeof auth.token.auth_time!=='number'
    || auth.token.auth_time*1000 < Date.parse(user.tokensValidAfterTime || '1970-01-01'))
    throw new HttpsError('permission-denied','Verify your invited email and sign in again.');
  const member=await admitVerifiedUser(user.uid,user.email,enroll,env);
  if(!enroll && member?.noticeVersion!==ACADEMIC_NOTICE_VERSION)throw new HttpsError('permission-denied','Acknowledge the hosted academic notice through registration.');
}
export async function admitVerifiedUser(uid:string,email:string,enroll:boolean,env:NodeJS.ProcessEnv=process.env) {
  if(academicEnvironment(env)==='local')return;
  const normalized=invitationEmail(email),memberRef=db.doc('academicDemoTesters/'+uid),inviteRef=db.doc('academicDemoInvitations/'+normalized);
  return db.runTransaction(async tx=>{
    const [m,i]=await tx.getAll(memberRef,inviteRef);let member=m.data(),invite=i.data();
    const now=Date.now();
    if(enroll && !m.exists && invite?.enabled===true && invite.email===normalized
      && invite.expiresAt instanceof Timestamp && invite.expiresAt.toMillis()>now
      && (invite.uid===null||invite.uid===uid)) {
      member={uid,email:normalized,enabled:true,expiresAt:invite.expiresAt};
      invite={...invite,uid};tx.create(memberRef,member);tx.update(inviteRef,{uid});
    }
    if(!admitted(member,invite,uid,normalized,now))throw new HttpsError('permission-denied','Academic membership is missing, expired or revoked.');
    return member;
  });
}
export const admissionAuditId=(email:string)=>createHash('sha256').update(invitationEmail(email)).digest('hex');
