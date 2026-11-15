'use strict';
// Fresh local compilation and reachability packaging; no Firebase API or SDK initialization.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {builtinModules}=require('node:module');
const {validProject,digest,inspect}=require('./Check-AcademicRelease.cjs');
const {hostedFirestore,hostedStorage}=require('./AcademicRules.cjs');
const repository=path.resolve(__dirname,'..');
function collectRuntime(compiled, dependencies, ts) {
  compiled=path.resolve(compiled); const found=new Set(),external=new Set();
  function visit(file) {
    file=path.resolve(file);
    if (!file.startsWith(compiled+path.sep)) throw Error('Runtime import leaves compilation directory.');
    const relative=path.relative(compiled,file).split(path.sep).join('/');
    if (/(^|\/)(?:__tests__|emulator-checks|c6-emulator|feature-emulator|scripts)(\/|$)/.test(relative)
      || ['auth/onUserCreate.js','verification/reviewVerification.js'].includes(relative)) throw Error('Inactive/test module reached: '+relative);
    if (found.has(relative)) return;
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw Error('Runtime module must be a regular file.');
    found.add(relative);
    const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    function walk(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source)==='require') {
        if (node.arguments.length!==1 || !ts.isStringLiteral(node.arguments[0])) throw Error('Computed require requires review: '+relative);
        const spec=node.arguments[0].text;
        if (spec.startsWith('.')) {
          let target=path.resolve(path.dirname(file),spec);
          if (!path.extname(target)) target+='.js';
          visit(target);
        } else {
          const name=spec.startsWith('@')?spec.split('/').slice(0,2).join('/'):spec.split('/')[0];
          if (!builtinModules.includes(spec.replace(/^node:/,'')) && !dependencies[name]) throw Error('Undeclared runtime dependency: '+name);
          external.add(name);
        }
      }
      if (ts.isCallExpression(node) && node.expression.kind===ts.SyntaxKind.ImportKeyword) throw Error('Dynamic import requires release review.');
      ts.forEachChild(node,walk);
    }
    walk(source);
  }
  visit(path.join(compiled,'index.js'));
  return {files:[...found].sort(),external:[...external].sort()};
}
function prepare(project) {
  if (process.version!=='v22.23.3') throw Error('Use Node 22.23.3.');
  if (!validProject(project)) throw Error('Supply a valid separate project ID ending in -academic-demo.');
  const source=path.join(repository,'functions'),pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
  const ts=require(path.join(source,'node_modules/typescript'));
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'calladoc-academic-build-'));
  const release=path.join(work,'release');fs.mkdirSync(release);
  const compiled=path.join(work,'compiled'),payload=path.join(release,'functions');
  execFileSync(process.execPath,[path.join(source,'node_modules/typescript/bin/tsc'),'--project',path.join(source,'tsconfig.json'),'--outDir',compiled],{stdio:'inherit'});
  const graph=collectRuntime(compiled,pkg.dependencies,ts);
  for (const file of graph.files) {
    const destination=path.join(payload,'lib',file);fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.copyFileSync(path.join(compiled,file),destination);
  }
  const runtime={name:pkg.name,version:pkg.version,private:true,main:'lib/index.js',engines:pkg.engines,
    scripts:{'gcp-build':''},dependencies:pkg.dependencies,overrides:pkg.overrides};
  fs.writeFileSync(path.join(payload,'package.json'),JSON.stringify(runtime,null,2)+'\n');
  fs.copyFileSync(path.join(source,'package-lock.json'),path.join(payload,'package-lock.json'));
  fs.copyFileSync(path.join(source,'firestore.indexes.json'),path.join(release,'firestore.indexes.json'));
  fs.writeFileSync(path.join(release,'firestore.rules'),hostedFirestore(fs.readFileSync(path.join(source,'firestore.rules'),'utf8')));
  fs.writeFileSync(path.join(release,'storage.rules'),hostedStorage);
  fs.copyFileSync(path.join(__dirname,'Check-AcademicRelease.cjs'),path.join(release,'verify-release.cjs'));
  const ignore=['node_modules','.git','.env','.env.*','*.local','*.log','coverage','__tests__','emulator-checks','scripts','backups','firebase-export-*','c6-emulator','feature-emulator'];
  const config={firestore:{rules:'firestore.rules',indexes:'firestore.indexes.json',predeploy:['node verify-release.cjs']},storage:{rules:'storage.rules',predeploy:['node verify-release.cjs']},
    functions:[{source:'functions',codebase:'default',runtime:'nodejs22',ignore,predeploy:['node verify-release.cjs']}]};
  fs.writeFileSync(path.join(release,'firebase.json'),JSON.stringify(config,null,2)+'\n');
  const names=['firebase.json','verify-release.cjs','firestore.rules','firestore.indexes.json','storage.rules',
    ...graph.files.map(x=>'functions/lib/'+x),'functions/package.json','functions/package-lock.json'];
  const inventory={kind:'calladoc-academic-release-v1',project,createdAt:new Date().toISOString(),
    sourceHead:execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim(),
    sourceDirty:!!execFileSync('git',['status','--porcelain'],{cwd:repository,encoding:'utf8'}).trim(),
    admissionAndPoliciesPending:true,externalModules:graph.external,
    files:names.sort().map(file=>({path:file,sha256:digest(path.join(release,file))}))};
  fs.writeFileSync(path.join(release,'release-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
  return {release,...inspect(release)};
}
module.exports={collectRuntime,prepare};
if (require.main===module) {
  try {
    if (process.argv.length!==4 || process.argv[2]!=='--project') throw Error('Usage: node scripts/Prepare-AcademicRelease.cjs --project <separate-id-academic-demo>');
    console.log(JSON.stringify(prepare(process.argv[3])));
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
