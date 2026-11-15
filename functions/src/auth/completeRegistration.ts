import {getAuth} from 'firebase-admin/auth';
import {Timestamp} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {db,usersCol} from '../shared/firestoreRefs';
import {createRegistrationHandler} from './registrationHandler';
import {consentInput,planConsent} from '../privacy/consentPolicy';
import {requireAuthenticated} from '../shared/authorization';

export const completeRegistration = onCall(async request => {
  requireAuthenticated(request.auth);
  const payload=request.data;
  const consent=payload?.role==='patient' ? consentInput(payload.consent) : null;
  if(consent && (consent.source!=='registration'||consent.expectedRevision!==0||consent.sharingDecision==='withdrawn'))
    throw new HttpsError('invalid-argument','An initial registration decision is required.');
  const data=consent ? Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='consent')) : payload;
  return createRegistrationHandler({
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
});
