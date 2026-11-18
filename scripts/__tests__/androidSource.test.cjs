'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const vm=require('node:vm');
const {createGuard,preflight}=require('../../mobile/scripts/checkAndroidSource.cjs');
const dependencies=fs.realpathSync(path.resolve(__dirname,'../../mobile/node_modules'));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'calladoc-entry-check-')),mobile=path.join(root,'mobile');
 const names=['index.js','App.tsx','src/i18n/locale.ts','src/i18n/react.tsx','src/i18n/nativeLocale.ts','metro.config.cjs','scripts/checkAndroidSource.cjs','package.json'];
 for(const name of names){const p=path.join(mobile,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,name==='package.json'?JSON.stringify({name:'entry-fixture',main:'index.js'}):'export default {};\n');}
 fs.symlinkSync(dependencies,path.join(mobile,'node_modules'),'junction');
 const manifest={root,files:names.map(name=>({path:'mobile/'+name,sha256:hash(path.join(mobile,name))}))};
 return {root,mobile,manifest,guard:createGuard(manifest,dependencies)};
}
test('Expo resolves an app-owned entry with external junctioned dependencies',()=>{
 const f=fixture(),result=preflight(f.manifest,dependencies);assert.equal(result.entry,path.join(f.mobile,'index.js'));
 assert.equal(result.filesVerified,8);
});
test('guard accepts approved application and verified external dependency files',()=>{
 const f=fixture();assert.equal(f.guard.assertFile(path.join(f.mobile,'App.tsx')),path.join(f.mobile,'App.tsx'));
 assert.doesNotThrow(()=>f.guard.assertFile(path.join(dependencies,'expo/AppEntry.js')));
});
test('guard rejects another workspace application even if its content matches',()=>{
 const f=fixture(),other=fixture();assert.throws(()=>f.guard.assertFile(path.join(other.mobile,'App.tsx')),/outside approved snapshot/);
});
test('guard rejects unlisted and altered application sources',()=>{
 const f=fixture();fs.writeFileSync(path.join(f.mobile,'extra.js'),'export default {};');
 assert.throws(()=>f.guard.assertFile(path.join(f.mobile,'extra.js')),/outside approved snapshot/);
 fs.appendFileSync(path.join(f.mobile,'App.tsx'),'// changed');assert.throws(()=>f.guard.assertFile(path.join(f.mobile,'App.tsx')),/hash mismatch/);
});
test('complete preflight rejects missing copied files',()=>{
 const f=fixture();f.manifest.files.push({path:'mobile/missing.js',sha256:'missing'});
 assert.throws(()=>preflight(f.manifest,dependencies));
});
test('source-map guard requires new locale wiring and rejects stale or foreign sources',()=>{
 const f=fixture(),names=['/index.js','/App.tsx','/src/i18n/locale.ts','/src/i18n/react.tsx','/src/i18n/nativeLocale.ts'];
 const map={sources:names,sourcesContent:names.map(name=>fs.readFileSync(path.join(f.mobile,name.slice(1)),'utf8'))};
 assert.equal(f.guard.verifySourceMap(map).applicationSources,5);
 assert.throws(()=>f.guard.verifySourceMap({...map,sourcesContent:map.sourcesContent.map((v,i)=>i===2?'old code':v)}),/Bundled source mismatch/);
 assert.throws(()=>f.guard.verifySourceMap({sources:names.slice(0,-1),sourcesContent:map.sourcesContent.slice(0,-1)}),/Required bundled application source missing/);
 assert.throws(()=>f.guard.verifySourceMap({...map,sources:names.map((name,i)=>i===1?'/foreign/checks/mobile/App.tsx':name)}));
});
test('resolver guard rejects source files returned from the wrong application root',()=>{
 const f=fixture(),other=fixture();assert.throws(()=>f.guard.assertResolution({type:'sourceFile',filePath:path.join(other.mobile,'App.tsx')}),/outside approved snapshot/);
 assert.doesNotThrow(()=>f.guard.assertResolution({type:'sourceFile',filePath:path.join(dependencies,'expo/AppEntry.js')}));
 assert.doesNotThrow(()=>f.guard.assertResolution({type:'sourceFile',filePath:'\0polyfill:assets-registry'}));
 assert.throws(()=>f.guard.assertResolution({type:'sourceFile',filePath:'\0unknown-application'}));
});
test('installed Metro resolves the four critical local modules inside the snapshot',()=>{
 const f=fixture(),{resolve}=require(path.join(dependencies,'metro-resolver'));
 function local(origin,name){
  const context={originModulePath:origin,sourceExts:['js','jsx','ts','tsx','json'],preferNativePlatform:true,assetExts:new Set(),mainFields:['react-native','browser','main'],nodeModulesPaths:[],disableHierarchicalLookup:false,allowHaste:false,customResolverOptions:{},getPackageForModule:()=>null,redirectModulePath:p=>p,doesFileExist:p=>fs.existsSync(p)&&fs.statSync(p).isFile(),fileSystemLookup:p=>{if(!fs.existsSync(p))return {exists:false};return {exists:true,type:fs.statSync(p).isDirectory()?'d':'f',realPath:fs.realpathSync(p)};}};
  return f.guard.assertResolution(resolve(context,name,'android')).filePath;
 }
 assert.equal(local(path.join(f.mobile,'index.js'),'./App'),path.join(f.mobile,'App.tsx'));
 for(const name of ['locale','react','nativeLocale'])assert.equal(local(path.join(f.mobile,'App.tsx'),'./src/i18n/'+name),path.join(f.mobile,'src/i18n',name+(name==='react'?'.tsx':'.ts')));
});
test('hosted production Metro configuration fails closed without source-boundary settings',()=>{
 const code=fs.readFileSync(path.resolve(__dirname,'../../mobile/metro.config.cjs'),'utf8');
 const mockRequire=name=>name==='expo/metro-config'?{getDefaultConfig:()=>({resolver:{}})}:name==='./scripts/checkAndroidSource.cjs'?{createGuard,preflight}:require(name);
 assert.throws(()=>vm.runInNewContext(code,{require:mockRequire,__dirname:fixture().mobile,module:{exports:{}},process:{env:{CALLADOC_APP_VARIANT:'academic-demo',NODE_ENV:'production'}}}),/requires a source manifest/);
});

function sourceMapFixture(){
 const f=fixture(),names=['/index.js','/App.tsx','/src/i18n/locale.ts','/src/i18n/react.tsx','/src/i18n/nativeLocale.ts'];
 return {...f,map:{sources:names,sourcesContent:names.map(name=>fs.readFileSync(path.join(f.mobile,name.slice(1)),'utf8'))}};
}
function addPng(f){
 const file=path.join(f.mobile,'assets/test.png');fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,Buffer.from('89504e470d0a1a0a00000000','hex'));
 f.manifest.files.push({path:'mobile/assets/test.png',sha256:hash(file)});
 f.guard=createGuard(f.manifest,dependencies);f.map.sources.push('/assets/test.png');f.map.sourcesContent.push('');return file;
}
test('Metro PNG entries resolve under mobile/assets and verify binary inventory hashes',()=>{
 const f=sourceMapFixture(),file=addPng(f),result=f.guard.verifySourceMap(f.map);
 assert.equal(result.applicationSources,5);assert.equal(result.staticAssets,1);assert.equal(result.unresolvedEntries,0);
 assert.equal(result.records.find(r=>r.kind==='asset').sha256,hash(file));
});
test('Windows absolute application and asset paths remain inside the approved root',()=>{
 const f=sourceMapFixture(),file=addPng(f);
 f.map.sources[1]=path.join(f.mobile,'App.tsx');f.map.sources[5]=file;
 assert.equal(f.guard.verifySourceMap(f.map).staticAssets,1);
 const other=fixture();f.map.sources[1]=path.join(other.mobile,'App.tsx');
 assert.throws(()=>f.guard.verifySourceMap(f.map),/outside approved snapshot/);
});
test('assets are not exempt from missing, unlisted, stale or unexpected-content rejection',()=>{
 const f=sourceMapFixture(),file=addPng(f);
 f.map.sourcesContent[5]='injected JS';assert.throws(()=>f.guard.verifySourceMap(f.map),/Invalid PNG asset/);f.map.sourcesContent[5]='';
 fs.appendFileSync(file,'changed');assert.throws(()=>f.guard.verifySourceMap(f.map),/hash mismatch/);
 f.map.sources[5]='/assets/not-listed.png';assert.throws(()=>f.guard.verifySourceMap(f.map));
});
test('asset paths cannot hide application source content',()=>{
 const f=sourceMapFixture();fs.mkdirSync(path.join(f.mobile,'assets'));const file=path.join(f.mobile,'assets/hidden.ts');fs.writeFileSync(file,'export const hidden=true;');
 f.manifest.files.push({path:'mobile/assets/hidden.ts',sha256:hash(file)});f.guard=createGuard(f.manifest,dependencies);
 f.map.sources.push('/assets/hidden.ts');f.map.sourcesContent.push('');assert.throws(()=>f.guard.verifySourceMap(f.map),/Bundled source mismatch/);
});
test('application and asset traversal, encoded and malformed paths fail closed',()=>{
 for(const bad of ['/assets/../App.tsx','/assets/%2e%2e/App.tsx','/assets/test.png?query','/assets/test.png#fragment','//server/share/App.tsx','C:relative.ts','/assets\\test.png','\0unknown']){
  const f=sourceMapFixture();f.map.sources[1]=bad;assert.throws(()=>f.guard.verifySourceMap(f.map),undefined,bad);
 }
});
test('old dependency-workspace application contamination is rejected regardless of matching filename/content',()=>{
 for(const bad of ['/calladoc-phase3a-cYg7rZ/checks/mobile/App.tsx','/../../calladoc-phase3a-cYg7rZ/checks/mobile/src/i18n/locale.ts']){
  const f=sourceMapFixture();f.map.sources[1]=bad;assert.throws(()=>f.guard.verifySourceMap(f.map));
 }
});
test('source maps validate actual dependency roots rather than ignoring node_modules substrings',()=>{
 const f=sourceMapFixture();f.map.sources.push('/node_modules/expo/AppEntry.js');f.map.sourcesContent.push(fs.readFileSync(path.join(dependencies,'expo/AppEntry.js'),'utf8'));
 assert.equal(f.guard.verifySourceMap(f.map).dependencyEntries,1);
 f.map.sources[5]='/foreign/node_modules/expo/AppEntry.js';assert.throws(()=>f.guard.verifySourceMap(f.map),/outside verified directory/);
 f.map.sources[5]='/node_modules/expo/../../App.tsx';assert.throws(()=>f.guard.verifySourceMap(f.map),/Dependency path traversal/);
});
test('generated prelude is checked against installed production Metro output',()=>{
 const f=sourceMapFixture(),prelude=require(path.join(dependencies,'metro/src/lib/getPreludeCode.js')).default;
 f.map.sources.push('__prelude__');f.map.sourcesContent.push(prelude({isDev:false,globalPrefix:'',extraVars:{},requireCycleIgnorePatterns:[],unstable_forceFullRefreshPatterns:[]}));
 assert.equal(f.guard.verifySourceMap(f.map).virtualEntries,1);
 f.map.sourcesContent[5]+='injected';assert.throws(()=>f.guard.verifySourceMap(f.map),/Unexpected virtual source content/);
});
test('known Expo virtual modules must have the exact supported producer content',()=>{
 const f=sourceMapFixture();f.map.sources.push('\0polyfill:assets-registry');f.map.sourcesContent.push('const assets=[];module.exports={registerAsset:s=>assets.push(s),getAssetByID:s=>assets[s-1]};');
 assert.equal(f.guard.verifySourceMap(f.map).virtualEntries,1);f.map.sourcesContent[5]='arbitrary';assert.throws(()=>f.guard.verifySourceMap(f.map),/Unexpected virtual source content/);
});
test('unexpected source roots and incomplete map entries are rejected',()=>{
 const f=sourceMapFixture();assert.throws(()=>f.guard.verifySourceMap({...f.map,sourceRoot:'/foreign'}),/Unsupported/);
 assert.throws(()=>f.guard.verifySourceMap({...f.map,sourcesContent:f.map.sourcesContent.slice(1)}),/Incomplete/);
});
test('Metro UTF-8 serialization preserves strict approved raw bytes and rejects different decoded content',()=>{
 const f=sourceMapFixture(),file=path.join(f.mobile,'App.tsx'),bytes=Buffer.concat([Buffer.from('export default "1'),Buffer.from([0x96]),Buffer.from('10";')]);
 fs.writeFileSync(file,bytes);f.manifest.files.find(r=>r.path==='mobile/App.tsx').sha256=hash(file);f.guard=createGuard(f.manifest,dependencies);f.map.sourcesContent[1]=bytes.toString('utf8');
 assert.equal(f.guard.verifySourceMap(f.map).utf8SerializationChanges,1);
 f.map.sourcesContent[1]=f.map.sourcesContent[1].replace('\ufffd','-');assert.throws(()=>f.guard.verifySourceMap(f.map),/Bundled source mismatch/);
 f.map.sourcesContent[1]=bytes.toString('utf8');fs.appendFileSync(file,'changed');assert.throws(()=>f.guard.verifySourceMap(f.map),/hash mismatch/);
});
