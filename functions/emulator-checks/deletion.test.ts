import './featureEnvironment';
import {randomUUID,createHash} from 'crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,setDoc,terminate} from 'firebase/firestore';
import {getStorage,connectStorageEmulator,ref,getBytes,uploadBytes} from 'firebase/storage';
import {initializeApp as initializeAdmin,deleteApp as deleteAdmin} from 'firebase-admin/app';
import {getFirestore as adminFirestore,Timestamp} from 'firebase-admin/firestore';
import {getAuth as adminAuth} from 'firebase-admin/auth';
import {getStorage as adminStorage} from 'firebase-admin/storage';
import {availabilityId} from '../src/scheduling/ids';
for(const [key,value] of Object.entries({CHECKPOINT15_EMULATOR:'demo-calladoc-features-tests',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9108',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8108',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9208'}))if(process.env[key]!==value)throw Error('Explicit local emulator safety configuration required: '+key);
const projectId='demo-calladoc-features-tests',trusted=initializeAdmin({projectId,storageBucket:projectId+'.appspot.com'}),db=adminFirestore(trusted),bucket=adminStorage(trusted).bucket(),authAdmin=adminAuth(trusted);
const clients:any[]=[];
const sha=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const consent=()=>({requestId:randomUUID().replace(/-/g,'').slice(0,20),expectedRevision:0,documentVersion:'development-2026-11-03-v1',privacyAcknowledged:true,sharingDecision:'declined',source:'registration'});
async function account(role:'patient'|'doctor'|null='patient',email='cp15-'+randomUUID()+'@example.test'){
 const app=initializeApp({projectId,apiKey:'demo-key',storageBucket:projectId+'.appspot.com'},randomUUID()),auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9108',{disableWarnings:true});
 const firestore=getFirestore(app);connectFirestoreEmulator(firestore,'127.0.0.1',8108);const storage=getStorage(app);connectStorageEmulator(storage,'127.0.0.1',9208);
 const c={app,auth,firestore,storage,uid:'',email};clients.push(c);c.uid=(await createUserWithEmailAndPassword(auth,email,randomUUID())).user.uid;
 if(role)await call(c,'completeRegistration',{role,fullName:'Synthetic deletion '+role,...(role==='patient'?{consent:consent()}:{})});return c;
}
async function call(c:any,name:string,data:unknown){const response=await fetch(`http://127.0.0.1:5108/${projectId}/us-central1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',...(c?{Authorization:'Bearer '+await c.auth.currentUser.getIdToken()}: {})},body:JSON.stringify({data})});const body:any=await response.json();if(body.error)throw Object.assign(Error(body.error.message),{code:body.error.status});return body.result;}
const intent=()=>({requestId:randomUUID(),confirmation:'delete-account'});
const read=async(path:string)=>(await db.doc(path).get()).data();
const job=(c:any)=>read(`accountDeletionJobs/${c.uid}`);
async function worker(c:any){const {processAccountDeletion}=await import('../src/accounts/deletionWorker');return processAccountDeletion(c.uid);}
async function appointment(patient:any,doctor:any,start=Date.now()-86400000){
 start=Math.floor(start/1800000)*1800000;const id=sha(randomUUID()),created=Timestamp.fromMillis(start-3600000),end=start+1800000;
 const data={appointmentId:id,patientId:patient.uid,doctorId:doctor.uid,availabilityId:availabilityId(doctor.uid,new Date(start).toISOString().slice(0,10)),availabilityRevision:1,startAt:Timestamp.fromMillis(start),endAt:Timestamp.fromMillis(end),doctorDisplay:{professionalName:'Synthetic deletion doctor',specialty:'Medicine'},status:'scheduled',cancellation:null,outcome:null,schemaVersion:1,createdAt:created,updatedAt:created};
 await db.doc(`appointments/${id}`).create(data);return {id,start,end,data};
}
afterAll(async()=>{for(const c of clients){await terminate(c.firestore);await deleteApp(c.app);}await db.terminate();await deleteAdmin(trusted);});

test('caller scoping, explicit confirmation and administrator exclusion',async()=>{
 const a=await account(),other=await account(),admin=await account(null),now=new Date().toISOString();
 await db.doc(`users/${admin.uid}`).create({uid:admin.uid,email:admin.email,fullName:'Synthetic deletion administrator',role:'administrator',status:'active',schemaVersion:1,createdAt:now,updatedAt:now});
 await expect(call(null,'requestOwnAccountDeletion',intent())).rejects.toMatchObject({code:'UNAUTHENTICATED'});
 for(const data of [{...intent(),uid:other.uid},{...intent(),confirmation:'yes'}])await expect(call(a,'requestOwnAccountDeletion',data)).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
 await expect(call(admin,'requestOwnAccountDeletion',intent())).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 await expect(call(a,'getOwnAccountDeletion',{uid:other.uid})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
 expect((await call(other,'getOwnAccountDeletion',{})).job).toBeNull();expect(await job(a)).toBeUndefined();
});

test.each(['patient','doctor'] as const)('%s future/active care blocks deletion without partial state',async role=>{
 const patient=await account(),doctor=await account('doctor'),actor=role==='patient'?patient:doctor;
 for(const start of [Date.now()+86400000,Date.now()]){
  const a=await appointment(patient,doctor,start);
  await expect(call(actor,'requestOwnAccountDeletion',intent())).rejects.toMatchObject({code:'FAILED_PRECONDITION'});
  expect(await job(actor)).toBeUndefined();expect((await read(`users/${actor.uid}`))?.status).toBe('active');
  // Remove only this dedicated synthetic commitment, never existing emulator records.
  await db.doc(`appointments/${a.id}`).delete();
 }
});

test('callable enforces auth_time even with a fresh request and valid active canonical account',async()=>{
 const c=await account(),{requestOwnAccountDeletion}=await import('../src/accounts/deletionCallables');
 await expect(requestOwnAccountDeletion.run({auth:{uid:c.uid,token:{auth_time:Math.floor(Date.now()/1000)-601}},data:intent()} as any)).rejects.toMatchObject({code:'failed-precondition'});
 expect(await job(c)).toBeUndefined();expect((await read(`users/${c.uid}`))?.status).toBe('active');
});

test('live upload expiry delays cleanup; finalized attachments survive while unfinished files are removed',async()=>{
 const c=await account(),avatarState=db.doc(`users/${c.uid}/avatar/state`),id=sha(randomUUID()),cid=sha(randomUUID()),path=`consultationAttachments/${cid}/${id}/document`;
 await avatarState.set({pending:'synthetic-live-intent',expiresAt:Date.now()+60000});
 await db.doc(`consultationAttachments/${id}`).create({attachmentId:id,consultationId:cid,senderId:c.uid,state:'finalized',storagePath:path});
 await bucket.file(path).save(Buffer.from('Synthetic shared document'),{resumable:false});
 await call(c,'requestOwnAccountDeletion',intent());await worker(c);
 expect(await job(c)).toMatchObject({state:'requested',phase:'avatars',errorCode:'waiting_for_upload_expiry'});expect((await authAdmin.getUser(c.uid)).disabled).toBe(true);
 await avatarState.update({expiresAt:Date.now()-1000});await worker(c);
 expect(await job(c)).toMatchObject({state:'completed'});expect((await read(`consultationAttachments/${id}`))?.state).toBe('finalized');expect((await bucket.file(path).exists())[0]).toBe(true);
});

test('patient concurrent requests disable access atomically; cleanup preserves shared clinical and consent records',async()=>{
 const patient=await account(),doctor=await account('doctor'),a=await appointment(patient,doctor),uid=patient.uid;
 Object.assign(a.data,{status:'completed',outcome:{recordedBy:doctor.uid,recordedAt:Timestamp.fromMillis(a.end)},updatedAt:Timestamp.fromMillis(a.end)});
 const room={consultationId:a.id,appointmentId:a.id,patientId:uid,doctorId:doctor.uid,appointmentStartAt:a.data.startAt,appointmentEndAt:a.data.endAt,state:'closed',createdAt:Timestamp.fromMillis(a.start),closedAt:Timestamp.fromMillis(a.end),schemaVersion:1};
 const message={messageId:'synthetic-message',senderId:uid,type:'text',text:'Synthetic clinical history',createdAt:Timestamp.fromMillis(a.start+1000),schemaVersion:1};
 const prescription={prescriptionId:a.id,consultationId:a.id,appointmentId:a.id,doctorId:doctor.uid,patientId:uid,medications:[{name:'Synthetic medicine',dosage:'Test only',frequency:'Test only',duration:'Test only',instructions:'Synthetic only'}],issuedAt:Timestamp.fromMillis(a.end+1000),schemaVersion:1,requestId:randomUUID(),issuedBy:doctor.uid};
 const retained:{[path:string]:any}={['appointments/'+a.id]:a.data,['consultations/'+a.id]:room,[`consultations/${a.id}/messages/synthetic-message`]:message,['prescriptions/'+a.id]:prescription,[`patientHealthProfiles/${uid}`]:{uid,schemaVersion:1,createdAt:Timestamp.now(),updatedAt:Timestamp.now(),allergies:['Synthetic']},['ratings/'+a.id]:{patientId:uid,doctorId:doctor.uid,rating:5}};
 for(const [path,data] of Object.entries(retained))await db.doc(path).set(data);
 const consentBefore=await read(`patientConsents/${uid}`),auditBefore=await db.collection(`patientConsents/${uid}/history`).get();
 await db.doc(`patientProfiles/${uid}`).set({uid,displayName:'Synthetic personal',phoneNumber:'+254700000000'});
 await db.doc(`notificationDevices/${sha(uid)}`).set({uid,token:'synthetic-token'});await db.doc(`notificationInboxes/${uid}/items/synthetic`).set({title:'Synthetic'});
 const avatar=`avatars/${uid}/${randomUUID()}/image.jpg`;await bucket.file(avatar).save(Buffer.from('synthetic image'),{resumable:false});
 const results=await Promise.all([call(patient,'requestOwnAccountDeletion',intent()),call(patient,'requestOwnAccountDeletion',intent())]);
 expect(results[0].job.requestReference).toBe(results[1].job.requestReference);
 expect((await read(`users/${uid}`))).toMatchObject({status:'disabled',fullName:'Deleted account',email:uid+'@deleted.invalid'});
 expect((await call(patient,'getOwnAccountDeletion',{})).job.state).toBe('requested');
 for(const path of [`patientHealthProfiles/${uid}`,`consultations/${a.id}`,`accountDeletionJobs/${uid}`,`accountRetentions/${uid}/objects/anything`])await expect(getDoc(doc(patient.firestore,path))).rejects.toMatchObject({code:'permission-denied'});
 await expect(setDoc(doc(patient.firestore,`patientProfiles/${uid}`),{uid})).rejects.toMatchObject({code:'permission-denied'});
 await expect(call(patient,'getOwnPatientConsent',{})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 await expect(getBytes(ref(patient.storage,avatar))).rejects.toMatchObject({code:'storage/unauthorized'});
 await expect(uploadBytes(ref(patient.storage,`avatars/${uid}/${randomUUID()}/image.jpg`),Buffer.from('x'),{contentType:'image/jpeg'})).rejects.toMatchObject({code:'storage/unauthorized'});
 await Promise.all([worker(patient),worker(patient)]);
 expect(await job(patient)).toMatchObject({state:'completed',phase:'complete',legalErasure:'retention_pending',attempts:1});
 await expect(authAdmin.getUser(uid)).rejects.toMatchObject({code:'auth/user-not-found'});
 expect((await bucket.file(avatar).exists())[0]).toBe(false);expect(await read(`patientProfiles/${uid}`)).toBeUndefined();expect(await read(`notificationDevices/${sha(uid)}`)).toBeUndefined();expect((await db.collection(`notificationInboxes/${uid}/items`).get()).empty).toBe(true);
 for(const [path,data] of Object.entries(retained))expect(await read(path)).toEqual(data);
 expect(await read(`patientConsents/${uid}`)).toEqual(consentBefore);expect((await db.collection(`patientConsents/${uid}/history`).get()).docs.map(d=>d.data())).toEqual(auditBefore.docs.map(d=>d.data()));
 // Existing authorized participant retains history; deleted participant does not.
 expect((await getDoc(doc(doctor.firestore,`consultations/${a.id}`))).exists()).toBe(true);
 expect((await call(doctor,'getConsultationPrescription',{consultationId:a.id})).prescription).toBeDefined();
 expect(await worker(patient)).toBe(false);
 const replacement=await account('patient',patient.email);expect(replacement.uid).not.toBe(uid);
 await expect(getDoc(doc(replacement.firestore,`consultations/${a.id}`))).rejects.toMatchObject({code:'permission-denied'});
 expect((await read(`users/${replacement.uid}`))?.status).toBe('active');expect((await read(`users/${uid}`))?.status).toBe('disabled');
});

test('partial failure persists progress, revokes sessions and resumes after an interrupted lease',async()=>{
 const c=await account(),id=sha(randomUUID()),cid=sha(randomUUID()),slot=db.doc(`consultationAttachments/${id}`),path=`consultationAttachments/${cid}/${id}/document`;
 await slot.create({attachmentId:id,consultationId:cid,senderId:c.uid,state:'prepared',storagePath:'invalid-bound-path',filename:'Synthetic unfinished upload'});
 await call(c,'requestOwnAccountDeletion',intent());await worker(c);
 expect(await job(c)).toMatchObject({state:'retryable',phase:'staging',attempts:1});expect((await authAdmin.getUser(c.uid)).disabled).toBe(true);
 expect((await authAdmin.getUser(c.uid)).tokensValidAfterTime).toBeDefined();
 expect((await call(c,'requestOwnAccountDeletion',intent())).job).toMatchObject({state:'requested',phase:'staging'});
 // Only repair this test fixture, then simulate a crashed expired lease.
 await slot.update({storagePath:path});await bucket.file(path).save(Buffer.from('synthetic draft'),{resumable:false});
 await db.doc(`accountDeletionJobs/${c.uid}`).update({state:'processing',leaseToken:'interrupted-test-lease',leaseUntil:Timestamp.fromMillis(Date.now()-1000)});
 await worker(c);expect(await job(c)).toMatchObject({state:'completed',attempts:2});expect((await bucket.file(path).exists())[0]).toBe(false);
 expect((await slot.get()).data()).toEqual(expect.objectContaining({state:'discarded',senderId:c.uid,storagePath:path}));expect((await slot.get()).data()?.filename).toBeUndefined();
});

test('approved doctor evidence is retained privately before Auth deletion, public discovery and privileges removed',async()=>{
 const doctor=await account('doctor'),admin=await account(null),now=new Date().toISOString();
 await db.doc(`users/${admin.uid}`).create({uid:admin.uid,email:admin.email,fullName:'Synthetic deletion reviewer',role:'administrator',status:'active',schemaVersion:1,createdAt:now,updatedAt:now});
 await call(doctor,'saveDoctorProfileDraft',{professionalName:'Synthetic deletion doctor',specialty:'Medicine',registrationNumber:'SYNTHETIC-CP15',issuingAuthority:'Synthetic test authority',phoneNumber:'+254700000000'});
 const bytes=Buffer.from('%PDF-1.4\nSynthetic deletion credential only\n%%EOF'),slot=await call(doctor,'prepareDoctorCredential',{category:'medical_license',contentType:'application/pdf',sizeBytes:bytes.length});
 await uploadBytes(ref(doctor.storage,slot.storagePath),bytes,{contentType:'application/pdf'});
 await call(doctor,'finalizeDoctorCredential',{credentialId:slot.credentialId});const submitted=await call(doctor,'submitDoctorVerification',{credentialIds:[slot.credentialId],expectedRevision:1});
 await call(admin,'reviewDoctorVerification',{requestId:submitted.requestId,expectedRevision:1,decision:'approved'});
 const requestBefore=await read(`verificationRequests/${submitted.requestId}`),credentialBefore=await read(`doctorCredentials/${slot.credentialId}`),auditBefore=await db.collection('verificationAudit').where('requestId','==',submitted.requestId).get();
 expect((await db.doc(`doctorPublicProfiles/${doctor.uid}`).get()).exists).toBe(true);
 await call(doctor,'requestOwnAccountDeletion',intent());expect((await db.doc(`doctorPublicProfiles/${doctor.uid}`).get()).exists).toBe(false);
 await expect(call(doctor,'saveDoctorProfileDraft',{})).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 await expect(getBytes(ref(doctor.storage,slot.storagePath))).rejects.toMatchObject({code:'storage/unauthorized'});
 await worker(doctor);expect(await job(doctor)).toMatchObject({state:'completed'});
 expect(await read(`verificationRequests/${submitted.requestId}`)).toEqual(requestBefore);expect(await read(`doctorCredentials/${slot.credentialId}`)).toEqual(credentialBefore);
 expect((await db.collection('verificationAudit').where('requestId','==',submitted.requestId).get()).docs.map(d=>d.data())).toEqual(auditBefore.docs.map(d=>d.data()));
 const manifest=await read(`accountRetentions/${doctor.uid}/objects/${slot.credentialId}`);expect(manifest?.checksum).toBe(sha(bytes));expect((await bucket.file(slot.storagePath).exists())[0]).toBe(false);
 expect((await bucket.file(manifest!.archivePath).download())[0]).toEqual(bytes);expect((await bucket.file(manifest!.archivePath).getMetadata())[0].metadata?.firebaseStorageDownloadTokens).toBeFalsy();
 await expect(getBytes(ref(admin.storage,manifest!.archivePath))).rejects.toMatchObject({code:'storage/unauthorized'});
 expect((await read(`doctorProfiles/${doctor.uid}`))?.phoneNumber).toBeUndefined();expect((await read(`doctorProfiles/${doctor.uid}`))?.professionalName).toBe('Synthetic deletion doctor');
 await expect(authAdmin.getUser(doctor.uid)).rejects.toMatchObject({code:'auth/user-not-found'});
});
