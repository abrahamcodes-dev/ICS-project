'use strict';
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..'), workspace = path.dirname(root);
const markerPath = path.join(workspace, '.calladoc-regression.json');
if (process.versions.node.split('.')[0] !== '22' || !fs.existsSync(markerPath)) throw Error('Use Node 22 in a prepared disposable regression copy.');
const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
if (!marker.complete || marker.purpose !== 'calladoc-disposable-regression-v1' || path.resolve(marker.source) === workspace)
  throw Error('Refusing feature checks in the development tree.');
const dependencies=require('../../scripts/RegressionDependencies.cjs');
dependencies.verify(workspace,marker);
dependencies.materialise(workspace,marker,'functions');
if (fs.readdirSync(root).some(n => /^\.env($|\.)/.test(n) && n !== '.env.example')) throw Error('Feature gate refuses local environment files.');
const project = 'demo-calladoc-features-tests';
const ports = {auth: 9108, functions: 5108, firestore: 8108, storage: 9208, hub: 4428, logging: 4528, eventarc: 9308, tasks: 9508};
const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.features-test.json'), 'utf8'));
for (const [name,port] of Object.entries(ports)) if (config.emulators[name]?.host !== '127.0.0.1' || config.emulators[name]?.port !== port)
  throw Error('Feature emulator host/port isolation changed.');
if (config.functions.source !== 'lib/feature-emulator' || config.functions.runtime !== 'nodejs22'
  || JSON.stringify(config.functions.predeploy) !== JSON.stringify(["node -e \"throw new Error('Feature test Functions must never be deployed')\""])
  || config.firestore.rules !== 'firestore.rules' || config.firestore.indexes !== 'firestore.indexes.json' || config.storage.rules !== 'storage.rules')
  throw Error('Feature source/security configuration changed.');
const allowed = {consent: 'consent.test.ts', attachments: 'attachments.test.ts', deletion: 'deletion.test.ts'};
const selection = process.argv[2] || 'all';
if (process.argv.length > 3 || selection !== 'all' && !allowed[selection]) throw Error('Use all, consent, attachments or deletion.');
const env = {...process.env, DEBUG: '', GCLOUD_PROJECT: project, GOOGLE_CLOUD_PROJECT: project, GOOGLE_CLOUD_QUOTA_PROJECT: project,
  CHECKPOINT13_EMULATOR: project, CHECKPOINT14_EMULATOR: project, CHECKPOINT15_EMULATOR: project};
for (const k of Object.keys(env)) if (k.endsWith('_EMULATOR_HOST') || ['GOOGLE_APPLICATION_CREDENTIALS','FIREBASE_TOKEN','FIREBASE_CONFIG','FIREBASE_EMULATOR_HUB','CLOUD_STORAGE_EMULATOR_HOST'].includes(k)) delete env[k];
function run(script,args) {const result = spawnSync(process.execPath,[path.join(root,script),...args],{cwd:root,env,stdio:'inherit'}); if(result.error)throw result.error;if(result.status!==0)process.exit(result.status ?? 1);}
async function assertFree(port) {
  await new Promise((resolve,reject) => {const s=net.createServer();s.once('error',()=>reject(Error('Test port occupied; no process will be stopped: '+port)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});
}
(async()=>{
  for(const port of [...Object.values(ports),9158]) await assertFree(port);
  run('node_modules/typescript/bin/tsc',[]);
  const runtime=path.join(root,'lib/feature-emulator');fs.mkdirSync(runtime,{recursive:true});
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  fs.writeFileSync(path.join(runtime,'package.json'),JSON.stringify({name:'calladoc-feature-emulator-only',private:true,main:'index.cjs',engines:{node:'22'},dependencies:pkg.dependencies}));
  const expected={FUNCTIONS_EMULATOR:'true',GCLOUD_PROJECT:project,GOOGLE_CLOUD_QUOTA_PROJECT:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8108',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9108',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9208'};
  fs.writeFileSync(path.join(runtime,'index.cjs'),`'use strict';\nconst expected=${JSON.stringify(expected)};\nif(process.versions.node.split('.')[0]!=='22'||Object.entries(expected).some(([k,v])=>process.env[k]!==v)||process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.FIREBASE_TOKEN||JSON.parse(process.env.FIREBASE_CONFIG||'{}').projectId!==expected.GCLOUD_PROJECT)throw Error('Isolated feature runtime required');\nmodule.exports=require('../index.js');\n`);
  const filter=selection==='all'?'':' --runTestsByPath emulator-checks/'+allowed[selection];
  run('node_modules/firebase-tools/lib/bin/firebase.js',['emulators:exec','--only','auth,functions,firestore,storage','--project',project,'--config','firebase.features-test.json',
    'node node_modules/jest/bin/jest.js --config jest.features-emulator.config.js --runInBand'+filter]);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
