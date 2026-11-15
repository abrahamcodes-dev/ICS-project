import {Timestamp} from 'firebase-admin/firestore';
import {onCall,HttpsError} from '../shared/academicHttps';
import {academicEnvironment,requireAcademicAdmission} from '../shared/academicAdmission';
import {authorization} from '../shared/authorization';
import {db,storage} from '../shared/firestoreRefs';
import {validateCredentialRecord} from './verificationPolicy';
import {validateAvatarJpeg} from './avatarPolicy';
import {createHash} from 'node:crypto';

export function uploadBytes(value:unknown,max:number):Buffer {
  if(typeof value!=='string'||value.length>Math.ceil(max/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw new HttpsError('invalid-argument','Invalid bounded base64 upload.');
  const data=Buffer.from(value,'base64');
  if(!data.length||data.length>max||data.toString('base64')!==value)throw new HttpsError('invalid-argument','Invalid upload size.');
  return data;
}
function checkedCredential(record:Record<string,any>) {
  const decoded={...record};
  for(const k of ['createdAt','updatedAt','expiresAt']){
    if(!(record[k] instanceof Timestamp))throw new HttpsError('failed-precondition','Invalid credential timestamp.');
    decoded[k]={seconds:record[k].seconds,nanoseconds:record[k].nanoseconds};
  }
  validateCredentialRecord(decoded as any);
}
/** Storage direct SDK access is denied in hosted Rules. No download tokens issued. */
export const uploadAcademicDemoObject=onCall({memory:'512MiB',concurrency:2},async request=>{
  if(academicEnvironment()!=='hosted')throw new HttpsError('failed-precondition','Hosted upload only.');
  const v=request.data;
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='base64,id,kind'
    ||!['credential','avatar'].includes(v.kind)||typeof v.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v.id))
    throw new HttpsError('invalid-argument','Provide kind, slot id and base64 only.');
  const actor=await authorization.requireActive(request.auth),uid=actor.uid;
  let objectPath:string,contentType:string;
  const bytes=uploadBytes(v.base64,v.kind==='credential'?5242880:262144);
  if(v.kind==='credential') {
    if(actor.role!=='doctor'||!['pending','rejected'].includes(actor.verificationStatus!))throw new HttpsError('permission-denied','Eligible doctor required.');
    const record=(await db.doc('doctorCredentials/'+v.id).get()).data();
    if(!record)throw new HttpsError('permission-denied','Upload slot unavailable.');
    checkedCredential(record);
    if(record.doctorUid!==uid||record.credentialId!==v.id||record.storagePath!==`doctorCredentials/${uid}/${v.id}/document`
      ||record.state!=='prepared'||record.requestId!==null||record.expiresAt.toMillis()<=Date.now()||record.sizeBytes!==bytes.length
      ||record.createdAt.toMillis()>Date.now()||record.updatedAt.toMillis()>Date.now())
      throw new HttpsError('permission-denied','Upload slot unavailable.');
    objectPath=record.storagePath;contentType=record.contentType;
  } else {
    if(!['patient','doctor'].includes(actor.role))throw new HttpsError('permission-denied','Profile owner required.');
    const s=(await db.doc(`users/${uid}/avatar/state`).get()).data();
    if(!s||s.pending!==v.id||!Number.isSafeInteger(s.expiresAt)||s.expiresAt<=Date.now()
      ||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v.id))throw new HttpsError('permission-denied','Avatar slot unavailable.');
    validateAvatarJpeg(bytes);objectPath=`avatars/${uid}/${v.id}/image.jpg`;contentType='image/jpeg';
  }
  const object=storage.bucket().file(objectPath);
  if((await object.exists())[0])throw new HttpsError('already-exists','Upload already exists; finalize or prepare another slot.');
  await object.save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType}});
  return {uploaded:true};
});

export const readAcademicDemoCredential=onCall({memory:'512MiB',concurrency:2},async request=>{
  if(academicEnvironment()!=='hosted')throw new HttpsError('failed-precondition','Hosted read only.');
  const v=request.data;
  if(!v||typeof v!=='object'||Object.keys(v).join(',')!=='credentialId'||typeof v.credentialId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v.credentialId))
    throw new HttpsError('invalid-argument','Credential id required.');
  const actor=await authorization.requireActive(request.auth),r=(await db.doc('doctorCredentials/'+v.credentialId).get()).data();
  if(r)checkedCredential(r);
  if(!r||r.credentialId!==v.credentialId||r.state!=='attached'||r.requestId===null||actor.role!=='administrator'
    ||r.storagePath!==`doctorCredentials/${r.doctorUid}/${v.credentialId}/document`||!/^\d+$/.test(r.generation)
    ||!Number.isSafeInteger(r.sizeBytes)||r.sizeBytes<1||r.sizeBytes>5242880)
    throw new HttpsError('permission-denied','Attached evidence and administrator required.');
  const file=storage.bucket().file(r.storagePath,{generation:r.generation});
  const [meta]=await file.getMetadata();
  if(Number(meta.size)!==r.sizeBytes||meta.contentType!==r.contentType)throw new HttpsError('failed-precondition','Evidence changed.');
  const [bytes]=await file.download({validation:'crc32c',decompress:false});
  if(bytes.length!==r.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==r.checksum)throw new HttpsError('failed-precondition','Evidence changed.');
  await requireAcademicAdmission(request.auth);
  return {base64:bytes.toString('base64')};
});
