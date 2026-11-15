// Synthetic signed IdP fixtures; Google certificate distribution is mocked ONLY
// in this test. Actual Google OAuth/account-selection is a separate device test.
import {generateKeyPairSync,sign,randomUUID} from 'crypto';
import {OAuth2Client} from 'google-auth-library';
import {CertificateFormat} from 'google-auth-library/build/src/auth/oauth2client';
import {initializeApp,deleteApp,type FirebaseApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithCustomToken,createUserWithEmailAndPassword,signInWithEmailAndPassword,linkWithCredential,reauthenticateWithCredential,GoogleAuthProvider} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,terminate} from 'firebase/firestore';
import {getAuth as adminAuth} from 'firebase-admin/auth';
import {db} from '../src/shared/firestoreRefs';
import {signInWithGoogle} from '../src/auth/googleSignIn';
import {completeRegistration} from '../src/auth/completeRegistration';
import {authorization} from '../src/shared/authorization';
import {DOCUMENT_VERSION} from '../src/privacy/consentPolicy';

if(process.env.GCLOUD_PROJECT!=='demo-calladoc-google-test'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9107'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8107')throw Error('Isolated demo Google emulators required.');
const audience='synthetic-web.apps.googleusercontent.com',uids=new Set<string>(),clients:FirebaseApp[]=[];
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
function googleToken(sub:string,email:string){
 const now=Math.floor(Date.now()/1000),body=encode({alg:'RS256',kid:'fixture-key'})+'.'+encode({iss:'https://accounts.google.com',aud:audience,sub,email,email_verified:true,name:'Synthetic Google patient',iat:now,exp:now+300});
 return body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url');
}
function client(){
 const app=initializeApp({apiKey:'demo-key',projectId:'demo-calladoc-google-test'},randomUUID());clients.push(app);
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9107',{disableWarnings:true});const firestore=getFirestore(app);connectFirestoreEmulator(firestore,'127.0.0.1',8107);
 return {app,auth,firestore};
}
async function exchange(sub:string,email:string,allowCreate=true){
 const result=await signInWithGoogle.run({data:{idToken:googleToken(sub,email),allowCreate}} as any);uids.add(result.uid);return result;
}
const consent=()=>({requestId:randomUUID().replace(/-/g,'').slice(0,20),documentVersion:DOCUMENT_VERSION,expectedRevision:0,privacyAcknowledged:true,sharingDecision:'declined',source:'registration'});
beforeAll(()=>{
 process.env.GOOGLE_SIGN_IN_WEB_CLIENT_ID=audience;
 jest.spyOn(OAuth2Client.prototype,'getFederatedSignonCertsAsync').mockResolvedValue({certs:{'fixture-key':publicKey.export({type:'spki',format:'pem'}).toString()},format:CertificateFormat.PEM});
});
afterAll(async()=>{
 jest.restoreAllMocks();for(const app of clients){await terminate(getFirestore(app));await deleteApp(app);}
 for(const uid of uids){await adminAuth().deleteUser(uid).catch(()=>{});await db.recursiveDelete(db.doc(`patientConsents/${uid}`));await db.doc(`users/${uid}`).delete();await db.doc(`accountDeletionJobs/${uid}`).delete();await db.doc(`patientHealthProfiles/${uid}`).delete();}
 await db.terminate();
});
test('Google login cannot create a patient without role and consent',async()=>{
 const email=`google-${randomUUID()}@example.test`,sub=randomUUID();
 await expect(exchange(sub,email,false)).rejects.toMatchObject({details:{reason:'google_registration_required'}});
 const result=await exchange(sub,email),c=client();await signInWithCustomToken(c.auth,result.customToken);expect(c.auth.currentUser!.uid).toBe(result.uid);
 expect(c.auth.currentUser!.providerData.some(p=>p.providerId==='google.com')).toBe(true);
 await reauthenticateWithCredential(c.auth.currentUser!,GoogleAuthProvider.credential(googleToken(sub,email)));
 expect((await c.auth.currentUser!.getIdTokenResult(true)).claims.firebase?.sign_in_provider).toBe('google.com');
 await expect(completeRegistration.run({auth:{uid:result.uid},data:{role:'patient',fullName:'Synthetic'}} as any)).rejects.toBeDefined();
 expect((await db.doc(`users/${result.uid}`).get()).exists).toBe(false);
 await expect(setDoc(doc(c.firestore,'users',result.uid),{uid:result.uid,role:'administrator'})).rejects.toMatchObject({code:'permission-denied'});
 await completeRegistration.run({auth:{uid:result.uid},data:{role:'patient',fullName:'Synthetic',consent:consent()}} as any);
 expect((await db.doc(`patientConsents/${result.uid}`).get()).data()).toMatchObject({privacyAcknowledged:true,sharingDecision:'declined',documentVersion:DOCUMENT_VERSION});
 expect((await exchange(sub,email,false)).uid).toBe(result.uid);
});
test('Google doctor remains pending and cannot gain clinical access',async()=>{
 const result=await exchange(randomUUID(),`doctor-${randomUUID()}@example.test`);
 await completeRegistration.run({auth:{uid:result.uid},data:{role:'doctor',fullName:'Synthetic Google doctor'}} as any);
 expect((await db.doc(`users/${result.uid}`).get()).data()).toMatchObject({role:'doctor',verificationStatus:'pending'});
 await expect(authorization.requireApprovedDoctor({uid:result.uid})).rejects.toMatchObject({code:'permission-denied'});
});
test('email collision cannot replace password credentials; explicit linking preserves UID and records',async()=>{
 const c=client(),email=`password-${randomUUID()}@example.test`,password=randomUUID(),sub=randomUUID();
 const original=(await createUserWithEmailAndPassword(c.auth,email,password)).user;uids.add(original.uid);
 await db.doc(`patientHealthProfiles/${original.uid}`).create({uid:original.uid,allergies:['Synthetic protected record']});
 await expect(exchange(sub,email)).rejects.toMatchObject({details:{reason:'google_link_required'}});
 expect((await signInWithEmailAndPassword(c.auth,email,password)).user.uid).toBe(original.uid);
 await linkWithCredential(c.auth.currentUser!,GoogleAuthProvider.credential(googleToken(sub,email)));
 const result=await exchange(sub,email,false);expect(result.uid).toBe(original.uid);
 expect((await signInWithEmailAndPassword(c.auth,email,password)).user.uid).toBe(original.uid);
 expect((await db.doc(`patientHealthProfiles/${original.uid}`).get()).data()?.allergies).toEqual(['Synthetic protected record']);
});
test('concurrent Google registration converges on one provider-bound Firebase UID',async()=>{
 const sub=randomUUID(),email=`race-${randomUUID()}@example.test`;
 const result=await Promise.all([exchange(sub,email),exchange(sub,email)]);expect(result[0].uid).toBe(result[1].uid);
 expect((await adminAuth().getUserByProviderUid('google.com',sub)).uid).toBe(result[0].uid);
});
test('disabled/deleting Google identities cannot obtain a new session',async()=>{
 const sub=randomUUID(),email=`disabled-${randomUUID()}@example.test`,result=await exchange(sub,email);
 await adminAuth().updateUser(result.uid,{disabled:true});await expect(exchange(sub,email,false)).rejects.toMatchObject({code:'permission-denied'});
 await adminAuth().updateUser(result.uid,{disabled:false});await db.doc(`accountDeletionJobs/${result.uid}`).create({uid:result.uid,state:'requested'});
 await expect(exchange(sub,email,false)).rejects.toMatchObject({code:'permission-denied'});
});
test('registration after Auth deletion creates a fresh UID and never resurrects retained records',async()=>{
 const sub=randomUUID(),email=`deleted-${randomUUID()}@example.test`,old=await exchange(sub,email);
 await db.doc(`users/${old.uid}`).create({uid:old.uid,status:'disabled',fullName:'Deleted synthetic patient'});
 await db.doc(`patientHealthProfiles/${old.uid}`).create({uid:old.uid,allergies:['Retained synthetic record']});await adminAuth().deleteUser(old.uid);
 const fresh=await exchange(sub,email,true);expect(fresh.uid).not.toBe(old.uid);expect((await db.doc(`users/${fresh.uid}`).get()).exists).toBe(false);
 expect((await db.doc(`users/${old.uid}`).get()).data()?.status).toBe('disabled');
 await expect(authorization.requireActive({uid:fresh.uid})).rejects.toMatchObject({code:'permission-denied'});
});
