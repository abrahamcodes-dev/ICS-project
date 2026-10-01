import { provisionAdministrator, ProvisionOptions } from "../src/auth/adminProvisioning";
const { parseArgs, transactionAdapter } = require("../scripts/provisionAdmin.cjs");
const timestamp="2026-10-01T00:00:00.000Z";
const options:ProvisionOptions={projectId:"demo-calladoc-rules",uid:"target",fullName:"Test",operator:"operator@example.test",dryRun:false};
const account={uid:"target",email:"test@example.test",emailVerified:true,disabled:false};
const identity={uid:"target",email:account.email,fullName:"Test",role:"administrator",status:"active",schemaVersion:1,createdAt:timestamp,updatedAt:timestamp};
function setup(existing:unknown=null){
 const tx={get:jest.fn(async()=>({exists:existing!==null,data:()=>existing})),create:jest.fn()};
 const db={collection:(name:string)=>({doc:(uid="audit")=>({path:name+"/"+uid})}),
 runTransaction:jest.fn(async(callback:(t:typeof tx)=>unknown)=>callback(tx))};
 const deps={getUser:jest.fn(async()=>account),now:()=>timestamp,transact:transactionAdapter(db)};
 return {tx,db,deps};
}
test("canonical creation and audit are atomic",async()=>{
 const {tx,db,deps}=setup();
 await expect(provisionAdministrator(options,deps)).resolves.toEqual({action:"create",identity});
 expect(db.runTransaction).toHaveBeenCalledTimes(1);
 expect(tx.create).toHaveBeenNthCalledWith(1,{path:"users/target"},identity);
 expect(tx.create).toHaveBeenNthCalledWith(2,{path:"administratorProvisioningAudit/audit"},
 {event:"administrator.provisioned",projectId:options.projectId,targetUid:"target",operator:options.operator,timestamp});
});
test("dry run has no identity or audit writes",async()=>{
 const {tx,deps}=setup();
 await expect(provisionAdministrator({...options,dryRun:true},deps)).resolves.toMatchObject({action:"create"});
 expect(tx.create).not.toHaveBeenCalled();
});
test("missing Auth user rejected",async()=>{
 const {tx,deps}=setup();deps.getUser.mockRejectedValue(new Error("auth/user-not-found"));
 await expect(provisionAdministrator(options,deps)).rejects.toThrow("auth/user-not-found");expect(tx.get).not.toHaveBeenCalled();
});
test.each([{disabled:true},{emailVerified:false},{email:""},{email:"invalid"},{uid:"other"}])("invalid Auth %#",async override=>{
 const {tx,deps}=setup();deps.getUser.mockResolvedValue({...account,...override});
 await expect(provisionAdministrator(options,deps)).rejects.toThrow();expect(tx.create).not.toHaveBeenCalled();
});
test.each([{...identity,role:"patient"},{...identity,role:"doctor",verificationStatus:"pending"},{},
 {...identity,role:"admin"},{...identity,status:"disabled"},{...identity,uid:"other"},
 {...identity,email:"other@example.test"},{...identity,fullName:"Different"}])("conflicting identity %#",async existing=>{
 const {tx,deps}=setup(existing);
 await expect(provisionAdministrator(options,deps)).rejects.toThrow("conflicts");expect(tx.create).not.toHaveBeenCalled();
});
test("existing administrator unchanged without duplicate audit",async()=>{
 const {tx,deps}=setup(identity);
 await expect(provisionAdministrator(options,deps)).resolves.toEqual({action:"existing",identity});expect(tx.create).not.toHaveBeenCalled();
});
test.each([{projectId:""},{uid:""},{uid:"bad/path"},{fullName:""},{operator:""},{dryRun:undefined}])("invalid option %# before Auth",async override=>{
 const {deps}=setup();
 await expect(provisionAdministrator({...options,...override} as ProvisionOptions,deps)).rejects.toThrow();
 expect(deps.getUser).not.toHaveBeenCalled();
});
test("invalid timestamp rejected",async()=>{
 const {tx,deps}=setup();deps.now=()=>"bad";
 await expect(provisionAdministrator(options,deps)).rejects.toThrow();expect(tx.create).not.toHaveBeenCalled();
});
const args=["--project",options.projectId,"--uid","target","--full-name","Test","--operator",options.operator];
test("CLI defaults dry run; explicit apply required",()=>{
 expect(parseArgs(args)).toEqual({...options,dryRun:true});expect(parseArgs([...args,"--apply"])).toEqual(options);
});
test.each([[],["--uid","target"],[...args,"--apply","--dry-run"],[...args,"--unknown"],[...args,"--uid","other"]].map(argv => ({ argv })))("CLI rejects ambiguous/incomplete %#",({argv})=>{
 expect(()=>parseArgs(argv)).toThrow();
});
test("transaction retries reevaluate conflicts before writing",async()=>{
 const {deps,db,tx}=setup();
 db.runTransaction.mockImplementationOnce(async callback=>{
   await callback(tx); // SDK discards this first attempt before retry.
   tx.create.mockClear();
   tx.get.mockResolvedValue({exists:true,data:()=>({...identity,role:"patient"})});
   return callback(tx);
 });
 await expect(provisionAdministrator(options,deps)).rejects.toThrow("conflicts");
 expect(tx.create).not.toHaveBeenCalled();
});
