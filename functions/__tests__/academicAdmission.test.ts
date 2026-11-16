import {Timestamp} from 'firebase-admin/firestore';
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {academicEnvironment,admitted,invitationEmail,requireInvitedRole} from '../src/shared/academicAdmission';
import {guardedCall} from '../src/shared/academicHttps';
import {requireAdmissionAdministrator} from '../src/auth/academicAdministration';
import {uploadBytes} from '../src/profiles/academicUploads';
import {requireSimulationEnvironment} from '../src/payments/policy';
const hosted={GCLOUD_PROJECT:'calladoc-qa-academic-demo'};
test.each([{}, {GCLOUD_PROJECT:'calladoc-2c05a'}, {...hosted,FUNCTIONS_EMULATOR:'true'},
 {...hosted,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8111'}, {GCLOUD_PROJECT:'demo-calladoc',FUNCTIONS_EMULATOR:'true',FIRESTORE_EMULATOR_HOST:'cloud:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'}])('environment fails closed %#',env=>expect(()=>academicEnvironment(env)).toThrow());
test('dedicated hosted and explicit loopback demo modes remain separate',()=>{
 expect(academicEnvironment(hosted)).toBe('hosted');
 expect(academicEnvironment({GCLOUD_PROJECT:'demo-calladoc',FUNCTIONS_EMULATOR:'true',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'})).toBe('local');
});
test('normalizes invited emails and rejects path injection',()=>{
 expect(invitationEmail('Tester@Example.test')).toBe('tester@example.test');
 for(const v of ['x/y@example.test','a@b',' a@b.test',null])expect(()=>invitationEmail(v)).toThrow();
});
const member={uid:'u1',email:'test@example.test',expectedRole:'patient',enabled:true,expiresAt:Timestamp.fromMillis(2000)};
test.each([{enabled:false},{uid:'other'},{email:'other@example.test'},{expiresAt:Timestamp.fromMillis(1000)},{expiresAt:2000}])('rejects revoked, expired, malformed and mismatched records %#',patch=>{
 expect(admitted({...member,...patch},member,'u1',member.email,1000)).toBe(false);
 expect(admitted(member,{...member,...patch},'u1',member.email,1000)).toBe(false);
});
test('requires both trusted records, with a strict expiry boundary',()=>{
 expect(admitted(member,member,'u1',member.email,1000)).toBe(true);
 expect(admitted(null,member,'u1',member.email,1000)).toBe(false);
 expect(admitted(member,null,'u1',member.email,1000)).toBe(false);
});
test('callable cannot enter domain code when admission fails',async()=>{
 const handler=jest.fn(),admit=jest.fn().mockRejectedValue(new Error('revoked'));
 await expect(guardedCall(handler,false,admit)({auth:{uid:'u1'}} as any)).rejects.toThrow('revoked');expect(handler).not.toHaveBeenCalled();
});
test('callable preserves registration enrollment intent and result',async()=>{
 const admit=jest.fn().mockResolvedValue(undefined),handler=jest.fn(()=>42),request={auth:{uid:'u1'},data:{}} as any;
 expect(await guardedCall(handler,true,admit)(request)).toBe(42);expect(admit).toHaveBeenCalledWith(request.auth,true);expect(handler).toHaveBeenCalledWith(request);
});
test.each([['patient',true],['doctor',true],['administrator',false],['administrator','true']])('membership administration needs canonical admin AND privileged claim %#',(role,claim)=>expect(()=>requireAdmissionAdministrator(role as string,claim)).toThrow());
test('privileged canonical administrator is admitted',()=>expect(()=>requireAdmissionAdministrator('administrator',true)).not.toThrow());
test('uploads reject empty, oversized and noncanonical base64',()=>{
 expect(uploadBytes('YQ==',1).toString()).toBe('a');
 for(const input of ['', 'YQ=', 'YQ==\n','YWI=','YR=='])expect(()=>uploadBytes(input,1)).toThrow();
});
test('hosted payment simulation requires server opt-in and matching project',()=>{
 expect(()=>requireSimulationEnvironment(hosted)).toThrow();
 const enabled={...hosted,PAYMENT_SIMULATION_MODE:'academic-demo',PAYMENT_SIMULATION_PROJECT_ID:hosted.GCLOUD_PROJECT};
 expect(()=>requireSimulationEnvironment(enabled)).not.toThrow();
 expect(()=>requireSimulationEnvironment({...enabled,PAYMENT_SIMULATION_PROJECT_ID:'other-academic-demo'})).toThrow();
 expect(()=>requireSimulationEnvironment({...enabled,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9111'})).toThrow();
});
test('hosted notice is identical in mobile and backend',()=>{
 expect(readFileSync(resolve(__dirname,'../src/shared/academicNotice.ts'),'utf8')).toBe(readFileSync(resolve(__dirname,'../../mobile/src/services/academicNotice.ts'),'utf8'));
});
test('all exported HTTPS endpoints use the central admission boundary',()=>{
 const index=readFileSync(resolve(__dirname,'../src/index.ts'),'utf8');
 for(const match of index.matchAll(/from ['"](.+)['"]/g)){
  const source=readFileSync(resolve(__dirname,'../src',match[1]+'.ts'),'utf8');
  expect(source).not.toMatch(/import\s*\{[^}]*\bonCall\b[^}]*\}\s*from ['"]firebase-functions\/v2\/https/);
 }
});
test('active HTTP and scheduled endpoints carry conservative instance limits',()=>{
 const exports=require('../src/index');let http=0,schedule=0;
 for(const endpoint of Object.values(exports) as any[]){const e=endpoint.__endpoint;if(!e)continue;
  expect(e.minInstances).toBe(0);
  expect(e.region).toEqual(['us-central1']);
  if(e.scheduleTrigger){expect(e.maxInstances).toBe(1);expect(e.concurrency).toBe(1);schedule++;}
  else{expect(e.maxInstances).toBe(2);expect(e.concurrency).toBeLessThanOrEqual(10);http++;}
 }
 expect(schedule).toBe(3);expect(http).toBe(57); // 55 original exports minus three jobs plus five new endpoints.
});

test('invitation pins patient/doctor role and cannot publicly provision administrators',()=>{expect(()=>requireInvitedRole('patient','patient')).not.toThrow();expect(()=>requireInvitedRole('doctor','doctor')).not.toThrow();for(const [approved,requested]of [['patient','doctor'],['doctor','patient'],['administrator','administrator'],[undefined,'patient']])expect(()=>requireInvitedRole(approved,requested)).toThrow();});
