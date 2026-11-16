import {beforeUserCreated,beforeUserSignedIn,HttpsError} from 'firebase-functions/v2/identity';
import {academicEnvironment,requireGoogleInvitation,invitationEmail} from '../shared/academicAdmission';
import {db} from '../shared/firestoreRefs';
import {Timestamp} from 'firebase-admin/firestore';

export async function checkAcademicAuth(user:{uid:string;email?:string},env:NodeJS.ProcessEnv=process.env) {
  if(academicEnvironment(env)==='local')return;
  if(!user.email)throw new HttpsError('permission-denied','Invited email required.');
  await requireGoogleInvitation(user.email,env);
  const email=invitationEmail(user.email);
  const [i,m]=await db.getAll(db.doc('academicDemoInvitations/'+email),db.doc('academicDemoTesters/'+user.uid));
  const invite=i.data(),member=m.data();
  if(invite?.uid && invite.uid!==user.uid || member && (member.enabled!==true||member.email!==email
    ||!(member.expiresAt instanceof Timestamp)||member.expiresAt.toMillis()<=Date.now()))
    throw new HttpsError('permission-denied','Academic admission unavailable.');
}
const limits={region:'us-central1',minInstances:0,maxInstances:2,concurrency:10};
// Identity Platform blocking triggers are required before hosted providers open.
export const academicBeforeCreate=beforeUserCreated(limits,async event=>{if(!event.data)throw new HttpsError('permission-denied','Identity required.');await checkAcademicAuth(event.data);});
export const academicBeforeSignIn=beforeUserSignedIn(limits,async event=>{if(!event.data)throw new HttpsError('permission-denied','Identity required.');await checkAcademicAuth(event.data);});
