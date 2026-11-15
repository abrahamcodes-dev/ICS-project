'use strict';
// Offline inventory verification. This checkpoint deliberately cannot deploy.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
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
  if (JSON.stringify(filesUnder(path.join(root,'functions'))) !== JSON.stringify(expected))
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
function requireDeploymentApproval() {
  // No environment flag or editable approval file bypasses this checkpoint.
  throw Error('Hosted deployment blocked: Phase 3B owner approval and Console prerequisites remain required.');
}
module.exports = {validProject, filesUnder, digest, inspect, requireDeploymentApproval};
if (require.main === module) {
  try {
    if (process.version !== 'v22.23.3') throw Error('Use Node 22.23.3.');
    const args = process.argv.slice(2);
    if (args.length && (args[0] !== '--inventory-only' || args.length > 2)) throw Error('Use --inventory-only [release directory].');
    const result = inspect(args[1] || process.cwd());
    if (!args.length) requireDeploymentApproval();
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
