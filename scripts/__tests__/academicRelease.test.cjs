'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {collectRuntime}=require('../Prepare-AcademicRelease.cjs');
const {validProject,inspect,digest,requireDeploymentApproval}=require('../Check-AcademicRelease.cjs');
const ts=require('../../functions/node_modules/typescript');
function fixture(modules={'index.js':"require('./worker'); require('node:crypto');",'worker.js':'exports.ok=true;'}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'calladoc-release-check-'));
  for(const [file,body]of Object.entries(modules)){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);}
  return root;
}
test('project gate rejects existing, emulator and malformed targets',()=>{
  for(const id of ['calladoc-2c05a','demo-calladoc','demo-test-academic-demo','../bad-academic-demo','A-academic-demo','a'.repeat(31)+'-academic-demo'])assert.equal(validProject(id),false);
  assert.equal(validProject('calladoc-qa-academic-demo'),true);
});
test('only reachable runtime modules are selected; stale and inactive outputs stay out',()=>{
  const dir=fixture();fs.writeFileSync(path.join(dir,'unused.js'),'exports.stale=true;');
  assert.deepEqual(collectRuntime(dir,{},ts).files,['index.js','worker.js']);
});
test('legacy verification and emulator imports fail closed',()=>{
  for(const spec of ['./verification/reviewVerification','./auth/onUserCreate','./c6-emulator/index','./feature-emulator/index']){
    const dir=fixture({'index.js':`require('${spec}');`});assert.throws(()=>collectRuntime(dir,{},ts),/Inactive\/test module/);
  }
});
test('computed and escaping runtime imports are rejected',()=>{
  assert.throws(()=>collectRuntime(fixture({'index.js':'require(process.env.MODULE);'}),{},ts),/Computed require/);
  assert.throws(()=>collectRuntime(fixture({'index.js':"require('../outside');"}),{},ts),/leaves compilation/);
});
test('undeclared production dependency is rejected',()=>{
  assert.throws(()=>collectRuntime(fixture({'index.js':"require('firebase-tools');"}),{},ts),/Undeclared runtime dependency/);
});
function releaseFixture(){
  const root=fixture({'functions/lib/index.js':'exports.ok=true;',
    'verify-release.cjs':'// verifier fixture',
    'firestore.rules':"function academicAdmission() {} function isSignedIn() { return request.auth != null && academicAdmission(); }",
    'firestore.indexes.json':'{}',
    'storage.rules':'allow read, write: if false;',
    'functions/package.json':JSON.stringify({main:'lib/index.js',engines:{node:'22'},scripts:{'gcp-build':''}}),
    'functions/package-lock.json':'{}',
    'firebase.json':JSON.stringify({firestore:{predeploy:['node verify-release.cjs']},storage:{predeploy:['node verify-release.cjs']},functions:[{source:'functions',runtime:'nodejs22',predeploy:['node verify-release.cjs']}]})});
  const names=['functions/lib/index.js','functions/package.json','functions/package-lock.json','firebase.json','verify-release.cjs','firestore.rules','firestore.indexes.json','storage.rules'];
  fs.writeFileSync(path.join(root,'release-inventory.json'),JSON.stringify({kind:'calladoc-academic-release-v1',project:'calladoc-qa-academic-demo',files:names.map(file=>({path:file,sha256:digest(path.join(root,file))}))}));
  return root;
}
test('inventory detects runtime byte tampering',()=>{
  const root=releaseFixture();assert.equal(inspect(root).inventoryVerified,true);
  fs.appendFileSync(path.join(root,'functions/lib/index.js'),'// changed');assert.throws(()=>inspect(root),/changed/);
});
test('unlisted credentials, backups and test outputs are rejected',()=>{
  for(const file of ['.env.local','service-account.json','backup.json','lib/c6-emulator/index.js']){
    const root=releaseFixture(),target=path.join(root,'functions',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'synthetic');
    assert.throws(()=>inspect(root),/Unexpected file/);
  }
});
test('deployment is blocked even when the inventory is valid',()=>{
  assert.equal(inspect(releaseFixture()).deployable,false);assert.throws(requireDeploymentApproval,/Hosted deployment blocked/);
});
test('escaping and duplicate inventory records are rejected',()=>{
  for(const escape of [true,false]){
    const root=releaseFixture(),file=path.join(root,'release-inventory.json'),inventory=JSON.parse(fs.readFileSync(file));
    if(escape)inventory.files[0].path='../outside.js';else inventory.files.push(inventory.files[0]);
    fs.writeFileSync(file,JSON.stringify(inventory));assert.throws(()=>inspect(root),/Invalid or duplicate/);
  }
});
test('Rules-only deployments cannot omit the same predeploy guard',()=>{
  for(const service of ['firestore','storage']){
    const root=releaseFixture(),configFile=path.join(root,'firebase.json'),inventoryFile=path.join(root,'release-inventory.json');
    const config=JSON.parse(fs.readFileSync(configFile));delete config[service].predeploy;fs.writeFileSync(configFile,JSON.stringify(config));
    const inventory=JSON.parse(fs.readFileSync(inventoryFile));inventory.files.find(x=>x.path==='firebase.json').sha256=digest(configFile);
    fs.writeFileSync(inventoryFile,JSON.stringify(inventory));assert.throws(()=>inspect(root),/Rules predeploy guard missing/);
  }
});
test('raw working-tree deployment has no clean-release bypass',()=>{
  assert.throws(()=>inspect(fixture()),/Raw working-tree deployment is blocked/);
});
test('hosted Rule generation preserves the local source and inserts admission',()=>{
 const {hostedFirestore,hostedStorage}=require('../AcademicRules.cjs');
 const local=fs.readFileSync(path.join(__dirname,'../../functions/firestore.rules'),'utf8');
 const result=hostedFirestore(local);assert.ok(result.includes('&& academicAdmission()'));assert.ok(result.includes('m.expiresAt > request.time'));assert.ok(result.includes('m.noticeVersion'));
 assert.equal(fs.readFileSync(path.join(__dirname,'../../functions/firestore.rules'),'utf8'),local);
 assert.match(hostedStorage,/allow read, write: if false/);
 assert.throws(()=>hostedFirestore(local.replace('return request.auth != null;','return true;')),/insertion point/);
});
test('release rejects missing Rules and a local-only Firestore artifact',()=>{
 const root=releaseFixture(),manifest=path.join(root,'release-inventory.json');let v=JSON.parse(fs.readFileSync(manifest));v.files=v.files.filter(x=>x.path!=='storage.rules');fs.writeFileSync(manifest,JSON.stringify(v));assert.throws(()=>inspect(root),/Required release file missing/);
 const next=releaseFixture();fs.writeFileSync(path.join(next,'firestore.rules'),'function isSignedIn() {return true;}');v=JSON.parse(fs.readFileSync(path.join(next,'release-inventory.json')));v.files.find(x=>x.path==='firestore.rules').sha256=digest(path.join(next,'firestore.rules'));fs.writeFileSync(path.join(next,'release-inventory.json'),JSON.stringify(v));assert.throws(()=>inspect(next),/admission guard missing/);
});
test('owner tool validates project, future expiry and explicit bootstrap acknowledgement offline',()=>{
 const {parseArgs}=require('../../functions/scripts/academicInvitations.cjs');
 const args=['--project','calladoc-qa-academic-demo','--email','synthetic@example.test','--expires-at','2099-01-01T00:00:00Z','--operator','synthetic-owner'];
 assert.equal(parseArgs(args).apply,false);assert.throws(()=>parseArgs([...args,'--bootstrap-admin-uid','admin']),/acknowledge/);
 assert.throws(()=>parseArgs(args.map(x=>x==='calladoc-qa-academic-demo'?'calladoc-2c05a':x)),/academic project/);
});
