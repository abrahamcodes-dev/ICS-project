'use strict';
// Copies the current worktree, including intended untracked files. Never installs
// packages, follows private environment files, or changes the interactive suite.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {hashFile,tarBinary} = require('./RegressionDependencies.cjs');
const source = path.resolve(__dirname, '..');
if (process.version !== 'v22.23.3') throw Error('Select installed Node 22.23.3 before preparing regression.');
if (process.argv.length !== 2) throw Error('No arguments accepted; a new disposable TEMP directory is always used.');
function excluded(file) {
  const base = path.posix.basename(file);
  return /(^|\/)(?:\.git|node_modules|\.expo|\.firebase|\.gradle|coverage|\.cache|\.local|\.regression|tmp|temp)(\/|$)/.test(file)
    || /^(?:mobile\/android|functions\/lib|emulator-demo-backup|firebase-export-[^/]+|regression-workspaces)(\/|$)/.test(file)
    || /^\.env(?:$|\.)/.test(base) && base !== '.env.example'
    || /service.?account|firebase-adminsdk|^credentials\.json$|^application_default_credentials\.json$/i.test(base)
    || /\.(?:pem|key|p12|pfx|jks|keystore|log|apk|aab|bak|tmp|tsbuildinfo)$/.test(base)
    || file.startsWith('.vscode/');
}
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  {cwd: source, maxBuffer: 10 * 1024 * 1024}).toString().split('\0').filter(Boolean))].filter(p => !excluded(p)).sort();
for (const file of files) {
  if (path.isAbsolute(file) || file.split('/').includes('..') || !fs.lstatSync(path.join(source, file)).isFile())
    throw Error('Only regular worktree files may be copied: ' + file);
}
for (const dir of ['mobile', 'functions']) {
  const installed = path.join(source, dir, 'node_modules');
  if (!fs.existsSync(installed) || fs.lstatSync(installed).isSymbolicLink()) throw Error('A regular installed dependency directory is required: ' + dir);
}
const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'calladoc-regression-'));
const manifest = [];
console.log('Copying ' + files.length + ' intended worktree files to ' + destination);
for (const file of files) {
  const data = fs.readFileSync(path.join(source, file)), target = path.join(destination, file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, data, {flag: 'wx'});
  manifest.push({path: file, sha256: crypto.createHash('sha256').update(data).digest('hex')});
}
// Durable independent archives survive TEMP dependency-directory cleanup. The
// runner extracts private copies before each approved phase; never uses junctions.
const dependencyArchives={};
fs.mkdirSync(path.join(destination,'.regression-dependencies'));
for (const dir of ['mobile', 'functions']) {
  const from = path.join(source,dir,'node_modules'),archive=path.join(destination,'.regression-dependencies',dir+'.tar');
  console.log('Archiving independent installed dependencies: ' + dir);
  function checkLinks(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    if(['.cache','coverage','.gradle','.cxx'].includes(entry.name)||entry.name==='build'&&['android','ios'].includes(path.basename(folder)))continue;
    const file=path.join(folder,entry.name);
    if(entry.isSymbolicLink()){
      const link=fs.readlinkSync(file),resolved=path.resolve(path.dirname(file),link);
      if(path.isAbsolute(link)||!resolved.startsWith(from+path.sep))throw Error('External dependency link requires review: '+file);
    }else if(entry.isDirectory())checkLinks(file);
  }}
  checkLinks(from);
  execFileSync(tarBinary(),['-cf',archive,'--exclude=*/.cache','--exclude=*/coverage','--exclude=*/.gradle','--exclude=*/.cxx','--exclude=*/android/build','--exclude=*/ios/build','-C',path.join(source,dir),'node_modules'],{stdio:'inherit'});
  dependencyArchives[dir]={path:'.regression-dependencies/'+dir+'.tar',sha256:hashFile(archive),bytes:fs.statSync(archive).size};
  if(!dependencyArchives[dir].bytes)throw Error('Empty dependency archive.');
}
// The original gate remains unchanged and sees no Functions .env.local here.
const unexpectedEnv = fs.readdirSync(path.join(destination, 'functions')).filter(n => /^\.env($|\.)/.test(n) && n !== '.env.example');
if (unexpectedEnv.length) throw Error('Private environment file reached regression copy.');
for (const file of manifest) if (crypto.createHash('sha256').update(fs.readFileSync(path.join(source,file.path))).digest('hex') !== file.sha256)
  throw Error('Source changed during preparation; create a new copy: ' + file.path);
const marker = {complete: true, purpose: 'calladoc-disposable-regression-v1', source, preparedAt: new Date().toISOString(),
  node: process.version, dependencies: 'independent archive-backed copies; do not upgrade', dependencyArchives, files: manifest};
fs.writeFileSync(path.join(destination, '.calladoc-regression.json'), JSON.stringify(marker, null, 2));
console.log(JSON.stringify({workspace: destination, sourceFiles: manifest.length, node: process.version, testsExecuted: false}));
