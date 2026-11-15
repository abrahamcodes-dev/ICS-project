'use strict';
// Explicit single-phase runner. Preparation uses "plan" only; execution requires
// the operator's separate approval. Never installs packages or stops a process.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawnSync}=require('node:child_process');
const dependencies=require('./RegressionDependencies.cjs');
const root=path.resolve(__dirname,'..'),markerPath=path.join(root,'.calladoc-regression.json');
if(process.version!=='v22.23.3'||!fs.existsSync(markerPath))throw Error('Use installed Node 22.23.3 in a prepared disposable copy.');
const marker=JSON.parse(fs.readFileSync(markerPath,'utf8'));
if(!marker.complete||marker.purpose!=='calladoc-disposable-regression-v1'||path.resolve(marker.source)===root)throw Error('Development tree execution refused.');
dependencies.verify(root,marker);
for(const dir of ['mobile','functions'])if(fs.readdirSync(path.join(root,dir)).some(n=>/^\.env($|\.)/.test(n)&&n!=='.env.example'))throw Error('Private environment file in regression copy.');
const node=process.execPath,fn=path.join(root,'functions'),mobile=path.join(root,'mobile');
const jest='node_modules/jest/bin/jest.js',cli='node_modules/firebase-tools/lib/bin/firebase.js';
const projects={rules:'demo-calladoc-rules',storage:'demo-calladoc-credentials',integration:'demo-calladoc-integration',payments:'demo-calladoc-payments-tests',google:'demo-calladoc-google-test',features:'demo-calladoc-features-tests'};
const expected={
 rules:{firestore:8085,hub:4435,logging:4535},
 storage:{firestore:8095,storage:9195,hub:4415,logging:4515},
 integration:{auth:9105,functions:5105,firestore:8105,storage:9205,hub:4425,logging:4525,eventarc:9305,tasks:9505},
 payments:{auth:9106,functions:5106,firestore:8106,hub:4426,logging:4526,eventarc:9306,tasks:9506},
 google:{auth:9107,firestore:8107,hub:4427,logging:4527},
 features:{auth:9108,functions:5108,firestore:8108,storage:9208,hub:4428,logging:4528,eventarc:9308,tasks:9508},
};
const configs={rules:'firebase.rules-test.json',storage:'firebase.storage-test.json',integration:'firebase.integration-test.json',payments:'firebase.payments-test.json',google:'firebase.google-test.json',features:'firebase.features-test.json'};
for(const [phase,file]of Object.entries(configs)){
 const config=JSON.parse(fs.readFileSync(path.join(fn,file),'utf8'));
 for(const [service,port]of Object.entries(expected[phase]))if(config.emulators[service]?.host!=='127.0.0.1'||config.emulators[service]?.port!==port)throw Error('Unexpected isolated endpoint: '+phase+'/'+service);
 if(config.emulators.ui?.enabled!==false)throw Error('Test UI must be disabled.');
 if(config.functions&&(!config.functions.predeploy?.every(s=>s.includes('throw new Error'))||config.functions.runtime!=='nodejs22'))throw Error('Test deployment guard missing.');
}
const emulator=(phase,services,config)=>[cli,'emulators:exec','--only',services,'--project',projects[phase],'--config',configs[phase],`node ${jest} --config ${config} --runInBand`];
const commands={
 'mobile-types':{cwd:mobile,args:['node_modules/typescript/bin/tsc','--noEmit']},
 'mobile-jest':{cwd:mobile,args:[jest,'--runInBand']},
 'backend-build':{cwd:fn,args:['node_modules/typescript/bin/tsc']},
 'backend-types':{cwd:fn,args:['node_modules/typescript/bin/tsc','-p','__tests__/tsconfig.json','--noEmit']},
 'backend-jest':{cwd:fn,args:[jest,'--runInBand']},
 rules:{cwd:fn,args:emulator('rules','firestore','jest.rules.config.js')},
 storage:{cwd:fn,args:emulator('storage','firestore,storage','jest.storage.config.js')},
 integration:{cwd:fn,args:['scripts/integrationGate.cjs']},
 payments:{cwd:fn,args:emulator('payments','auth,functions,firestore','jest.payments-emulator.config.js')},
 google:{cwd:fn,args:emulator('google','auth,firestore','jest.google-emulator.config.js')},
 features:{cwd:fn,args:['scripts/featureEmulatorGate.cjs','all']},
};
const phase=process.argv[2]||'plan';
if(process.argv.length>3||phase!=='plan'&&!commands[phase])throw Error('Select plan or one documented regression phase.');
if(phase==='plan'){
 console.log(JSON.stringify({workspace:root,testsExecuted:false,dependencyArchivesVerified:true,commands,projects,ports:expected},null,2));
}else{
 const env={...process.env,PATH:path.dirname(node)+path.delimiter+process.env.PATH};
 for(const key of Object.keys(env))if(/^(?:GOOGLE_|GCLOUD_|FIREBASE_|EXPO_PUBLIC_|PAYMENT_SIMULATION_|CHECKPOINT\d+_EMULATOR)/.test(key)||key.endsWith('_EMULATOR_HOST')||['FUNCTIONS_EMULATOR','CLOUD_STORAGE_EMULATOR_HOST','CLOUD_EVENTARC_EMULATOR','CLOUD_TASKS_EMULATOR_HOST','NODE_OPTIONS'].includes(key))delete env[key];
 env.DEBUG='';env.FUNCTIONS_DISCOVERY_TIMEOUT='120';
 env.XDG_CONFIG_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'calladoc-test-cli-'));
 if(projects[phase])for(const key of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','GOOGLE_CLOUD_QUOTA_PROJECT'])env[key]=projects[phase];
 const {cwd,args}=commands[phase];
 (async()=>{
  dependencies.materialise(root,marker,phase.startsWith('mobile-')?'mobile':'functions');
  if(expected[phase]){
   const config=JSON.parse(fs.readFileSync(path.join(fn,configs[phase]),'utf8'));
   for(const port of [...Object.values(expected[phase]),config.emulators.firestore.websocketPort].filter(Boolean))await new Promise((resolve,reject)=>{
    const server=net.createServer();server.once('error',()=>reject(Error('Port occupied; refusing to attach or stop anything: '+port)));server.listen(port,'127.0.0.1',()=>server.close(resolve));
   });
  }
  const result=spawnSync(node,args,{cwd,env,stdio:'inherit'});if(result.error)throw result.error;process.exitCode=result.status??1;
 })().catch(e=>{console.error(e.message);process.exitCode=1;});
}
