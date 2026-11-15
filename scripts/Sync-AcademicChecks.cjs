'use strict';
// Refresh source in an existing disposable dependency-equipped workspace only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const source=path.resolve(__dirname,'..'),target=path.resolve(process.argv[2]||'.');
if(process.version!=='v22.23.3'||process.argv.length!==3||!target.startsWith(path.resolve(os.tmpdir())+path.sep)||target===source)throw Error('Node 22.23.3 and an existing disposable TEMP workspace are required');
if(!fs.realpathSync(target).startsWith(fs.realpathSync(os.tmpdir())+path.sep))throw Error('Workspace must resolve inside TEMP');
for(const dir of ['functions','mobile']){
 if(!fs.existsSync(path.join(target,dir,'node_modules'))||fs.readdirSync(path.join(target,dir)).some(n=>/^\.env($|\.)/.test(n)&&n!=='.env.example'))throw Error('Dependency-equipped workspace without private environments required');
 if(!fs.readFileSync(path.join(source,dir,'package-lock.json')).equals(fs.readFileSync(path.join(target,dir,'package-lock.json'))))throw Error('Dependency lock changed; install locked dependencies in a fresh disposable workspace first');
}
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:source,maxBuffer:10e6}).toString().split('\0').filter(Boolean).filter(f=>{
 const base=path.posix.basename(f);
 return !/(^|\/)(?:node_modules|\.git|\.vscode|\.expo|\.firebase|\.academic-test)(\/|$)/.test(f)
  &&! /^(?:mobile\/android|functions\/lib|emulator-demo-backup)(\/|$)/.test(f)
  &&!(/(^|\.)env(?:$|\.)/.test(base)&&!base.endsWith('.env.example')&&base!=='.env.example')
  &&! /service.?account|firebase-adminsdk|^credentials\.json$|application_default_credentials/i.test(base)
  &&! /\.(?:log|zip|apk|aab|bak|tmp|pem|key|p12|pfx|jks|keystore)$/.test(f);
});
const manifest=[];
for(const file of files){const origin=path.join(source,file),dest=path.join(target,file);if(!fs.lstatSync(origin).isFile()||fs.lstatSync(origin).isSymbolicLink())throw Error('Regular source files only');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(origin,dest);manifest.push({path:file,sha256:crypto.createHash('sha256').update(fs.readFileSync(origin)).digest('hex')});}
fs.writeFileSync(path.join(target,'.calladoc-academic-checks.json'),JSON.stringify({purpose:'academic-admission-isolation-v1',source,files:manifest},null,2));
console.log(JSON.stringify({workspace:target,sourceFiles:files.length,dependenciesChanged:false,testsExecuted:false}));
