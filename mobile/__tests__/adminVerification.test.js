jest.mock('../src/services/firebaseConfig',()=>({auth:{currentUser:{uid:'admin'}},db:{},functions:{},storage:{}}));
jest.mock('firebase/auth',()=>({onAuthStateChanged:jest.fn()}));
jest.mock('firebase/firestore',()=>({doc:jest.fn((_,collection,id)=>({collection,id})),getDoc:jest.fn()}));
jest.mock('firebase/functions',()=>({httpsCallable:jest.fn()}));
jest.mock('firebase/storage',()=>({ref:jest.fn((_,path)=>path),getBytes:jest.fn(),uploadBytesResumable:jest.fn()}));
jest.mock('../src/services/identityService',()=>({loadOwnIdentity:jest.fn()}));
jest.mock('react-native-blob-util',()=>({__esModule:true,default:{fs:{dirs:{CacheDir:'/private/cache'},writeFile:jest.fn(),exists:jest.fn(),unlink:jest.fn()}}}));
const {auth}=require('../src/services/firebaseConfig');
const {onAuthStateChanged}=require('firebase/auth');
const {getDoc}=require('firebase/firestore');
const {httpsCallable}=require('firebase/functions');
const {getBytes}=require('firebase/storage');
const {loadOwnIdentity}=require('../src/services/identityService');
const {fs}=require('react-native-blob-util').default;
const {createAdminVerificationSession}=require('../src/services/adminVerification');
const item={requestId:'r',doctorUid:'d',profileRevision:2,professional:{professionalName:'Doctor',specialty:'Medicine',registrationNumber:'R1',issuingAuthority:'Board'},submittedAt:{seconds:1810000000,nanoseconds:123},credentials:[{credentialId:'c',category:'medical_license',generation:'123',checksum:'a'.repeat(64)}]};
let session,invoke,record,request,authChange;
beforeEach(()=>{
 jest.clearAllMocks();auth.currentUser={uid:'admin'};onAuthStateChanged.mockImplementation((_,fn)=>{authChange=fn;return jest.fn();});
 loadOwnIdentity.mockResolvedValue({uid:'admin',role:'administrator',status:'active'});
 invoke=jest.fn(async input=>({data:input.decision?{requestId:'r',profileRevision:2,state:input.decision}:{items:[item],nextCursor:null}}));httpsCallable.mockReturnValue(invoke);
 request={...item,state:'submitted',schemaVersion:1};record={credentialId:'c',doctorUid:'d',requestId:'r',schemaVersion:1,state:'attached',storagePath:'doctorCredentials/d/c/document',contentType:'application/pdf',sizeBytes:3,...item.credentials[0]};
 getDoc.mockImplementation(async({collection})=>({exists:()=>true,data:()=>collection==='verificationRequests'?request:record}));
 getBytes.mockResolvedValue(new Uint8Array([37,80,68]).buffer);fs.writeFile.mockResolvedValue();fs.exists.mockResolvedValue(true);fs.unlink.mockResolvedValue();
 session=createAdminVerificationSession('admin');
});
afterEach(()=>session.dispose());
test('bounded callable pagination; no collection queries',async()=>{
 expect((await session.queue('previous')).items).toEqual([item]);expect(invoke).toHaveBeenCalledWith({limit:10,after:'previous'});expect(getDoc).not.toHaveBeenCalled();
 expect(httpsCallable).toHaveBeenCalledWith(expect.anything(),'listPendingDoctorVerifications');
});
test.each(['patient','doctor','admin'])('nonadministrator %s denied before network',async role=>{
 loadOwnIdentity.mockResolvedValue({uid:'admin',role,status:'active'});await expect(session.queue()).rejects.toThrow();expect(invoke).not.toHaveBeenCalled();
});
test('disabled administrator denied',async()=>{loadOwnIdentity.mockResolvedValue({uid:'admin',role:'administrator',status:'disabled'});await expect(session.queue()).rejects.toThrow();});
test('malformed and oversized queue response rejected',async()=>{invoke.mockResolvedValue({data:{items:Array(11).fill(item),nextCursor:null}});await expect(session.queue()).rejects.toThrow();});
test('approval uses existing callable and exact revision',async()=>{
 await session.review(item,{decision:'approved'});expect(httpsCallable).toHaveBeenCalledWith(expect.anything(),'reviewDoctorVerification');
 expect(invoke).toHaveBeenCalledWith({requestId:'r',expectedRevision:2,decision:'approved'});
});
test('rejection requires reason and normalizes it',async()=>{
 await expect(session.review(item,{decision:'rejected',rejectionReason:'  '})).rejects.toThrow();expect(invoke).not.toHaveBeenCalled();
 await session.review(item,{decision:'rejected',rejectionReason:' Replace license '});expect(invoke).toHaveBeenCalledWith({requestId:'r',expectedRevision:2,decision:'rejected',rejectionReason:'Replace license'});
});
test('concurrent decisions submit only once',async()=>{
 let finish;invoke.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const pending=session.review(item,{decision:'approved'});
 await expect(session.review(item,{decision:'approved'})).rejects.toThrow();await Promise.resolve();finish({data:{requestId:'r',profileRevision:2,state:'approved'}});await pending;expect(invoke).toHaveBeenCalledTimes(1);
});
test('mismatched decision response never reports success',async()=>{invoke.mockResolvedValue({data:{requestId:'other',profileRevision:2,state:'approved'}});await expect(session.review(item,{decision:'approved'})).rejects.toThrow();});
test.each(['application/pdf','image/jpeg','image/png'])('selected %s uses authenticated SDK bytes and private file',async type=>{
 record.contentType=type;const file=await session.openCredential(item,'c');expect(file.uri).toMatch(/^file:\/\/\/private\/cache\/calladoc-review-/);
 expect(getBytes).toHaveBeenCalledWith('doctorCredentials/d/c/document',5242880);expect(fs.writeFile).toHaveBeenCalledWith(file.uri.slice(7),[37,80,68],'ascii');
 await session.closeCredential();expect(fs.unlink).toHaveBeenCalledWith(file.uri.slice(7));
});
test.each([{doctorUid:'other'},{requestId:'other'},{storagePath:'arbitrary/path'},{generation:'456'},{state:'ready'},{sizeBytes:5242881},{contentType:'text/html'}])('invalid metadata denies download %#',async change=>{
 Object.assign(record,change);await expect(session.openCredential(item,'c')).rejects.toThrow();expect(getBytes).not.toHaveBeenCalled();
});
test('unrelated credential ID denied',async()=>{await expect(session.openCredential(item,'other')).rejects.toThrow();expect(getBytes).not.toHaveBeenCalled();});
test('closed request denies download',async()=>{request.state='approved';await expect(session.openCredential(item,'c')).rejects.toThrow();expect(getBytes).not.toHaveBeenCalled();});
test('Storage rejection never writes a file',async()=>{getBytes.mockRejectedValue({code:'storage/unauthorized'});await expect(session.openCredential(item,'c')).rejects.toBeDefined();expect(fs.writeFile).not.toHaveBeenCalled();});
test('wrong downloaded size denied',async()=>{getBytes.mockResolvedValue(new ArrayBuffer(1));await expect(session.openCredential(item,'c')).rejects.toThrow();expect(fs.writeFile).not.toHaveBeenCalled();});
test('close during download prevents late file creation',async()=>{
 let finish;getBytes.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const pending=session.openCredential(item,'c');
 while(!finish)await Promise.resolve();await session.closeCredential();finish(new ArrayBuffer(3));await expect(pending).rejects.toThrow();expect(fs.writeFile).not.toHaveBeenCalled();
});
test('logout during write deletes late file and rejects result',async()=>{
 let finish;fs.writeFile.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const pending=session.openCredential(item,'c');
 while(!finish)await Promise.resolve();auth.currentUser=null;authChange(null);finish();await expect(pending).rejects.toThrow();expect(fs.unlink).toHaveBeenCalled();
});
test('logout removes existing file and blocks future operations',async()=>{
 const file=await session.openCredential(item,'c');auth.currentUser=null;authChange(null);await Promise.resolve();
 expect(fs.unlink).toHaveBeenCalledWith(file.uri.slice(7));await expect(session.queue()).rejects.toThrow();
});
