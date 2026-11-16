'use strict';
// Offline inventory verification. This checkpoint deliberately cannot deploy.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const approvedProject='calladoc-academic-demo';
function deploymentEnvironment(root,project){
  const file=path.join(root,'functions','.env.'+project);
  const expected={GOOGLE_SIGN_IN_WEB_CLIENT_ID:'307695796194-48q9nusdb0tqp0dj1g7cm3j9365bgg81.apps.googleusercontent.com',PAYMENT_SIMULATION_MODE:'academic-demo',PAYMENT_SIMULATION_PROJECT_ID:approvedProject};
  const lines=fs.readFileSync(file,'utf8').split(/\r?\n/).filter(x=>x&&!x.startsWith('#'));
  const entries=lines.map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];});
  if(entries.length!==3||new Set(entries.map(x=>x[0])).size!==3||entries.some(([k,v])=>expected[k]!==v))throw Error('Hosted environment must contain exactly the reviewed Google audience and server simulation settings.');
}
function validProject(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value)
    && value.endsWith('-academic-demo') && !value.startsWith('demo-');
}
function filesUnder(root) {
  const result = [];
  function walk(dir, prefix = '') {
    for (const item of fs.readdirSync(dir, {withFileTypes:true})) {
      const relative = prefix + item.name, file = path.join(dir, item.name);
      if (item.isSymbolicLink()) throw Error('Release links are not permitted.');
      if (relative === 'node_modules' && item.isDirectory()) continue;
      if (item.isDirectory()) walk(file, relative + '/');
      else if (item.isFile()) result.push(relative);
      else throw Error('Unexpected release file type.');
    }
  }
  walk(root); return result.sort();
}
function inspect(root) {
  root = path.resolve(root);
  if (!fs.existsSync(path.join(root,'release-inventory.json')))
    throw Error('Raw working-tree deployment is blocked. Use Prepare-AcademicRelease.cjs for offline preparation.');
  const inventory = JSON.parse(fs.readFileSync(path.join(root, 'release-inventory.json'), 'utf8'));
  if (inventory.kind !== 'calladoc-academic-release-v1' || !validProject(inventory.project))
    throw Error('A separate valid academic-demo release is required.');
  const seen = new Set();
  for (const record of inventory.files) {
    const file = path.resolve(root, record.path);
    if (!file.startsWith(root + path.sep) || record.path.includes('\\') || seen.has(record.path))
      throw Error('Invalid or duplicate inventory path.');
    seen.add(record.path);
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink() || digest(file) !== record.sha256)
      throw Error('Release file changed: ' + record.path);
  }
  for(const required of ['firebase.json','verify-release.cjs','firestore.rules','firestore.indexes.json','storage.rules','functions/lib/index.js','functions/package.json','functions/package-lock.json'])
    if(!seen.has(required))throw Error('Required release file missing: '+required);
  const firestore=fs.readFileSync(path.join(root,'firestore.rules'),'utf8'),storage=fs.readFileSync(path.join(root,'storage.rules'),'utf8');
  if(!firestore.includes('function academicAdmission()')||!firestore.includes('&& academicAdmission()'))throw Error('Hosted Firestore admission guard missing.');
  if(!storage.includes('allow read, write: if false;')||/allow (?:get|create|update|delete):/.test(storage))throw Error('Hosted Storage must deny direct access.');
  const expected = [...seen].filter(x => x.startsWith('functions/')).map(x => x.slice(10)).sort();
  const envName='.env.'+inventory.project;
  if(fs.existsSync(path.join(root,'functions',envName)))deploymentEnvironment(root,inventory.project);
  if (JSON.stringify(filesUnder(path.join(root,'functions')).filter(x=>x!==envName)) !== JSON.stringify(expected))
    throw Error('Unexpected file in Functions payload.');
  for (const file of expected) if (!['package.json','package-lock.json'].includes(file)
    && (!/^lib\/.+\.js$/.test(file) || /(^|\/)(?:__tests__|emulator-checks|c6-emulator|feature-emulator|scripts|backups?)(\/|$)/.test(file)))
    throw Error('Non-runtime payload file: ' + file);
  const pkg = JSON.parse(fs.readFileSync(path.join(root,'functions/package.json'),'utf8'));
  if (pkg.main !== 'lib/index.js' || pkg.engines.node !== '22' || pkg.devDependencies
    || JSON.stringify(pkg.scripts) !== JSON.stringify({'gcp-build':''})) throw Error('Unexpected runtime manifest.');
  const config = JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));
  if (config.functions.length !== 1 || config.functions[0].source !== 'functions'
    || config.functions[0].runtime !== 'nodejs22'
    || JSON.stringify(config.functions[0].predeploy) !== JSON.stringify(['node verify-release.cjs']))
    throw Error('Release predeploy guard missing.');
  for (const service of ['firestore','storage']) if (JSON.stringify(config[service]?.predeploy) !== JSON.stringify(['node verify-release.cjs']))
    throw Error('Rules predeploy guard missing: '+service);
  return {project:inventory.project, payloadFiles:expected.length,
    runtimeModules:expected.filter(x=>x.startsWith('lib/')).length, inventoryVerified:true, deployable:false};
}
function requireDeploymentApproval(result,root=process.cwd(),env=process.env) {
  // Phase 3B approved on 16 November 2026. No generic approval switch exists.
  // Firebase CLI supplies both values; raw worktrees still fail inventory checks.
  if(result?.project!==approvedProject||env.GCLOUD_PROJECT!==approvedProject||!env.PROJECT_DIR||path.resolve(env.PROJECT_DIR)!==path.resolve(root))
    throw Error('Hosted deployment blocked: only the explicitly approved academic project and verified release directory are permitted.');
  deploymentEnvironment(root,approvedProject);
}
module.exports = {validProject, filesUnder, digest, inspect, requireDeploymentApproval};
if (require.main === module) {
  try {
    if (process.version !== 'v22.23.3') throw Error('Use Node 22.23.3.');
    const args = process.argv.slice(2);
    if (args.length && (args[0] !== '--inventory-only' || args.length > 2)) throw Error('Use --inventory-only [release directory].');
    const result = inspect(args[1] || process.cwd());
    if (!args.length) requireDeploymentApproval(result,process.cwd());
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
