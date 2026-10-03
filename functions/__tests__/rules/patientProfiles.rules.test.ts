import { readFileSync } from "fs";
import { resolve } from "path";
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { validatePatientProfileInput, validatePatientHealthInput } from "../../src/profiles/domainValidation";
let env: RulesTestEnvironment;
const storedTime=Timestamp.fromDate(new Date("2020-01-01T00:00:00.000Z"));
const identity=(uid="owner",extra={})=>({uid,email:"test@example.test",fullName:"Patient",role:"patient",status:"active",schemaVersion:1,
 createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z",...extra});
const base=(extra={})=>({uid:"owner",schemaVersion:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),...extra});
const client=(uid="owner")=>env.authenticatedContext(uid).firestore();
async function seed(path:string,data:Record<string,unknown>){
 await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),path),data);});
}
async function seedProfile(name:string){
 await seed(name+"/owner",{uid:"owner",schemaVersion:1,createdAt:storedTime,updatedAt:storedTime});
}
beforeAll(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8085")throw new Error("Requires local demo emulator.");
 env=await initializeTestEnvironment({projectId:"demo-calladoc-rules",firestore:{host:"127.0.0.1",port:8085,
 rules:readFileSync(resolve(__dirname,"../../firestore.rules"),"utf8")}});
});
beforeEach(async()=>{await env.clearFirestore();await seed("users/owner",identity());await seed("users/other",identity("other"));});
afterAll(async()=>{if(env)await env.cleanup();});
describe.each(["patientProfiles","patientHealthProfiles"])("%s",name=>{
 test("owner creates and reads empty optional profile with real server timestamps",async()=>{
  const ref=doc(client(),name+"/owner");await assertSucceeds(setDoc(ref,base()));
  const snap=await assertSucceeds(getDoc(ref));
  expect(snap.data()?.createdAt).toBeInstanceOf(Timestamp);
  expect(snap.data()?.createdAt.isEqual(snap.data()?.updatedAt)).toBe(true);
 });
 test("permitted fields update and full replacement clears optional fields",async()=>{
  const ref=doc(client(),name+"/owner");
  const fields=name==="patientProfiles"?{displayName:"Patient",phoneNumber:"+254 700123456"}:{gender:"Not specified",allergies:["Pollen"]};
  await assertSucceeds(setDoc(ref,base(fields)));
  const createdAt=(await getDoc(ref)).data()!.createdAt;
  await assertSucceeds(updateDoc(ref,{...fields,updatedAt:serverTimestamp()}));
  await assertSucceeds(setDoc(ref,{uid:"owner",schemaVersion:1,createdAt,updatedAt:serverTimestamp()}));
  expect(Object.keys((await getDoc(ref)).data()!).sort()).toEqual(["uid","schemaVersion","createdAt","updatedAt"].sort());
 });
 test("delete and collection list denied",async()=>{
  await seedProfile(name);await assertFails(deleteDoc(doc(client(),name+"/owner")));
  await assertFails(getDocs(collection(client(),name)));
 });
 test("guest and other patient cannot read/create/update/delete",async()=>{
  await seedProfile(name);
  for(const db of [env.unauthenticatedContext().firestore(),client("other")]){
   await assertFails(getDoc(doc(db,name+"/owner")));
   await assertFails(updateDoc(doc(db,name+"/owner"),{updatedAt:serverTimestamp()}));
   await assertFails(deleteDoc(doc(db,name+"/owner")));
   await assertFails(setDoc(doc(db,name+"/absent"),base({uid:"absent"})));
  }
 });
 test.each([
  null,{},identity("owner",{createdAt:"2026-02-30T00:00:00.000Z"}),identity("owner",{updatedAt:"2026-01-01T99:00:00.000Z"}),identity("wrong"),identity("owner",{status:"disabled"}),identity("owner",{role:"doctor",verificationStatus:"pending"}),
  identity("owner",{fullName:"\u00a0Patient"}),identity("owner",{fullName:"\u{1F600}".repeat(101)}),identity("owner",{email:"\u00a0"}),
  identity("owner",{role:"doctor",verificationStatus:"approved"}),identity("owner",{role:"administrator"}),
  identity("owner",{role:"admin"}),identity("owner",{role:"unknown"}),identity("owner",{role:undefined}),
  identity("owner",{schemaVersion:2}),identity("owner",{status:undefined}),identity("owner",{createdAt:"invalid"}),
 ])("invalid/nonpatient identity %# receives no privileges",async data=>{
  await env.withSecurityRulesDisabled(async context=>{await deleteDoc(doc(context.firestore(),"users/owner"));});
  if(data!==null) await seed("users/owner",Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined)));
  await assertFails(setDoc(doc(client(),name+"/owner"),base()));
  await seedProfile(name);
  await assertFails(getDoc(doc(client(),name+"/owner")));
  await assertFails(updateDoc(doc(client(),name+"/owner"),{updatedAt:serverTimestamp()}));
 });
 test.each([{uid:"other"},{schemaVersion:2},{schemaVersion:"1"},{createdAt:storedTime},{updatedAt:storedTime},
  {createdAt:"2020-01-01T00:00:00.000Z"},{updatedAt:{seconds:1,nanoseconds:0}},{createdAt:Timestamp.fromMillis(4102444800000)},
  {createdAt:null},{updatedAt:null}])("invalid document metadata %# denied",async extra=>{
  await assertFails(setDoc(doc(client(),name+"/owner"),base(extra)));
 });
 test.each(["role","email","status","verificationStatus","revision","activeRequestId","unknown"])("injected %s denied on create/update",async key=>{
  await assertFails(setDoc(doc(client(),name+"/owner"),base({[key]:"spoof"})));
  await seedProfile(name);await assertFails(updateDoc(doc(client(),name+"/owner"),{[key]:"spoof",updatedAt:serverTimestamp()}));
 });
 test.each([{uid:"other"},{schemaVersion:2},{createdAt:serverTimestamp()},{updatedAt:storedTime}])("immutable/backdated update %# denied",async extra=>{
  await seedProfile(name);await assertFails(updateDoc(doc(client(),name+"/owner"),{updatedAt:serverTimestamp(),...extra}));
 });
 test.each(["uid","schemaVersion","createdAt","updatedAt"])("missing required %s denied",async field=>{
  const data:Record<string,unknown>=base();delete data[field];
  await assertFails(setDoc(doc(client(),name+"/owner"),data));
 });
 test("missing profile is a successful owner read, not required for identity",async()=>{
  const snap=await assertSucceeds(getDoc(doc(client(),name+"/owner")));expect(snap.exists()).toBe(false);
 });
 test("valid identity names retain their existing semantics",async()=>{
  for(const fullName of ["\u{1F600}".repeat(100),"First\nLast"]){
   await seed("users/owner",identity("owner",{fullName}));
   await assertSucceeds(getDoc(doc(client(),name+"/owner")));
  }
 });
});
test.each(["",null,23,"x".repeat(201)," Patient","Patient ","bad\nname","bad\u007fname","\u00a0Patient","Patient\ufeff","\u{1F600}".repeat(101)])
 ("invalid displayName %#",async displayName=>{
  await assertFails(setDoc(doc(client(),"patientProfiles/owner"),base({displayName})));
});
test.each(["123","+254 (700)-123456","1".repeat(32)])("valid phone %s",async phoneNumber=>{
 await assertSucceeds(setDoc(doc(client(),"patientProfiles/owner"),base(validatePatientProfileInput({phoneNumber}))));
});
test.each(["",null,123,"abc","12","() 1","+()123 ","1".repeat(33),"123x","++123"])("invalid phone %#",async phoneNumber=>{
 await assertFails(setDoc(doc(client(),"patientProfiles/owner"),base({phoneNumber})));
});
test.each(["a".repeat(200),"\u{1F600}".repeat(100),"A\u00a0B","A\u2003B"])("normalized display boundary %# agrees with pure validation",async displayName=>{
 await assertSucceeds(setDoc(doc(client(),"patientProfiles/owner"),base(validatePatientProfileInput({displayName}))));
});
test("trimmed public input can be persisted after normalization",async()=>{
 const fields=validatePatientProfileInput({displayName:"\u00a0 Test \ufeff",phoneNumber:" 123 "});
 await assertSucceeds(setDoc(doc(client(),"patientProfiles/owner"),base(fields)));
});
test.each(["2000-02-29","2024-02-29","1900-02-28","0000-02-29"])("valid calendar DOB %s",async dateOfBirth=>{
 const fields=validatePatientHealthInput({dateOfBirth},"2026-01-01");
 await assertSucceeds(setDoc(doc(client(),"patientHealthProfiles/owner"),base(fields)));
});
test.each(["2025-02-29","1900-02-29","2026-04-31","2026-13-01","2026-00-01","2026-01-00","2026-01-32",
 "9999-01-01","01/01/2000","2000-1-01",null,123])("invalid DOB %# denied",async dateOfBirth=>{
 await assertFails(setDoc(doc(client(),"patientHealthProfiles/owner"),base({dateOfBirth})));
});
test("today UTC accepted and tomorrow denied",async()=>{
 const today=new Date().toISOString().slice(0,10),tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);
 await assertSucceeds(setDoc(doc(client(),"patientHealthProfiles/owner"),base({dateOfBirth:today})));
 const createdAt=(await getDoc(doc(client(),"patientHealthProfiles/owner"))).data()!.createdAt;
 await assertFails(setDoc(doc(client(),"patientHealthProfiles/owner"),base({createdAt,dateOfBirth:tomorrow})));
});
test.each(["",null,23,"g".repeat(51)," gender","bad\nvalue","\u{1F600}".repeat(26)])("invalid gender %#",async gender=>{
 await assertFails(setDoc(doc(client(),"patientHealthProfiles/owner"),base({gender})));
});
test.each(["knownConditions","allergies","currentMedications"])("%s list validation",async key=>{
 for(const value of [Array(21).fill("a"),["a".repeat(201)],[""],[null],[123],[true],[{}],["a\nb"],[" a"],["a\u00a0"],["a\u0000b"],["\u{1F600}".repeat(101)],"not-list",null]){
  await assertFails(setDoc(doc(client(),"patientHealthProfiles/owner"),base({[key]:value})));
 }
});
test("all three lists at their limits pass normalized validator and rules",async()=>{
 const fields=validatePatientHealthInput({gender:"g".repeat(50),dateOfBirth:"2000-02-29",
 knownConditions:Array(20).fill("a".repeat(200)),allergies:Array(20).fill("\u{1F600}".repeat(100)),currentMedications:Array(20).fill("b".repeat(200))},"2026-01-01");
 await assertSucceeds(setDoc(doc(client(),"patientHealthProfiles/owner"),base(fields)));
 await assertSucceeds(updateDoc(doc(client(),"patientHealthProfiles/owner"),{...fields,updatedAt:serverTimestamp()}));
});

test("single-character and internal Unicode whitespace list entries agree with pure validation",async()=>{
 const fields=validatePatientHealthInput({allergies:["a","\u{1F600}","a\u00a0b","a\u2003b"]},"2026-01-01");
 await assertSucceeds(setDoc(doc(client(),"patientHealthProfiles/owner"),base(fields)));
});
test("empty lists are preserved",async()=>{
 await assertSucceeds(setDoc(doc(client(),"patientHealthProfiles/owner"),base({allergies:[],currentMedications:[],knownConditions:[]})));
});
test.each(Array.from({length:20},(_,index)=>index))("each list position %s is validated",async index=>{
 const values=Array(20).fill("valid");values[index]="bad\nentry";
 await assertFails(setDoc(doc(client(),"patientHealthProfiles/owner"),base({allergies:values})));
});
