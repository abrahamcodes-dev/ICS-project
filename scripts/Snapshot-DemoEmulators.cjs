'use strict';
// Export only. Never stops services, clears data, imports a snapshot or overwrites
// a previous backup. Auth exports contain credentials: keep outside Git.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
if(process.version!=='v22.23.3')throw Error('Use installed Node 22.23.3.');
if(process.argv.length!==2)throw Error('No arguments accepted; a new private TEMP snapshot is always used.');
const project='demo-calladoc',headers={Authorization:'Bearer owner'};
async function json(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Local export HTTP '+r.status+' at '+new URL(url).pathname);return r.json();}
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async()=>{
 const hub=await json('http://127.0.0.1:4400/emulators');
 for(const [name,port]of Object.entries({auth:9099,firestore:8080,functions:5001,storage:9199}))
  if(hub[name]?.host!=='127.0.0.1'||hub[name]?.port!==port)throw Error('Expected complete local demo suite unavailable: '+name);
 const accounts=await json(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?maxResults=-1`,{headers});
 if(!Array.isArray(accounts.users))throw Error('Auth export is not a complete account list.');
 const config=await json(`http://127.0.0.1:9099/emulator/v1/projects/${project}/config`,{headers});
 const destination=fs.mkdtempSync(path.join(os.tmpdir(),'calladoc-demo-snapshot-'));
 for(const dir of ['auth_export','storage_export'])fs.mkdirSync(path.join(destination,dir),{mode:0o700});
 fs.writeFileSync(path.join(destination,'auth_export/accounts.json'),JSON.stringify(accounts));
 fs.writeFileSync(path.join(destination,'auth_export/config.json'),JSON.stringify(config));
 const post=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
 const firestore=await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${project}:export`,post({database:`projects/${project}/databases/(default)`,export_directory:destination,export_name:'firestore_export'}));
 if(!firestore.ok)throw Error('Firestore export failed; partial snapshot must not be imported.');
 const storage=await fetch('http://127.0.0.1:9199/internal/export',post({path:path.join(destination,'storage_export'),initiatedBy:'snapshot-safe-restart'}));
 if(!storage.ok)throw Error('Storage export failed; partial snapshot must not be imported.');
 await storage.arrayBuffer();
 const required=['auth_export/accounts.json','auth_export/config.json','firestore_export/firestore_export.overall_export_metadata','storage_export/buckets.json'];
 for(const file of required)if(!fs.statSync(path.join(destination,file)).isFile())throw Error('Snapshot missing '+file);
 const after=await json(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?maxResults=-1`,{headers});
 if(JSON.stringify(accounts.users.map(u=>u.localId).sort())!==JSON.stringify((after.users||[]).map(u=>u.localId).sort()))throw Error('Account membership changed during snapshot; create another snapshot after clients are idle.');
 const metadata={version:'15.32.0',auth:{version:'15.32.0',path:'auth_export'},firestore:{version:'1.22.0',path:'firestore_export',metadata_file:'firestore_export/firestore_export.overall_export_metadata'},storage:{version:'15.32.0',path:'storage_export'}};
 fs.writeFileSync(path.join(destination,'firebase-export-metadata.json'),JSON.stringify(metadata,null,2));
 const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.isFile())files.push(path.relative(destination,file).split(path.sep).join('/'));else throw Error('Unexpected link in snapshot.');}}walk(destination);
 const manifest={complete:true,projectId:project,createdAt:new Date().toISOString(),accounts:accounts.users.length,
  jamesMwangiPresent:accounts.users.some(u=>u.email==='doctor.test@calladoc.example'),
  storageBlobs:fs.readdirSync(path.join(destination,'storage_export/blobs')).length,
  hashes:Object.fromEntries(files.map(file=>[file,digest(path.join(destination,file))]))};
 // Completion marker is written last. Restart helper checks every recorded hash.
 fs.writeFileSync(path.join(destination,'snapshot-manifest.json'),JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({snapshot:destination,accounts:manifest.accounts,jamesMwangiPresent:manifest.jamesMwangiPresent,storageBlobs:manifest.storageBlobs,complete:true}));
})().catch(e=>{console.error('Snapshot NOT verified; do not stop or restart services. '+e.message);process.exitCode=1;});
