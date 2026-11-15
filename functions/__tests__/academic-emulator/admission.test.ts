import {readFileSync} from 'fs';
import {resolve} from 'path';
import {initializeTestEnvironment,assertFails,assertSucceeds,RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {getDoc,setDoc,doc,Timestamp as ClientTimestamp} from 'firebase/firestore';
import {uploadBytes as storageUpload,ref,getBytes} from 'firebase/storage';
import {Timestamp} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {db} from '../../src/shared/firestoreRefs';
import {admitVerifiedUser,requireAcademicAdmission,requireGoogleInvitation} from '../../src/shared/academicAdmission';
import {checkAcademicAuth} from '../../src/auth/academicBlocking';
import {guardedCall} from '../../src/shared/academicHttps';
import {ACADEMIC_NOTICE_VERSION} from '../../src/shared/academicNotice';
import * as admission from '../../src/shared/academicAdmission';
import {uploadAcademicDemoObject,readAcademicDemoCredential} from '../../src/profiles/academicUploads';
import {prepareDoctorCredential,finalizeDoctorCredential} from '../../src/profiles/credentialCallables';
import {storage} from '../../src/shared/firestoreRefs';
import {manageAcademicDemoTester} from '../../src/auth/academicAdministration';
import {memory,request as callRequest,id as consultationId,secondRequestId,callPaths} from '../consultationCallFixtures';

const project='demo-calladoc-academic-tests',hosted={GCLOUD_PROJECT:'calladoc-qa-academic-demo'},uid='academic-user',email='academic@example.test';
let rules:RulesTestEnvironment;
const identity={uid,email,fullName:'Synthetic Tester',role:'patient',status:'active',schemaVersion:1,createdAt:'2026-11-15T00:00:00.000Z',updatedAt:'2026-11-15T00:00:00.000Z'};
const member=()=>({uid,email,enabled:true,noticeVersion:ACADEMIC_NOTICE_VERSION,expiresAt:Timestamp.fromMillis(Date.now()+3600000)});
const auth=()=>({uid,token:{email,email_verified:true,auth_time:Math.ceil(Date.now()/1000)}});
const client=(verified=true,customEmail=email)=>rules.authenticatedContext(uid,{email:customEmail,email_verified:verified}).firestore();
async function seed(){await db.doc('users/'+uid).set(identity);await db.doc('academicDemoTesters/'+uid).set(member());await db.doc('academicDemoInvitations/'+email).set(member());}
beforeAll(async()=>{
 if(process.env.GCLOUD_PROJECT!==project||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8111'
  ||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9111'||process.env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9211')throw Error('Isolated academic emulator endpoints required.');
 rules=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8111,rules:readFileSync(resolve(__dirname,'../../.academic-test/firestore.rules'),'utf8')},storage:{host:'127.0.0.1',port:9211,rules:readFileSync(resolve(__dirname,'../../.academic-test/storage.rules'),'utf8')}});
 await getAuth().createUser({uid,email,emailVerified:true,password:'Synthetic-Only-12!'});
});
beforeEach(async()=>{await rules.clearFirestore();await seed();await getAuth().updateUser(uid,{disabled:false,emailVerified:true});await getAuth().setCustomUserClaims(uid,{});});
afterAll(async()=>{await rules?.cleanup();await db.terminate();});
test('admitted verified tester can read own identity under original domain rules',async()=>{
 await assertSucceeds(getDoc(doc(client(),'users/'+uid)));
 await assertFails(getDoc(doc(client(),'users/another-user')));
});
test.each(['membership-revoked','invitation-revoked','membership-expired','invitation-expired','membership-missing','invitation-missing','notice-missing'])('direct SDK and callable deny %s with an already-issued session',async condition=>{
 const existing=client(),target=condition.startsWith('invitation')?'academicDemoInvitations/'+email:'academicDemoTesters/'+uid;
 await assertSucceeds(getDoc(doc(existing,'users/'+uid)));
 if(condition.endsWith('missing')&&condition!=='notice-missing')await db.doc(target).delete();
  else await db.doc(target).update(condition==='notice-missing'?{noticeVersion:'old'}:condition.endsWith('expired')?{expiresAt:Timestamp.fromMillis(1)}:{enabled:false});
 await assertFails(getDoc(doc(existing,'users/'+uid)));
 const handler=jest.fn(()=>({ok:true}));
 await expect(guardedCall(handler,false,(a,e)=>requireAcademicAdmission(a,e,hosted))({auth:auth(),data:{}} as any)).rejects.toBeDefined();
 expect(handler).not.toHaveBeenCalled();
});
test('unverified email and changed email cannot use invited membership',async()=>{
 await assertFails(getDoc(doc(client(false),'users/'+uid)));
 await assertFails(getDoc(doc(client(true,'different@example.test'),'users/'+uid)));
 await getAuth().updateUser(uid,{emailVerified:false});await expect(requireAcademicAdmission(auth(),false,hosted)).rejects.toThrow();
});
test('disabled Auth user cannot invoke protected backend despite old token claims',async()=>{
 await getAuth().updateUser(uid,{disabled:true});await expect(requireAcademicAdmission(auth(),false,hosted)).rejects.toThrow();
});
test('revoked refresh-token epoch blocks a stale callable session',async()=>{
 await getAuth().revokeRefreshTokens(uid);const stale=auth();stale.token.auth_time=1;
 await expect(requireAcademicAdmission(stale,false,hosted)).rejects.toThrow();
});
test('successful enrollment binds an invitation once, without public role assignment',async()=>{
 await db.doc('academicDemoTesters/'+uid).delete();await db.doc('academicDemoInvitations/'+email).update({uid:null});
 await requireAcademicAdmission(auth(),true,hosted);
 expect((await db.doc('academicDemoTesters/'+uid).get()).data()).toMatchObject({uid,email,enabled:true});
 expect((await db.doc('users/'+uid).get()).data()).toEqual(identity);
 await expect(admitVerifiedUser('other',email,true,hosted)).rejects.toThrow();
});
test('registration enrollment cannot renew or re-enable an existing expired/revoked membership',async()=>{
 await db.doc('academicDemoTesters/'+uid).update({enabled:false});await expect(requireAcademicAdmission(auth(),true,hosted)).rejects.toThrow();
 expect((await db.doc('academicDemoTesters/'+uid).get()).data()?.enabled).toBe(false);
});
test('Google exchange and direct SDK Auth blocking reject unknown and expired invitations',async()=>{
 await expect(requireGoogleInvitation('outsider@example.test',hosted)).rejects.toThrow();
 await expect(checkAcademicAuth({uid:'outsider',email:'outsider@example.test'},hosted)).rejects.toThrow();
 await db.doc('academicDemoInvitations/'+email).update({expiresAt:Timestamp.fromMillis(1)});
 await expect(requireGoogleInvitation(email,hosted)).rejects.toThrow();await expect(checkAcademicAuth({uid,email},hosted)).rejects.toThrow();
});
test('clients cannot self-admit, administer invitations, or change identity roles',async()=>{
 const c=client();
 await assertFails(setDoc(doc(c,'academicDemoTesters/'+uid),{...member(),expiresAt:ClientTimestamp.fromMillis(Date.now()+99999999)}));
 await assertFails(setDoc(doc(c,'academicDemoInvitations/'+email),{enabled:true}));
 await assertFails(setDoc(doc(c,'users/'+uid),{...identity,role:'administrator'}));
 await assertFails(getDoc(doc(c,'academicDemoInvitations/'+email)));
});
test('hosted Storage denies direct SDK reads and uploads even with admitted admin claims',async()=>{
 const s=rules.authenticatedContext(uid,{email,email_verified:true,academicDemoAdmin:true}).storage();
 for(const p of [`doctorCredentials/${uid}/slot/document`,`avatars/${uid}/slot/image.jpg`,'consultationAttachments/room/slot/document']){
  await assertFails(storageUpload(ref(s,p),new Uint8Array([1]),{contentType:'application/pdf'}));
  await assertFails(getBytes(ref(s,p)));
 }
});
test('hosted proxy preserves credential preparation, finalization and administrator evidence access',async()=>{
 await db.doc('users/'+uid).set({...identity,role:'doctor',verificationStatus:'pending'});
 const bytes=Buffer.from('%PDF-1.4 synthetic academic evidence');
 const slot=await prepareDoctorCredential.run({auth:auth(),data:{category:'medical_license',contentType:'application/pdf',sizeBytes:bytes.length}} as any);
 const spy=jest.spyOn(admission,'academicEnvironment').mockReturnValue('hosted');
 try{
  await uploadAcademicDemoObject.run({auth:auth(),data:{kind:'credential',id:slot.credentialId,base64:bytes.toString('base64')}} as any);
  const [meta]=await storage.bucket().file(slot.storagePath).getMetadata();expect(meta.metadata?.firebaseStorageDownloadTokens).toBeUndefined();
  await expect(uploadAcademicDemoObject.run({auth:auth(),data:{kind:'credential',id:slot.credentialId,base64:bytes.toString('base64')}} as any)).rejects.toBeDefined();
  await finalizeDoctorCredential.run({auth:auth(),data:{credentialId:slot.credentialId}} as any);
  await expect(readAcademicDemoCredential.run({auth:auth(),data:{credentialId:slot.credentialId}} as any)).rejects.toThrow();
  await db.doc('doctorCredentials/'+slot.credentialId).update({state:'attached',requestId:'synthetic-request'});
  await db.doc('users/'+uid).set({...identity,role:'administrator'});
  const result=await readAcademicDemoCredential.run({auth:auth(),data:{credentialId:slot.credentialId}} as any);
  expect(Buffer.from(result.base64,'base64').equals(bytes)).toBe(true);
 }finally{spy.mockRestore();}
});
test('hosted proxy rejects another owner and expired slots without creating objects',async()=>{
 await db.doc('users/'+uid).set({...identity,role:'doctor',verificationStatus:'pending'});
 const bytes=Buffer.from('synthetic'),slot=await prepareDoctorCredential.run({auth:auth(),data:{category:'medical_license',contentType:'application/pdf',sizeBytes:bytes.length}} as any);
 const spy=jest.spyOn(admission,'academicEnvironment').mockReturnValue('hosted');
 try{
  await db.doc('doctorCredentials/'+slot.credentialId).update({expiresAt:Timestamp.fromMillis(1)});
  await expect(uploadAcademicDemoObject.run({auth:auth(),data:{kind:'credential',id:slot.credentialId,base64:bytes.toString('base64')}} as any)).rejects.toBeDefined();
  expect((await storage.bucket().file(slot.storagePath).exists())[0]).toBe(false);
 }finally{spy.mockRestore();}
});
test('stale administrator claim cannot invite testers after current Auth privilege is removed',async()=>{
 await db.doc('users/'+uid).set({...identity,role:'administrator'});
 const spy=jest.spyOn(admission,'academicEnvironment').mockReturnValue('hosted');
 try{await expect(manageAcademicDemoTester.run({auth:{...auth(),token:{...auth().token,academicDemoAdmin:true}},data:{email:'new@example.test',enabled:true,expiresAt:new Date(Date.now()+3600000).toISOString()}} as any)).rejects.toThrow();
 expect((await db.doc('academicDemoInvitations/new@example.test').get()).exists).toBe(false);
 }finally{spy.mockRestore();}
});
test('privileged administrator revokes invitation and membership together and records an audit',async()=>{
 await db.doc('users/'+uid).set({...identity,role:'administrator'});
  await getAuth().setCustomUserClaims(uid,{academicDemoAdmin:true});
 const spy=jest.spyOn(admission,'academicEnvironment').mockReturnValue('hosted');
 try{await manageAcademicDemoTester.run({auth:{...auth(),token:{...auth().token,academicDemoAdmin:true}},data:{email,enabled:false,expiresAt:new Date(Date.now()+3600000).toISOString()}} as any);
 expect((await db.doc('academicDemoInvitations/'+email).get()).data()?.enabled).toBe(false);
 expect((await db.doc('academicDemoTesters/'+uid).get()).data()?.enabled).toBe(false);
 expect((await db.collection('academicDemoAdmissionAudit').get()).size).toBe(1);
 await assertFails(getDoc(doc(client(),'users/'+uid)));
 }finally{spy.mockRestore();}
});
test('hosted admission preserves nested consultation signalling access within Rules lookup limits',async()=>{
 const m=memory(),callId=(await m.handler(callRequest())).call.callId;
 await m.lifecycle.respond(callRequest('doctor',{consultationId,callId,requestId:secondRequestId,action:'accept',answer:{type:'answer',sdp:'v=0\r\ns=synthetic-answer\r\n'}}));
 const batch=db.batch();for(const [p,value]of Object.entries(m.data))batch.set(db.doc(p),value as any);await batch.commit();
 const patientEmail=m.data['users/patient'].email.toLowerCase(),invitation={uid:'patient',email:patientEmail,enabled:true,noticeVersion:ACADEMIC_NOTICE_VERSION,expiresAt:Timestamp.fromMillis(Date.now()+3600000)};
 await db.doc('academicDemoTesters/patient').set(invitation);await db.doc('academicDemoInvitations/'+patientEmail).set(invitation);
 const c=rules.authenticatedContext('patient',{email:patientEmail,email_verified:true}).firestore();
 for(const p of [callPaths.call(consultationId,callId),callPaths.offer(consultationId,callId),callPaths.answer(consultationId,callId)])await assertSucceeds(getDoc(doc(c,p)));
 await db.doc('academicDemoTesters/patient').update({enabled:false});await assertFails(getDoc(doc(c,callPaths.offer(consultationId,callId))));
});
