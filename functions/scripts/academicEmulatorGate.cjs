'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),{spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),fn=path.join(root,'functions');
async function main(){
 if(process.version!=='v22.23.3')throw Error('Node 22.23.3 required');
 const marker=JSON.parse(fs.readFileSync(path.join(root,'.calladoc-academic-checks.json'),'utf8'));
 if(marker.purpose!=='academic-admission-isolation-v1'||path.resolve(marker.source)===root)throw Error('Disposable source copy required');
 for(const item of marker.files)for(const base of [root,marker.source])if(crypto.createHash('sha256').update(fs.readFileSync(path.join(base,item.path))).digest('hex')!==item.sha256)throw Error('Source/workspace changed; resynchronize before execution');
 for(const dir of ['functions','mobile'])if(fs.readdirSync(path.join(root,dir)).some(n=>/^\.env($|\.)/.test(n)&&n!=='.env.example'))throw Error('Private environment in test copy');
 const config=JSON.parse(fs.readFileSync(path.join(fn,'firebase.academic-test.json'),'utf8'));
 const ports={auth:9111,firestore:8111,storage:9211,hub:4451,logging:4551};
 for(const [service,port] of Object.entries(ports)){
  if(config.emulators[service]?.host!=='127.0.0.1'||config.emulators[service]?.port!==port)throw Error('Isolation configuration changed');
  await new Promise((ok,no)=>{const server=net.createServer();server.once('error',no);server.listen(port,'127.0.0.1',()=>server.close(ok));});
 }
 if(config.emulators.ui.enabled!==false||config.functions)throw Error('Unexpected emulator services');
 if(config.emulators.firestore.websocketPort!==9167)throw Error('Unexpected websocket port');
 await new Promise((ok,no)=>{const server=net.createServer();server.once('error',no);server.listen(9167,'127.0.0.1',()=>server.close(ok));});
 const {hostedFirestore,hostedStorage}=require(path.join(root,'scripts/AcademicRules.cjs'));
 const generated=path.join(fn,'.academic-test');fs.mkdirSync(generated,{recursive:true});fs.writeFileSync(path.join(generated,'firestore.rules'),hostedFirestore(fs.readFileSync(path.join(fn,'firestore.rules'),'utf8')));fs.writeFileSync(path.join(generated,'storage.rules'),hostedStorage);
 const env={...process.env,PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH};
 for(const k of Object.keys(env))if(/^(GOOGLE_|GCLOUD_|FIREBASE_|EXPO_PUBLIC_|PAYMENT_SIMULATION_)/.test(k)||k.endsWith('_EMULATOR_HOST')||['FUNCTIONS_EMULATOR','NODE_OPTIONS'].includes(k))delete env[k];
 env.DEBUG='';env.CI='true';env.XDG_CONFIG_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'calladoc-academic-cli-'));env.GCLOUD_PROJECT='demo-calladoc-academic-tests';env.GOOGLE_CLOUD_PROJECT=env.GCLOUD_PROJECT;env.FUNCTIONS_EMULATOR='true';env.FIREBASE_CONFIG=JSON.stringify({projectId:env.GCLOUD_PROJECT,storageBucket:env.GCLOUD_PROJECT+'.appspot.com'});
 const result=spawnSync(process.execPath,['node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--only','auth,firestore,storage','--project',env.GCLOUD_PROJECT,'--config','firebase.academic-test.json','node node_modules/jest/bin/jest.js --config jest.academic-emulator.config.js --runInBand'],{cwd:fn,env,stdio:'inherit'});
 if(result.error)throw result.error;process.exitCode=result.status??1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
