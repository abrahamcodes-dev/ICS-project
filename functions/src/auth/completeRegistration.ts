import {getAuth} from 'firebase-admin/auth';
import {Timestamp} from 'firebase-admin/firestore';
import {onRegistrationCall as onCall,HttpsError} from '../shared/academicHttps';
import {db,usersCol} from '../shared/firestoreRefs';
import {createRegistrationHandler} from './registrationHandler';
import {consentInput,planConsent} from '../privacy/consentPolicy';
import {requireAuthenticated} from '../shared/authorization';
import {academicEnvironment,requireInvitedRole} from '../shared/academicAdmission';
import {ACADEMIC_NOTICE_VERSION} from '../shared/academicNotice';

export const completeRegistration = onCall(async request => {
  requireAuthenticated(request.auth);
  const hosted=academicEnvironment()==='hosted';
  if(hosted && (request.data?.academicNoticeVersion!==ACADEMIC_NOTICE_VERSION||request.data?.academicNoticeAcknowledged!==true))
    throw new HttpsError('failed-precondition','Review and acknowledge the hosted academic notice.');
  const payload=hosted?Object.fromEntries(Object.entries(request.data).filter(([k])=>!['academicNoticeVersion','academicNoticeAcknowledged'].includes(k))):request.data;
  if(hosted)requireInvitedRole((await db.doc('academicDemoTesters/'+request.auth!.uid).get()).data()?.expectedRole,payload?.role);
  const consent=payload?.role==='patient' ? consentInput(payload.consent) : null;
  if(consent && (consent.source!=='registration'||consent.expectedRevision!==0||consent.sharingDecision==='withdrawn'))
    throw new HttpsError('invalid-argument','An initial registration decision is required.');
  const data=consent ? Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='consent')) : payload;
  const identity=await createRegistrationHandler({
    getUser:uid=>getAuth().getUser(uid),now:()=>new Date().toISOString(),
    transact:(uid,decide)=>db.runTransaction(async tx=>{
      const ref=usersCol.doc(uid),snapshot=await tx.get(ref);
      const decision=decide(snapshot.exists?(snapshot.data()??{}):null);
      const consentRef=db.doc(`patientConsents/${uid}`);
      const current=consent ? await tx.get(consentRef) : null;
      if(decision.action==='create')tx.create(ref,decision.identity);
      if(consent&&!current?.exists){
        const now=Timestamp.now(),state=planConsent(uid,consent,null,now.toDate().toISOString());
        tx.create(consentRef,state);
        tx.create(consentRef.collection('history').doc(consent.requestId),{input:consent,state,serverTimestamp:now});
      }
      // Registration replay must never overwrite a subsequent withdrawal.
      return decision.identity;
    }),
  })({...request,data});
  if(hosted)await db.doc('academicDemoTesters/'+request.auth!.uid).update({noticeVersion:ACADEMIC_NOTICE_VERSION,noticeAcknowledgedAt:Timestamp.now()});
  return identity;
});
