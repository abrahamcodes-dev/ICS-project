import './featureEnvironment';
import {randomUUID,createHash} from 'crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getStorage,connectStorageEmulator,ref,uploadBytes,getBytes,deleteObject} from 'firebase/storage';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,getDocs,collection,query,limit,setDoc,terminate} from 'firebase/firestore';
import {initializeApp as initializeAdmin,deleteApp as deleteAdmin} from 'firebase-admin/app';
import {getFirestore as adminFirestore,Timestamp} from 'firebase-admin/firestore';
import {getStorage as adminStorage} from 'firebase-admin/storage';
import {approvedDocuments} from '../__tests__/availabilityFixtures';
import {availabilityId} from '../src/scheduling/ids';
import {attachmentId} from '../src/consultations/attachmentPolicy';
for(const [key,value] of Object.entries({CHECKPOINT14_EMULATOR:'demo-calladoc-features-tests',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9108',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8108',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9208'}))if(process.env[key]!==value)throw Error('Explicit local emulator safety configuration required: '+key);
const projectId='demo-calladoc-features-tests',trusted=initializeAdmin({projectId,storageBucket:projectId+'.appspot.com'}),db=adminFirestore(trusted),bucket=adminStorage(trusted).bucket();
const clients:any[]=[];
async function client(){const app=initializeApp({projectId,apiKey:'demo-key',storageBucket:projectId+'.appspot.com'},randomUUID());const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9108',{disableWarnings:true});const storage=getStorage(app);connectStorageEmulator(storage,'127.0.0.1',9208);const firestore=getFirestore(app);connectFirestoreEmulator(firestore,'127.0.0.1',8108);const user=await createUserWithEmailAndPassword(auth,'cp14-'+randomUUID()+'@example.test',randomUUID());const c={app,auth,storage,firestore,uid:user.user.uid};clients.push(c);return c;}
async function call(c:any,name:string,data:unknown){const response=await fetch(`http://127.0.0.1:5108/${projectId}/us-central1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',...(c?{Authorization:'Bearer '+await c.auth.currentUser.getIdToken()}: {})},body:JSON.stringify({data})});const json:any=await response.json();if(json.error)throw Object.assign(Error(json.error.message),{code:json.error.status});return json.result;}
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
const pdf=Buffer.from('%PDF-1.4\nSynthetic document only\n%%EOF');
let doctor:any,patient:any,other:any,cid:string,start:number,end:number;
function encode(value:any):any{if(Array.isArray(value))return value.map(encode);if(value&&typeof value==='object'){if(Object.keys(value).sort().join(',')==='nanoseconds,seconds')return new Timestamp(value.seconds,value.nanoseconds);return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encode(v)]));}return value;}
beforeAll(async()=>{doctor=await client();patient=await client();other=await client();});
beforeEach(async()=>{
 cid=hash(randomUUID());start=Math.floor(Date.now()/1800000)*1800000;end=start+1800000;
 const request='fixture-'+randomUUID(),docs=approvedDocuments();
 for(const [path,original] of Object.entries(docs)){
  if(path.startsWith('users/'))continue;
  const data:any=encode(original);
  if(data.uid==='doctor')data.uid=doctor.uid;if(data.doctorUid==='doctor')data.doctorUid=doctor.uid;
  if(data.approvedRequestId==='approved')data.approvedRequestId=request;if(data.requestId==='approved')data.requestId=request;
  const segments=path.split('/');if(segments[1]==='doctor')segments[1]=doctor.uid;if(segments[1]==='approved')segments[1]=request;
  await db.doc(segments.join('/')).set(data);
 }
 const now=new Date().toISOString();for(const [c,role] of [[doctor,'doctor'],[patient,'patient'],[other,'patient']] as const)await db.doc(`users/${c.uid}`).set({uid:c.uid,email:c.auth.currentUser.email,fullName:'Synthetic attachment user',role,status:'active',schemaVersion:1,createdAt:now,updatedAt:now,...(role==='doctor'?{verificationStatus:'approved'}:{})});
 const created=Timestamp.fromMillis(start-3600000);
 await db.doc(`appointments/${cid}`).create({appointmentId:cid,patientId:patient.uid,doctorId:doctor.uid,availabilityId:availabilityId(doctor.uid,new Date(start).toISOString().slice(0,10)),availabilityRevision:1,startAt:Timestamp.fromMillis(start),endAt:Timestamp.fromMillis(end),doctorDisplay:{professionalName:'Doctor Name',specialty:'Medicine'},status:'scheduled',cancellation:null,outcome:null,schemaVersion:1,createdAt:created,updatedAt:created});
 await call(doctor,'openConsultation',{appointmentId:cid});
});
afterAll(async()=>{for(const c of clients){await terminate(c.firestore);await deleteApp(c.app);}await db.terminate();await deleteAdmin(trusted);});
function prepare(c=doctor,bytes=png,contentType='image/png'){const input={consultationId:cid,requestId:randomUUID(),filename:'synthetic-report',contentType,sizeBytes:bytes.length};return {input,execute:()=>call(c,'prepareConsultationAttachment',input)};}
const binding=(s:any)=>({consultationId:cid,attachmentId:s.attachmentId});
async function upload(slot:any,bytes=png,_mime='image/png',c=doctor){await call(c,'uploadConsultationAttachment',{consultationId:cid,attachmentId:slot.attachmentId,base64:bytes.toString('base64')});}
test('doctor image publishes exactly once and both participants read a private finalized message',async()=>{
 const p=prepare(),s=await p.execute();await upload(s);
 const results=await Promise.all([call(doctor,'finalizeConsultationAttachment',binding(s)),call(doctor,'finalizeConsultationAttachment',binding(s))]);
 expect(results.every(r=>r.attachment.status==='finalized')).toBe(true);
 expect(results.filter(r=>!r.replayed)).toHaveLength(1);
 expect((await call(doctor,'finalizeConsultationAttachment',binding(s))).replayed).toBe(true);
 expect((await db.collection(`consultations/${cid}/messages`).get()).size).toBe(1);
 expect((await db.collection(`notificationInboxes/${patient.uid}/items`).where('appointmentId','==',cid).get()).size).toBe(1);
 expect((await bucket.file(s.storagePath).getMetadata())[0].metadata?.firebaseStorageDownloadTokens).toBeFalsy();
 for(const c of [patient,doctor]){const view=await call(c,'getConsultationAttachment',binding(s));expect(Buffer.from(view.base64,'base64')).toEqual(png);expect((await getDoc(doc(c.firestore,`consultations/${cid}/messages/${s.attachmentId}`))).exists()).toBe(true);}
 const page=await getDocs(query(collection(patient.firestore,`consultations/${cid}/messages`),limit(30)));expect(page.size).toBe(1);
});
test('doctor PDF supported and patient PDF blocked even for a development grant',async()=>{
 const s=await prepare(doctor,pdf,'application/pdf').execute();await upload(s,pdf,'application/pdf');await call(doctor,'finalizeConsultationAttachment',binding(s));
 for(const decision of [null,'declined','withdrawn','granted']){const ref=db.doc(`patientConsents/${patient.uid}`);if(decision===null)await ref.delete();else await ref.set({patientUid:patient.uid,sharingDecision:decision,documentVersion:'development-2026-11-03-v1',developmentOnly:true});await expect(prepare(patient,pdf,'application/pdf').execute()).rejects.toMatchObject({code:'FAILED_PRECONDITION'});}
});
test('unsupported and oversized declarations rejected before staging',async()=>{
 const p=prepare();for(const extra of [{contentType:'text/html'},{sizeBytes:10485761},{storagePath:'arbitrary'}])await expect(call(doctor,'prepareConsultationAttachment',{...p.input,...extra})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
});
test('spoofed MIME/signatures cannot create messages',async()=>{
 const bytes=Buffer.from('fake png');const s=await prepare(doctor,bytes).execute();await expect(upload(s,bytes)).rejects.toMatchObject({code:'INVALID_ARGUMENT'});expect((await db.collection(`consultations/${cid}/messages`).get()).empty).toBe(true);
});
test('unrelated users, arbitrary paths, overwrites and direct private reads/deletes denied',async()=>{
 const s=await prepare().execute();await expect(prepare(other).execute()).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 await expect(upload(s,png,'image/png',other)).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 await upload(s);await upload(s); // Exact server upload replay is safe.
 await expect(uploadBytes(ref(doctor.storage,s.storagePath),png,{contentType:'image/png'})).rejects.toMatchObject({code:'storage/unauthorized'});
 await expect(uploadBytes(ref(doctor.storage,s.storagePath.replace(s.attachmentId,'a'.repeat(64))),png,{contentType:'image/png'})).rejects.toMatchObject({code:'storage/unauthorized'});
 for(const c of [patient,doctor,other]){await expect(getBytes(ref(c.storage,s.storagePath))).rejects.toMatchObject({code:'storage/unauthorized'});await expect(deleteObject(ref(c.storage,s.storagePath))).rejects.toMatchObject({code:'storage/unauthorized'});await expect(setDoc(doc(c.firestore,`consultations/${cid}/messages/forged`),{})).rejects.toMatchObject({code:'permission-denied'});}
 await expect(call(other,'getConsultationAttachment',binding(s))).rejects.toMatchObject({code:'PERMISSION_DENIED'});
});
test('interrupted preparation/upload retries recover the same slot and message',async()=>{
 const p=prepare(),s=await p.execute();expect(await p.execute()).toEqual(s);
 await expect(call(doctor,'finalizeConsultationAttachment',binding(s))).rejects.toMatchObject({code:'NOT_FOUND'});
 await upload(s);await call(doctor,'finalizeConsultationAttachment',binding(s));await call(doctor,'finalizeConsultationAttachment',binding(s));
 expect((await db.collection(`consultations/${cid}/messages`).get()).size).toBe(1);
});
test('cancelled staging and expired uploads cannot finalize; cleanup deletes private orphans',async()=>{
 const s=await prepare().execute();await upload(s);await call(doctor,'discardConsultationAttachment',binding(s));
 await expect(call(doctor,'finalizeConsultationAttachment',binding(s))).rejects.toMatchObject({code:'FAILED_PRECONDITION'});
 expect((await bucket.file(s.storagePath).exists())[0]).toBe(false);
 // A second unique room avoids the per-sender preparation rate limit.
 const orphanId=hash(randomUUID()),path=`consultationAttachments/${cid}/${orphanId}/document`;
 await db.doc(`consultationAttachments/${orphanId}`).create({attachmentId:orphanId,consultationId:cid,senderId:doctor.uid,state:'prepared',storagePath:path,cleanupAt:Timestamp.fromMillis(Date.now()-1000)});
 await bucket.file(path).save(png,{contentType:'image/png'});
 const {cleanupAttachmentUploads}=await import('../src/consultations/attachmentCallables');await cleanupAttachmentUploads();
 expect((await bucket.file(path).exists())[0]).toBe(false);expect((await db.doc(`consultationAttachments/${orphanId}`).get()).data()?.state).toBe('discarded');
});
test('closed consultation retains historical downloads but rejects new attachment publication',async()=>{
 const s=await prepare().execute();await upload(s);await call(doctor,'finalizeConsultationAttachment',binding(s));
 // Explicit synthetic terminal fixture; never change real appointment records.
 await db.doc(`consultations/${cid}`).update({state:'closed',closedAt:Timestamp.fromMillis(Date.now())});
 expect((await call(patient,'getConsultationAttachment',binding(s))).base64).toBe(png.toString('base64'));
 await expect(prepare().execute()).rejects.toMatchObject({code:'FAILED_PRECONDITION'});
 expect((await call(doctor,'finalizeConsultationAttachment',binding(s))).replayed).toBe(true);
});
test('approval loss and missing bytes fail closed; existing text messages remain usable',async()=>{
 await call(patient,'sendConsultationMessage',{consultationId:cid,messageRequestId:randomUUID(),text:'Synthetic text regression'});
 const s=await prepare().execute();await upload(s);await call(doctor,'finalizeConsultationAttachment',binding(s));
 await db.doc(`users/${doctor.uid}`).update({verificationStatus:'rejected'});
 await expect(call(doctor,'getConsultationAttachment',binding(s))).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 await bucket.file(s.storagePath).delete();await expect(call(patient,'getConsultationAttachment',binding(s))).rejects.toMatchObject({code:'NOT_FOUND'});
 expect((await db.collection(`consultations/${cid}/messages`).get()).size).toBe(2);
});
test('upload replays preserve generation and conflicting bytes cannot overwrite',async()=>{
 const s=await prepare(doctor,pdf,'application/pdf').execute();await upload(s,pdf);
 const generation=(await bucket.file(s.storagePath).getMetadata())[0].generation;
 await upload(s,pdf);expect((await bucket.file(s.storagePath).getMetadata())[0].generation).toBe(generation);
 const conflicting=Buffer.from(pdf);conflicting[12]=conflicting[12]===65?66:65;
 await expect(upload(s,conflicting)).rejects.toMatchObject({code:'ALREADY_EXISTS'});
 expect((await bucket.file(s.storagePath).getMetadata())[0].generation).toBe(generation);
});
test('full 10 MiB payload uses private callable transport and validates at the limit',async()=>{
 const header=Buffer.from('%PDF-1.4\nSynthetic only\n'),footer=Buffer.from('\n%%EOF');
 const bytes=Buffer.concat([header,Buffer.alloc(10485760-header.length-footer.length,32),footer]);
 const s=await prepare(doctor,bytes,'application/pdf').execute();await upload(s,bytes);
 await call(doctor,'finalizeConsultationAttachment',binding(s));
 const response=await call(patient,'getConsultationAttachment',binding(s));expect(Buffer.from(response.base64,'base64').equals(bytes)).toBe(true);
 expect((await bucket.file(s.storagePath).getMetadata())[0].metadata?.firebaseStorageDownloadTokens).toBeFalsy();
});
test('upcoming and cancelled consultations cannot accept new uploads',async()=>{
 const appointment=db.doc(`appointments/${cid}`),room=db.doc(`consultations/${cid}`),future=start+3600000;
 await appointment.update({startAt:Timestamp.fromMillis(future),endAt:Timestamp.fromMillis(future+1800000),availabilityId:availabilityId(doctor.uid,new Date(future).toISOString().slice(0,10))});
 await room.update({appointmentStartAt:Timestamp.fromMillis(future),appointmentEndAt:Timestamp.fromMillis(future+1800000),createdAt:Timestamp.fromMillis(future)});
 await expect(prepare().execute()).rejects.toMatchObject({code:'PERMISSION_DENIED'});
 const at=Timestamp.fromMillis(future-1);await appointment.update({status:'cancelled',updatedAt:at,cancellation:{cancelledBy:patient.uid,cancelledAt:at,reason:null}});
 await expect(prepare().execute()).rejects.toMatchObject({code:'PERMISSION_DENIED'});
});
test('completed historical consultations retain authorized viewing without new sends',async()=>{
 const oldStart=start-3600000,oldEnd=oldStart+1800000,created=Timestamp.fromMillis(oldStart-3600000),completed=Timestamp.fromMillis(oldEnd);
 await db.doc(`appointments/${cid}`).update({startAt:Timestamp.fromMillis(oldStart),endAt:completed,availabilityId:availabilityId(doctor.uid,new Date(oldStart).toISOString().slice(0,10)),status:'completed',createdAt:created,updatedAt:completed,outcome:{recordedBy:doctor.uid,recordedAt:completed}});
 await db.doc(`consultations/${cid}`).update({appointmentStartAt:Timestamp.fromMillis(oldStart),appointmentEndAt:completed,createdAt:Timestamp.fromMillis(oldStart),state:'closed',closedAt:completed});
 const id=hash(randomUUID()),storagePath=`consultationAttachments/${cid}/${id}/document`,at=Timestamp.fromMillis(oldStart+1);
 const attachment={attachmentId:id,messageId:id,consultationId:cid,senderId:doctor.uid,filename:'synthetic-history.png',contentType:'image/png',sizeBytes:png.length,storagePath,status:'finalized'};
 await bucket.file(storagePath).save(png,{resumable:false,contentType:'image/png'});const generation=String((await bucket.file(storagePath).getMetadata())[0].generation);
 const {status,...slot}=attachment;await db.doc(`consultationAttachments/${id}`).create({...slot,state:'finalized',generation,checksum:createHash('sha256').update(png).digest('hex'),createdAt:at,finalizedAt:at});
 await db.doc(`consultations/${cid}/messages/${id}`).create({messageId:id,senderId:doctor.uid,type:'attachment',attachment,createdAt:at,schemaVersion:1});
 expect((await call(patient,'getConsultationAttachment',{consultationId:cid,attachmentId:id})).base64).toBe(png.toString('base64'));
 expect((await call(doctor,'getConsultationAttachment',{consultationId:cid,attachmentId:id})).base64).toBe(png.toString('base64'));
 await expect(prepare().execute()).rejects.toMatchObject({code:'PERMISSION_DENIED'});
});
