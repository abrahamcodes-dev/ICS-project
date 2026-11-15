import {avatarInput,validateAvatarJpeg} from '../src/profiles/avatarPolicy';
const mockDocs=new Map<string,any>();
const mockFile={delete:jest.fn(async()=>{}),getMetadata:jest.fn(),setMetadata:jest.fn(),download:jest.fn()};
jest.mock('../src/shared/firestoreRefs',()=>({db:{doc:(path:string)=>({path,get:async()=>({data:()=>mockDocs.get(path)})}),runTransaction:async(fn:any)=>fn({get:async(ref:any)=>({data:()=>mockDocs.get(ref.path)}),set:(ref:any,value:any)=>mockDocs.set(ref.path,JSON.parse(JSON.stringify(value)))})},storage:{bucket:()=>({file:()=>mockFile})}}));
import {changeProfileAvatar,getProfileAvatar} from '../src/profiles/avatarCallables';
const identity=(role='patient',status='active')=>({uid:'owner',email:'owner@example.test',fullName:'Owner',role,status,schemaVersion:1,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',...(role==='doctor'?{verificationStatus:'pending'}:{})});
const change=(data:any,uid:string|undefined='owner')=>changeProfileAvatar.run({data,auth:uid?{uid,token:{}}:undefined} as any);
const read=async(target='owner',uid='owner')=>{const result=await getProfileAvatar.run({data:{uid:target},auth:{uid,token:{}}} as any);if('appointmentId' in result)throw Error('Unexpected appointment response');return result;};
const jpeg=Buffer.from([255,216,255,192,0,8,8,0,32,0,32,0,255,218,0,2,255,217]);
beforeEach(()=>{mockDocs.clear();mockDocs.set('users/owner',identity());jest.clearAllMocks();mockFile.delete.mockResolvedValue(undefined);mockFile.download.mockResolvedValue([jpeg]);mockFile.getMetadata.mockResolvedValue([{size:jpeg.length,contentType:'image/jpeg',generation:'1'}]);});
test.each([null,{},[],{action:'remove',expectedRevision:-1},{action:'remove',expectedRevision:0,uid:'other'},{action:'finalize',expectedRevision:0,uploadId:'bad'}])('reject invalid request %#',v=>expect(()=>avatarInput(v)).toThrow());
test.each([Buffer.alloc(0),Buffer.alloc(262145),Buffer.from('not jpeg'),Buffer.from([255,216,255,225,0,2,255,217])])('reject invalid image %#',v=>expect(()=>validateAvatarJpeg(v)).toThrow());
test('accepts bounded JPEG header; rejects oversized dimensions',()=>{expect(()=>validateAvatarJpeg(jpeg)).not.toThrow();const v=Buffer.from(jpeg);v.writeUInt16BE(513,7);expect(()=>validateAvatarJpeg(v)).toThrow();});
test('guest denied',async()=>{await expect(changeProfileAvatar.run({data:{action:'prepare',expectedRevision:0}} as any)).rejects.toMatchObject({code:'unauthenticated'});});
test.each(['administrator','unknown'])('role %s denied',async role=>{mockDocs.set('users/owner',identity(role));await expect(change({action:'prepare',expectedRevision:0})).rejects.toMatchObject({code:'permission-denied'});});
test('disabled identity denied',async()=>{mockDocs.set('users/owner',identity('patient','disabled'));await expect(read()).rejects.toMatchObject({code:'permission-denied'});});
test('cross-patient read denied',async()=>{mockDocs.set('users/other',{...identity(),uid:'other'});await expect(read('other')).rejects.toMatchObject({code:'permission-denied'});});
test('pending doctor is not public',async()=>{mockDocs.set('users/other',{...identity('doctor'),uid:'other'});await expect(read('other')).rejects.toMatchObject({code:'permission-denied'});});
test('upload persists and replay is idempotent; replacement and removal delete retired objects',async()=>{const slot=await change({action:'prepare',expectedRevision:0});expect('storagePath' in slot && slot.storagePath).toMatch(/^avatars\/owner\//);await change({action:'finalize',expectedRevision:0,uploadId:slot.pending});expect((await read()).image).toMatch(/^data:image\/jpeg;base64,/);await change({action:'finalize',expectedRevision:0,uploadId:slot.pending});expect((await read()).revision).toBe(1);const next=await change({action:'prepare',expectedRevision:1});await change({action:'finalize',expectedRevision:1,uploadId:next.pending});expect(mockFile.delete).toHaveBeenCalled();await change({action:'remove',expectedRevision:2});expect(await read()).toEqual({image:null,pending:null,revision:3});});
test('stale revisions cannot remove a newer image',async()=>{await change({action:'remove',expectedRevision:0});await expect(change({action:'remove',expectedRevision:0})).rejects.toMatchObject({code:'aborted'});});
test('expired upload rejected without altering current reference',async()=>{const slot=await change({action:'prepare',expectedRevision:0});mockDocs.get('users/owner/avatar/state').expiresAt=1;await expect(change({action:'finalize',expectedRevision:0,uploadId:slot.pending})).rejects.toMatchObject({code:'failed-precondition'});expect((await read()).image).toBeNull();});
test('failed cleanup retained for subsequent retry',async()=>{const slot=await change({action:'prepare',expectedRevision:0});mockFile.delete.mockRejectedValue(new Error('offline'));await change({action:'remove',expectedRevision:0});expect(mockDocs.get('users/owner/avatar/state').retired).toEqual([slot.pending]);mockFile.delete.mockResolvedValue(undefined);await change({action:'remove',expectedRevision:1});expect(mockDocs.get('users/owner/avatar/state').retired).toEqual([]);});
test('malformed state fails closed',async()=>{mockDocs.set('users/owner/avatar/state',{revision:0});await expect(read()).rejects.toMatchObject({code:'failed-precondition'});});
import {approvedDocuments} from './availabilityFixtures';
import {Timestamp} from 'firebase-admin/firestore';
function approvedDoctor(){for(const [path,original] of Object.entries(approvedDocuments())){const value={...original};for(const key of ['createdAt','updatedAt','publishedAt','submittedAt','reviewedAt']){const t=value[key];if(t&&typeof t==='object')value[key]=new Timestamp(t.seconds,t.nanoseconds);}mockDocs.set(path,value);}}
test('approved doctor avatar is readable with no credential or registration data',async()=>{approvedDoctor();const slot=await change({action:'prepare',expectedRevision:0},'doctor');await change({action:'finalize',expectedRevision:0,uploadId:slot.pending},'doctor');const result=await read('doctor');expect(result.image).toMatch(/^data:image\/jpeg;base64,/);expect(Object.keys(result).sort()).toEqual(['image','pending','revision']);expect(result.pending).toBeNull();expect(mockDocs.get('doctorPublicProfiles/doctor/avatar/current')).toEqual({avatarId:slot.pending,generation:'1',revision:1});expect(JSON.stringify(result)).not.toMatch(/private-registration|private-credential|phoneNumber|storagePath/);});
test.each(['revision','request','timestamp'])('stale or malformed approval %s denies avatar access',async kind=>{approvedDoctor();if(kind==='revision')mockDocs.get('doctorProfiles/doctor').revision++;if(kind==='request')mockDocs.get('verificationRequests/approved').state='rejected';if(kind==='timestamp')mockDocs.get('doctorProfiles/doctor').createdAt={seconds:1,nanoseconds:0};await expect(read('doctor')).rejects.toMatchObject({code:'permission-denied'});});
test('invalid upload does not replace previous image and remains recoverable',async()=>{const slot=await change({action:'prepare',expectedRevision:0});mockFile.download.mockResolvedValue([Buffer.from('invalid')]);await expect(change({action:'finalize',expectedRevision:0,uploadId:slot.pending})).rejects.toMatchObject({code:'invalid-argument'});expect(await read()).toEqual({revision:0,image:null,pending:slot.pending});});
test('superseded upload cannot be finalized',async()=>{const old=await change({action:'prepare',expectedRevision:0});await change({action:'prepare',expectedRevision:0});await expect(change({action:'finalize',expectedRevision:0,uploadId:old.pending})).rejects.toMatchObject({code:'failed-precondition'});});
test('missing object still returns revision for repair/removal',async()=>{const slot=await change({action:'prepare',expectedRevision:0});await change({action:'finalize',expectedRevision:0,uploadId:slot.pending});mockFile.download.mockRejectedValue({code:404});expect(await read()).toEqual({revision:1,image:null,pending:null});await change({action:'remove',expectedRevision:1});});
test('Firebase-generated bearer token is revoked before publishing reference',async()=>{const slot=await change({action:'prepare',expectedRevision:0});mockFile.getMetadata.mockResolvedValue([{size:jpeg.length,contentType:'image/jpeg',generation:'1',metadata:{firebaseStorageDownloadTokens:'synthetic'}}]);await change({action:'finalize',expectedRevision:0,uploadId:slot.pending});expect(mockFile.setMetadata).toHaveBeenCalledWith({metadata:{firebaseStorageDownloadTokens:null}});});
import {availabilityId} from '../src/scheduling/ids';
const appointmentId='a'.repeat(64);
function appointmentFixture(){
 approvedDoctor();
 const start=Date.parse('2026-10-05T10:00:00Z');
 mockDocs.set('appointments/'+appointmentId,{
  appointmentId,patientId:'patient',doctorId:'doctor',availabilityId:availabilityId('doctor','2026-10-05'),availabilityRevision:1,
  startAt:Timestamp.fromMillis(start),endAt:Timestamp.fromMillis(start+1800000),
  doctorDisplay:{professionalName:'Doctor Name',specialty:'Medicine'},status:'scheduled',cancellation:null,outcome:null,
  schemaVersion:1,createdAt:Timestamp.fromMillis(start-3600000),updatedAt:Timestamp.fromMillis(start-3600000),
 });
}
const patientRead=(uid='doctor',data:any={appointmentId})=>getProfileAvatar.run({data,auth:{uid,token:{}}} as any);
test('assigned approved doctor receives only appointment-bound patient name and avatar',async()=>{
 appointmentFixture();const slot=await change({action:'prepare',expectedRevision:0},'patient');
 await change({action:'finalize',expectedRevision:0,uploadId:slot.pending},'patient');
 const result=await patientRead();expect(result).toEqual({appointmentId,patientDisplayName:'Test User',patientAvatar:expect.stringMatching(/^data:image\/jpeg;base64,/)});
 expect(Object.keys(result).sort()).toEqual(['appointmentId','patientAvatar','patientDisplayName']);
});
test('patient without picture returns name and null image',async()=>{appointmentFixture();expect(await patientRead()).toEqual({appointmentId,patientDisplayName:'Test User',patientAvatar:null});});
test.each(['patient','owner','other','administrator'])('unassigned caller %s cannot read appointment patient',async uid=>{
 appointmentFixture();mockDocs.set('users/other',{...mockDocs.get('users/doctor'),uid:'other'});
 mockDocs.set('users/administrator',{...identity('administrator'),uid:'administrator'});
 await expect(patientRead(uid)).rejects.toMatchObject({code:'permission-denied'});expect(mockFile.download).not.toHaveBeenCalled();
});
test.each(['pending','rejected','disabled','binding','missing-appointment','malformed-appointment','missing-patient'])('appointment display rejects %s',async kind=>{
 appointmentFixture();
 if(kind==='pending'||kind==='rejected')mockDocs.get('users/doctor').verificationStatus=kind;
 if(kind==='disabled')mockDocs.get('users/doctor').status='disabled';
 if(kind==='binding')mockDocs.get('doctorProfiles/doctor').revision++;
 if(kind==='missing-appointment')mockDocs.delete('appointments/'+appointmentId);
 if(kind==='malformed-appointment')mockDocs.get('appointments/'+appointmentId).patientId='doctor';
 if(kind==='missing-patient')mockDocs.delete('users/patient');
 await expect(patientRead()).rejects.toMatchObject({code:'permission-denied'});expect(mockFile.download).not.toHaveBeenCalled();
});
test('appointment input cannot supply a target patient',async()=>{appointmentFixture();await expect(patientRead('doctor',{appointmentId,uid:'owner'})).rejects.toMatchObject({code:'invalid-argument'});});
test('assigned doctor still cannot read patient by arbitrary UID',async()=>{appointmentFixture();await expect(read('patient','doctor')).rejects.toMatchObject({code:'permission-denied'});});
test('avatar download failure preserves authorized patient name',async()=>{
 appointmentFixture();const slot=await change({action:'prepare',expectedRevision:0},'patient');await change({action:'finalize',expectedRevision:0,uploadId:slot.pending},'patient');
 mockFile.download.mockRejectedValue(Error('offline'));expect(await patientRead()).toEqual({appointmentId,patientDisplayName:'Test User',patientAvatar:null});
});
test('approval revoked during download prevents delivery',async()=>{
 appointmentFixture();const slot=await change({action:'prepare',expectedRevision:0},'patient');await change({action:'finalize',expectedRevision:0,uploadId:slot.pending},'patient');
 mockFile.download.mockImplementationOnce(async()=>{mockDocs.get('users/doctor').verificationStatus='rejected';return [jpeg];});
 await expect(patientRead()).rejects.toMatchObject({code:'permission-denied'});
});
