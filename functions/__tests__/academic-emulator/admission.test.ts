import {readFileSync} from 'fs';
import {resolve} from 'path';
import {initializeTestEnvironment,assertFails,assertSucceeds,RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {getDoc,getDocFromServer,getDocs,collection,query,orderBy,documentId,limit,setDoc,doc,Timestamp as ClientTimestamp} from 'firebase/firestore';
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
const member=()=>({uid,email,enabled:true,expectedRole:'patient',noticeVersion:ACADEMIC_NOTICE_VERSION,expiresAt:Timestamp.fromMillis(Date.now()+3600000)});
const auth=()=>({uid,token:{email,email_verified:true,auth_time:Math.ceil(Date.now()/1000)}});
const client=(verified=true,customEmail=email)=>rules.authenticatedContext(uid,{email:customEmail,email_verified:verified}).firestore();
async function seedPublicDoctor(){
 const doctor='synthetic-approved-doctor',requestId='11111111-1111-4111-8111-111111111111',at=Timestamp.now();
 const professional={professionalName:'Dr Demo Doctor',specialty:'General Practitioner',registrationNumber:'TEST-ONLY',issuingAuthority:'Synthetic Authority'};
 const credentialId='22222222-2222-4222-8222-222222222222',reference={credentialId,category:'medical_license',generation:'123',checksum:'a'.repeat(64)};
 await db.doc('users/'+doctor).set({...identity,uid:doctor,email:'doctor@example.test',role:'doctor',verificationStatus:'approved'});
 await db.doc('doctorProfiles/'+doctor).set({...professional,uid:doctor,revision:1,activeRequestId:null,approvedRequestId:requestId,schemaVersion:1,createdAt:at,updatedAt:at});
 await db.doc('doctorCredentials/'+credentialId).set({...reference,doctorUid:doctor,storagePath:`doctorCredentials/${doctor}/${credentialId}/document`,contentType:'image/png',sizeBytes:34142,state:'attached',requestId,schemaVersion:1,createdAt:at,updatedAt:at,expiresAt:Timestamp.fromMillis(at.toMillis()+900000)});
 await db.doc('verificationRequests/'+requestId).set({requestId,doctorUid:doctor,state:'approved',profileRevision:1,professional,credentials:[reference],previousRequestId:null,reviewedAt:at,reviewerUid:'synthetic-reviewer',schemaVersion:1,createdAt:at,submittedAt:at,updatedAt:at});
 await db.doc('doctorPublicProfiles/'+doctor).set({uid:doctor,professionalName:'Dr Demo Doctor',specialty:'General Practitioner',approvedRevision:1,approvedRequestId:requestId,schemaVersion:1,publishedAt:at,updatedAt:at});
 return doctor;
}
test('admitted patient reads approved public doctor before available-times discovery',async()=>{
 const doctor=await seedPublicDoctor();
 await assertSucceeds(getDoc(doc(client(),'doctorPublicProfiles/'+doctor)));
});
test.each(['patient','doctor','administrator'])('public doctor profile preserves %s domain access boundaries',async role=>{
 const doctor=await seedPublicDoctor();
 await db.doc('users/'+uid).set({...identity,role,...(role==='doctor'?{verificationStatus:'approved'}:{})});
 await db.doc('academicDemoTesters/'+uid).update({expectedRole:role});
 await db.doc('academicDemoInvitations/'+email).update({expectedRole:role});
 const c=client();
 const result=await assertSucceeds(getDoc(doc(c,'doctorPublicProfiles/'+doctor)));
 expect(Object.keys(result.data()!).sort()).toEqual(['uid','professionalName','specialty','approvedRevision','approvedRequestId','schemaVersion','publishedAt','updatedAt'].sort());
 await assertFails(getDocs(collection(c,'doctorPublicProfiles')));
 await assertFails(getDoc(doc(c,'doctorProfiles/'+doctor)));
 await assertFails(getDoc(doc(c,'academicDemoInvitations/'+email)));
 await assertFails(getDoc(doc(c,'academicDemoTesters/'+uid)));
 for(const p of ['verificationRequests/11111111-1111-4111-8111-111111111111','doctorCredentials/22222222-2222-4222-8222-222222222222']){
  if(role==='administrator')await assertSucceeds(getDoc(doc(c,p)));
  else await assertFails(getDoc(doc(c,p)));
 }
});
test.each(['anonymous','unverified','membership-revoked','membership-expired','patient-disabled','patient-malformed',
 'doctor-pending','doctor-disabled','doctor-malformed','approval-binding','publication-binding','direct-write'])('public doctor read safeguards deny %s',async condition=>{
 const doctor=await seedPublicDoctor(),target=db.doc('users/'+doctor),publication=db.doc('doctorPublicProfiles/'+doctor);
 if(condition==='membership-revoked')await db.doc('academicDemoTesters/'+uid).update({enabled:false});
 if(condition==='membership-expired')await db.doc('academicDemoTesters/'+uid).update({expiresAt:Timestamp.fromMillis(1)});
 if(condition==='patient-disabled')await db.doc('users/'+uid).update({status:'disabled'});
 if(condition==='patient-malformed')await db.doc('users/'+uid).update({updatedAt:'2026-02-30T00:00:00.000Z'});
 if(condition==='doctor-pending')await target.update({verificationStatus:'pending'});
 if(condition==='doctor-disabled')await target.update({status:'disabled'});
 if(condition==='doctor-malformed')await target.update({updatedAt:'2026-02-30T00:00:00.000Z'});
 if(condition==='approval-binding')await db.doc('verificationRequests/11111111-1111-4111-8111-111111111111').update({doctorUid:'another-doctor'});
 if(condition==='publication-binding')await publication.update({specialty:'Different specialty'});
 const c=condition==='anonymous'?rules.unauthenticatedContext().firestore():condition==='unverified'?client(false):client();
 if(condition==='direct-write')await assertFails(setDoc(doc(c,'doctorPublicProfiles/'+doctor),{uid:doctor}));
 else await assertFails(getDoc(doc(c,'doctorPublicProfiles/'+doctor)));
});
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
 const patientEmail=m.data['users/patient'].email.toLowerCase(),invitation={uid:'patient',email:patientEmail,enabled:true,expectedRole:'patient',noticeVersion:ACADEMIC_NOTICE_VERSION,expiresAt:Timestamp.fromMillis(Date.now()+3600000)};
 await db.doc('academicDemoTesters/patient').set(invitation);await db.doc('academicDemoInvitations/'+patientEmail).set(invitation);
 const c=rules.authenticatedContext('patient',{email:patientEmail,email_verified:true}).firestore();
 for(const p of [callPaths.call(consultationId,callId),callPaths.offer(consultationId,callId),callPaths.answer(consultationId,callId)])await assertSucceeds(getDoc(doc(c,p)));
 await db.doc('academicDemoTesters/patient').update({enabled:false});await assertFails(getDoc(doc(c,callPaths.offer(consultationId,callId))));
});

test.each(['patient','doctor'])('hosted message history permits %s pages under the admission expression budget',async role=>{
 const m=memory(),batch=db.batch();for(const [p,value]of Object.entries(m.data))batch.set(db.doc(p),value as any);await batch.commit();
 const email=m.data['users/'+role].email.toLowerCase(),membership={uid:role,email,enabled:true,expectedRole:role,noticeVersion:ACADEMIC_NOTICE_VERSION,expiresAt:Timestamp.fromMillis(Date.now()+3600000)};
 await db.doc('academicDemoTesters/'+role).set(membership);await db.doc('academicDemoInvitations/'+email).set(membership);
 for(let index=0;index<50;index++){const id=index.toString(16).padStart(64,'0');await db.doc(`consultations/${consultationId}/messages/${id}`).set({messageId:id,senderId:index%2?'doctor':'patient',type:'text',text:'Synthetic text only',createdAt:m.data['consultations/'+consultationId].createdAt,schemaVersion:1});}
 const c=rules.authenticatedContext(role,{email,email_verified:true}).firestore();
 for(const size of [30,50])expect((await assertSucceeds(getDocs(query(collection(c,`consultations/${consultationId}/messages`),orderBy('createdAt','desc'),orderBy(documentId(),'desc'),limit(size))))).size).toBe(size);
   const appointment=m.data['appointments/'+consultationId],room=m.data['consultations/'+consultationId];
   await db.doc('appointments/'+consultationId).update({status:'completed',updatedAt:appointment.endAt,outcome:{recordedBy:'doctor',recordedAt:appointment.endAt}});
   await db.doc('consultations/'+consultationId).update({state:'closed',closedAt:appointment.endAt});
   await assertSucceeds(getDoc(doc(c,'appointments/'+consultationId))).catch(error=>{throw new Error('Completed appointment: '+error.message);});
   await assertSucceeds(getDoc(doc(c,'consultations/'+consultationId))).catch(error=>{throw new Error('Completed room: '+error.message);});
   await assertSucceeds(getDocs(query(collection(c,`consultations/${consultationId}/messages`),orderBy('createdAt','desc'),orderBy(documentId(),'desc'),limit(30)))).catch(error=>{throw new Error('Completed ordered history: '+error.message);});
   await db.doc('consultations/'+consultationId).update({patientId:'unrelated'});
   await assertFails(getDocs(query(collection(c,`consultations/${consultationId}/messages`),limit(30))));
   await db.doc('consultations/'+consultationId).set(room);
   await db.doc('appointments/'+consultationId).set({...appointment,doctorDisplay:{specialty:'General Practitioner'}});
   await assertFails(getDocs(query(collection(c,`consultations/${consultationId}/messages`),limit(30))));
   await db.doc('appointments/'+consultationId).set(appointment);
   const canonical=m.data['users/'+role];
   for(const malformed of [
    {...canonical,fullName:' '}, {...canonical,fullName:'x'.repeat(201)},
    {...canonical,email:'  '}, {...canonical,email:'\t \uFEFF'},
    {...canonical,createdAt:'2026-02-30T00:00:00.000Z'},
    {...canonical,updatedAt:'2026-11-17T25:00:00.000Z'},
    {...canonical,status:'disabled'}, {...canonical,schemaVersion:2},
    {...canonical,extraPrivateField:true},
    Object.fromEntries(Object.entries(canonical).filter(([key])=>key!=='fullName')),
   ]){
    await db.doc('users/'+role).set(malformed);
    await assertFails(getDocs(query(collection(c,`consultations/${consultationId}/messages`),limit(30))));
   }
   await db.doc('users/'+role).set(canonical);
   if(role==='doctor')for(const collectionName of ['patientProfiles','patientHealthProfiles','patientConsents'])await assertFails(getDoc(doc(c,`${collectionName}/patient`)));
 const outsider=rules.authenticatedContext(uid,{email:'academic@example.test',email_verified:true}).firestore();
 await assertFails(getDocs(query(collection(outsider,`consultations/${consultationId}/messages`),limit(30))));
 await db.doc('academicDemoTesters/'+role).update({enabled:false});
 await assertFails(getDocs(query(collection(c,`consultations/${consultationId}/messages`),limit(30))));
});
test.each(['patient','doctor'])('hosted direct message read - %s active',async role=>{
 const m=memory(),room=m.data['consultations/'+consultationId];
 const batch=db.batch();for(const [p,value]of Object.entries(m.data))batch.set(db.doc(p),value as any);await batch.commit();
 const email=m.data['users/'+role].email.toLowerCase(),membership={uid:role,email,enabled:true,expectedRole:role,noticeVersion:ACADEMIC_NOTICE_VERSION,expiresAt:Timestamp.fromMillis(Date.now()+3600000)};
 await db.doc('academicDemoTesters/'+role).set(membership);await db.doc('academicDemoInvitations/'+email).set(membership);
 const c=rules.authenticatedContext(role,{email,email_verified:true}).firestore(),textId='b'.repeat(64),attachmentId='c'.repeat(64);
 const text={messageId:textId,senderId:'patient',type:'text',text:'Synthetic text only',createdAt:room.createdAt,schemaVersion:1};
 const attachment={messageId:attachmentId,senderId:'doctor',type:'attachment',createdAt:room.createdAt,schemaVersion:1,attachment:{attachmentId,messageId:attachmentId,consultationId,senderId:'doctor',filename:'Synthetic.pdf',contentType:'application/pdf',sizeBytes:32,storagePath:`consultations/${consultationId}/attachments/${attachmentId}/document`,status:'finalized'}};
 const path=(id:string)=>`consultations/${consultationId}/messages/${id}`;
 await db.doc(path(textId)).set(text);await db.doc(path(attachmentId)).set(attachment);
 for(const id of [textId,attachmentId])await assertSucceeds(getDocFromServer(doc(c,path(id))));
 const outsider=client(),guest=rules.unauthenticatedContext().firestore(),unverified=rules.authenticatedContext(role,{email,email_verified:false}).firestore();
 for(const denied of [outsider,guest,unverified])await assertFails(getDocFromServer(doc(denied,path(textId))));
 const administrator={...member(),expectedRole:'administrator'};
 await db.doc('users/'+uid).set({...identity,role:'administrator'});
 await db.doc('academicDemoTesters/'+uid).set(administrator);await db.doc('academicDemoInvitations/'+administrator.email).set(administrator);
 const admin=rules.authenticatedContext(uid,{email:administrator.email,email_verified:true,administrator:true}).firestore();
 await assertFails(getDocFromServer(doc(admin,path(textId))));
 await db.doc(path(textId)).set({...text,senderId:'outsider'});await assertFails(getDocFromServer(doc(c,path(textId))));await db.doc(path(textId)).set(text);
 await db.doc(path(attachmentId)).set({...attachment,attachment:{...attachment.attachment,consultationId:'f'.repeat(64)}});await assertFails(getDocFromServer(doc(c,path(attachmentId))));
 await db.doc('academicDemoTesters/'+role).update({expiresAt:Timestamp.fromMillis(0)});
 const expired=rules.authenticatedContext(role,{email,email_verified:true}).firestore();
 await assertFails(getDocFromServer(doc(c,path(textId))));
 await assertFails(getDocFromServer(doc(expired,path(textId))));
 await db.doc('academicDemoTesters/'+role).update({enabled:false,expiresAt:membership.expiresAt});
 await assertFails(getDocFromServer(doc(c,path(textId))));
});
test.todo('hosted completed direct single-message get fits the admission expression budget (current UI uses bounded list reads)');

test('an enrolled patient cannot change the invitation to a doctor role',async()=>{await db.doc('academicDemoInvitations/'+email).update({expectedRole:'doctor'});await expect(requireAcademicAdmission(auth(),true,hosted)).rejects.toThrow();await assertFails(getDoc(doc(client(),'users/'+uid)));});

test.each(['doctorProfiles','doctorCredentials','verificationRequests'])('hosted submitted doctor retains owner reads - %s',async collection=>{
 const now=Timestamp.now(),created=Timestamp.fromMillis(now.toMillis()-60000),requestId='11111111-1111-4111-8111-111111111111',credentialId='22222222-2222-4222-8222-222222222222';
 const professional={professionalName:'Dr Demo Doctor',specialty:'General Practitioner',registrationNumber:'TEST-ACADEMIC-0001',issuingAuthority:'Fictional Academic Test Authority'};
 await db.doc('users/'+uid).set({...identity,role:'doctor',verificationStatus:'pending',updatedAt:now.toDate().toISOString()});
 for(const path of ['academicDemoTesters/'+uid,'academicDemoInvitations/'+email])await db.doc(path).update({expectedRole:'doctor'});
 const profile={uid,...professional,revision:1,activeRequestId:null,approvedRequestId:null,schemaVersion:1,createdAt:created,updatedAt:created};
 await db.doc('doctorProfiles/'+uid).set(profile);
 await assertSucceeds(getDoc(doc(client(),'doctorProfiles/'+uid)));
 await db.doc('doctorProfiles/'+uid).update({activeRequestId:requestId,updatedAt:now});
 const reference={credentialId,category:'medical_license',generation:'123',checksum:'a'.repeat(64)};
 await db.doc('doctorCredentials/'+credentialId).set({...reference,doctorUid:uid,storagePath:`doctorCredentials/${uid}/${credentialId}/document`,contentType:'image/png',sizeBytes:34142,state:'attached',requestId,schemaVersion:1,createdAt:created,updatedAt:now,expiresAt:Timestamp.fromMillis(created.toMillis()+900000)});
 await db.doc('verificationRequests/'+requestId).set({requestId,doctorUid:uid,profileRevision:1,professional,credentials:[reference],previousRequestId:null,state:'submitted',reviewedAt:null,reviewerUid:null,schemaVersion:1,createdAt:now,updatedAt:now,submittedAt:now});
 await assertSucceeds(getDoc(doc(client(),'users/'+uid)));
 const id=collection==='doctorProfiles'?uid:collection==='doctorCredentials'?credentialId:requestId;
 await assertSucceeds(getDoc(doc(client(),collection+'/'+id)));
 const other=rules.authenticatedContext('unrelated-doctor',{email:'other@example.test',email_verified:true}).firestore();
 await assertFails(getDoc(doc(other,collection+'/'+id)));
});
