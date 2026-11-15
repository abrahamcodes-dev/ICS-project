import './featureEnvironment';
import {randomUUID} from 'crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc,serverTimestamp,terminate} from 'firebase/firestore';
import {getStorage,connectStorageEmulator,ref,getBytes} from 'firebase/storage';
import {initializeApp as adminApp,deleteApp as deleteAdmin} from 'firebase-admin/app';
import {getFirestore as adminFirestore} from 'firebase-admin/firestore';
import {DOCUMENT_VERSION} from '../src/privacy/consentPolicy';
if(process.env.CHECKPOINT13_EMULATOR!=='demo-calladoc-features-tests'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8108'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9108')throw Error('Explicit local demo emulator configuration required');
const projectId='demo-calladoc-features-tests',clients:any[]=[];
const trusted=adminApp({projectId},'consent-'+randomUUID()),db=adminFirestore(trusted);
const input=(extra={})=>({requestId:randomUUID().replace(/-/g,'').slice(0,20),expectedRevision:0,documentVersion:DOCUMENT_VERSION,privacyAcknowledged:true,sharingDecision:'granted',source:'profile',...extra});
async function client(){const app=initializeApp({projectId,apiKey:'demo-key',storageBucket:projectId+'.appspot.com'},randomUUID());const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9108',{disableWarnings:true});const firestore=getFirestore(app);connectFirestoreEmulator(firestore,'127.0.0.1',8108);const storage=getStorage(app);connectStorageEmulator(storage,'127.0.0.1',9208);const c={app,auth,firestore,storage,uid:''};clients.push(c);c.uid=(await createUserWithEmailAndPassword(auth,'cp13-'+randomUUID()+'@example.test',randomUUID())).user.uid;return c;}
async function call(c:any,name:string,data:unknown){const r=await fetch(`http://127.0.0.1:5108/${projectId}/us-central1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',...(c?{Authorization:'Bearer '+await c.auth.currentUser.getIdToken()}: {})},body:JSON.stringify({data})});const body:any=await r.json();if(body.error)throw Object.assign(Error(body.error.message),{code:body.error.status});return body.result;}
let patient:any,other:any,doctor:any;
beforeAll(async()=>{patient=await client();other=await client();doctor=await client();await call(doctor,'completeRegistration',{role:'doctor',fullName:'Synthetic consent doctor'});},120000);
afterAll(async()=>{for(const c of clients){await terminate(c.firestore);await deleteApp(c.app);}await deleteAdmin(trusted);});
test('missing decisions cannot create canonical patient',async()=>{
 for(const consent of [undefined,input({privacyAcknowledged:false,source:'registration'}),input({sharingDecision:null,source:'registration'})])await expect(call(patient,'completeRegistration',{role:'patient',fullName:'Synthetic consent patient',consent})).rejects.toBeDefined();
 expect((await db.doc(`users/${patient.uid}`).get()).exists).toBe(false);
});
test('atomic registration records version, server time and one audit event on retry',async()=>{
 const consent=input({source:'registration'}),data={role:'patient',fullName:'Synthetic consent patient',consent};
 await call(patient,'completeRegistration',data);
 const first=await call(patient,'getOwnPatientConsent',{});
 expect(first.state).toMatchObject({patientUid:patient.uid,revision:1,documentVersion:DOCUMENT_VERSION,sharingDecision:'granted'});
 expect(Math.abs(Date.now()-Date.parse(first.state.recordedAt))).toBeLessThan(60000);
 await call(patient,'completeRegistration',data);
 expect((await db.doc(`patientConsents/${patient.uid}`).collection('history').get()).size).toBe(1);
});
test('decline permits registration',async()=>{
 await call(other,'completeRegistration',{role:'patient',fullName:'Synthetic other',consent:input({source:'registration',sharingDecision:'declined'})});
 expect((await call(other,'getOwnPatientConsent',{})).state.sharingDecision).toBe('declined');
});
test('unauthenticated, doctor and cross-patient requests denied',async()=>{
 await expect(call(null,'updateOwnPatientConsent',input())).rejects.toMatchObject({code:'UNAUTHENTICATED'});
 await expect(call(doctor,'updateOwnPatientConsent',input())).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 await db.doc(`users/${doctor.uid}`).update({verificationStatus:'approved'}); // isolated role fixture, not a published doctor
 await expect(call(doctor,'updateOwnPatientConsent',input())).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 await expect(call(other,'updateOwnPatientConsent',{...input(),patientUid:patient.uid})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
 await expect(call(other,'getOwnPatientConsent',{patientUid:patient.uid})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
});
test('withdrawal, retries and stale grants cannot resurrect consent',async()=>{
 const withdrawal=input({expectedRevision:1,sharingDecision:'withdrawn'});
 expect((await call(patient,'updateOwnPatientConsent',withdrawal)).state.sharingDecision).toBe('withdrawn');
 expect((await call(patient,'updateOwnPatientConsent',withdrawal)).state.revision).toBe(2);
 await expect(call(patient,'updateOwnPatientConsent',input({expectedRevision:1}))).rejects.toMatchObject({code:'ABORTED'});
 await expect(call(patient,'updateOwnPatientConsent',{...withdrawal,sharingDecision:'granted'})).rejects.toMatchObject({code:'ALREADY_EXISTS'});
 await call(patient,'completeRegistration',{role:'patient',fullName:'Synthetic consent patient',consent:input({source:'registration'})});
 expect((await call(patient,'getOwnPatientConsent',{})).state.sharingDecision).toBe('withdrawn');
 expect((await db.doc(`patientConsents/${patient.uid}`).collection('history').get()).size).toBe(2);
});
test('concurrent updates accept only one matching revision',async()=>{
 const results=await Promise.allSettled([call(other,'updateOwnPatientConsent',input({expectedRevision:1})),call(other,'updateOwnPatientConsent',input({expectedRevision:1,sharingDecision:'declined'}))]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
});
test('direct consent/audit writes denied; health data and Storage stay private',async()=>{
 await setDoc(doc(patient.firestore,'patientHealthProfiles',patient.uid),{uid:patient.uid,schemaVersion:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),allergies:['Synthetic test']});
 for(const c of [patient,other,doctor]){
  await expect(setDoc(doc(c.firestore,'patientConsents',patient.uid),{sharingDecision:'granted'})).rejects.toMatchObject({code:'permission-denied'});
  await expect(getDoc(doc(c.firestore,'patientConsents',patient.uid))).rejects.toMatchObject({code:'permission-denied'});
  await expect(setDoc(doc(c.firestore,`patientConsents/${patient.uid}/history/forged`),{})).rejects.toMatchObject({code:'permission-denied'});
 }
 for(const c of [other,doctor])await expect(getDoc(doc(c.firestore,'patientHealthProfiles',patient.uid))).rejects.toMatchObject({code:'permission-denied'});
 await expect(getBytes(ref(doctor.storage,`patientMedicalRecords/${patient.uid}/synthetic.pdf`))).rejects.toMatchObject({code:'storage/unauthorized'});
});
test('legacy patient remains active and explicitly chooses without fabricated consent',async()=>{
 const legacy=await client(),now=new Date().toISOString();
 await db.doc(`users/${legacy.uid}`).create({uid:legacy.uid,email:legacy.auth.currentUser!.email,fullName:'Synthetic legacy',role:'patient',status:'active',schemaVersion:1,createdAt:now,updatedAt:now});
 expect((await call(legacy,'getOwnPatientConsent',{})).state).toBeNull();
 await call(legacy,'updateOwnPatientConsent',input({sharingDecision:'declined'}));
 expect((await db.doc(`users/${legacy.uid}`).get()).data()?.status).toBe('active');
});
