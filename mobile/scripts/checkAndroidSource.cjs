'use strict';
// Read-only release source guard. Dependencies may live outside the snapshot;
// application code must be a hashed member of it, including after realpath.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
// Exact SDK 57 virtual IDs defined by withMetroMultiPlatform, not disk sources.
const virtualSources=new Set(['\0polyfill:external-require','\0polyfill:assets-registry','\0polyfill:environment-variables']);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inside=(root,file)=>file===root||(!path.relative(root,file).startsWith('..'+path.sep)&&path.relative(root,file)!=='..'&&!path.isAbsolute(path.relative(root,file)));

function createGuard(manifest,dependencyRoot) {
  const root=fs.realpathSync(manifest.root),mobile=path.join(root,'mobile');
  const dependencies=fs.realpathSync(dependencyRoot);
  if(path.basename(dependencies)!=='node_modules')throw Error('Expected verified node_modules directory');
  if(inside(dependencies,root)||inside(root,dependencies))throw Error('Dependency source must be separate from application snapshot');
  const files=new Map();
  for(const record of manifest.files){
    const file=path.resolve(root,record.path);
    if(!inside(root,file)||files.has(file))throw Error('Invalid source inventory');
    files.set(file,record.sha256);
  }
  function assertFile(file) {
    const real=fs.realpathSync(file);
    if(inside(dependencies,real))return real;
    if(!inside(root,real)||!files.has(real))throw Error('Application source outside approved snapshot: '+real);
    if(digest(real)!==files.get(real))throw Error('Application source hash mismatch: '+real);
    return real;
  }
  function assertResolution(resolution) {
    if(resolution.type==='sourceFile'&&!virtualSources.has(resolution.filePath))assertFile(resolution.filePath);
    if(resolution.type==='assetFiles')resolution.filePaths.forEach(assertFile);
    return resolution;
  }
  function verifySourceMap(map) {
    const seen=new Set(),assets=new Set(),records=[];
    let common=mobile;
    while(!inside(common,dependencies)){
      const parent=path.dirname(common);
      if(parent===common)throw Error('No common source-map root');
      common=parent;
    }
    const virtualContent=new Map([
      ['\0polyfill:assets-registry','const assets=[];module.exports={registerAsset:s=>assets.push(s),getAssetByID:s=>assets[s-1]};'],
      ['\0polyfill:environment-variables','//'],
      ['\0polyfill:external-require','try { global.$$require_external = typeof expo === "undefined" ? require : (moduleId) => { throw new Error(`Node.js standard library module ${moduleId} is not available in this JavaScript environment`);} } catch { global.$$require_external = (moduleId) => { throw new Error(`Node.js standard library module ${moduleId} is not available in this JavaScript environment`);} }'],
    ]);
    const sdk=fs.readFileSync(path.join(dependencies,'expo/node_modules/@expo/cli/build/src/start/server/metro/withMetroMultiPlatform.js'),'utf8');
    for(const content of virtualContent.values())if(!sdk.includes(content))throw Error('Installed Expo virtual-source definition differs');
    const prelude=require(path.join(dependencies,'metro/src/lib/getPreludeCode.js')).default;
    virtualContent.set('__prelude__',prelude({isDev:false,globalPrefix:'',extraVars:{},requireCycleIgnorePatterns:[],unstable_forceFullRefreshPatterns:[]}));
    function mappedFile(source){
      if(typeof source!=='string'||!source||/[\0%?#]/.test(source)||source.startsWith('//')||source.startsWith('\\\\'))throw Error('Malformed source-map path');
      const windows=/^[A-Za-z]:[\\/]/.test(source),name=source.replaceAll('\\','/');
      if((source.includes('\\')&&!windows)||(!windows&&name.includes(':')))throw Error('Malformed source-map path');
      if(/(^|\/)node_modules\//.test(name)){
        const segments=name.split('/'),at=segments.indexOf('node_modules');
        if(segments.slice(at+1).some(s=>s==='..'||s==='.'))throw Error('Dependency path traversal');
        const candidates=windows?[path.resolve(source)]:[path.resolve(mobile,name.replace(/^\//,'')),path.resolve(common,name.replace(/^\//,''))];
        for(const candidate of candidates)if(fs.existsSync(candidate)){
          const real=fs.realpathSync(candidate);
          if(inside(dependencies,real)&&fs.statSync(real).isFile())return {kind:'dependency',file:real};
        }
        throw Error('Dependency source outside verified directory: '+source);
      }
      if(name.split('/').some(s=>s==='..'||s==='.'))throw Error('Application path traversal');
      let file;
      if(windows)file=path.resolve(source);
      else if(name.startsWith('/src/')||name.startsWith('/assets/')||name==='/App.tsx'||name==='/index.js')file=path.join(mobile,name.slice(1));
      else if(path.isAbsolute(source)&&inside(root,path.resolve(source)))file=source;
      else if(!name.startsWith('/'))file=path.resolve(mobile,name);
      else throw Error('Foreign application source root: '+source);
      file=assertFile(file);
      // A first-party source cannot masquerade as an absolute dependency path.
      if(inside(dependencies,file))throw Error('Unexpected application source root');
      return {kind:inside(path.join(mobile,'assets'),file)&&path.extname(file)==='.png'?'asset':'application',file};
    }
    function visit(part){
      if(part.sourceRoot)throw Error('Unsupported source-map sourceRoot');
      if(part.sections){part.sections.forEach(section=>visit(section.map));return;}
      if(!Array.isArray(part.sources)||!Array.isArray(part.sourcesContent)||part.sources.length!==part.sourcesContent.length)throw Error('Incomplete source-map inventory');
      part.sources.forEach((source,index)=>{
        const text=part.sourcesContent?.[index];
        if(typeof text!=='string')throw Error('Source content missing: '+source);
        if(virtualContent.has(source)){
          if(text!==virtualContent.get(source))throw Error('Unexpected virtual source content: '+source);
          records.push({kind:'virtual',source,sha256:crypto.createHash('sha256').update(text).digest('hex')});return;
        }
        const {kind,file}=mappedFile(source),sha256=digest(file),relative=path.relative(root,file).replaceAll('\\','/');
        const serializedSourceSha256=crypto.createHash('sha256').update(fs.readFileSync(file).toString('utf8')).digest('hex');
        if(kind==='asset'){
          // Metro getSourceMapInfo returns "" for js/module/asset. Never compare PNG bytes to JS text.
          if(text!==''||fs.readFileSync(file).subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid PNG asset source entry: '+source);
          assets.add(relative);
        }else if(kind==='application'){
          // getSourceMapInfo serializes module.getSource().toString() (UTF-8).
          // assertFile above still verifies the exact raw bytes against the approved hash.
          if(crypto.createHash('sha256').update(text).digest('hex')!==serializedSourceSha256)throw Error('Bundled source mismatch: '+source);
          seen.add(relative);
        }
        records.push({kind,source,path:kind==='dependency'?file:relative,sha256,serializedSourceSha256,sourceContentSha256:crypto.createHash('sha256').update(text).digest('hex')});
      });
    }
    visit(map);
    for(const required of ['mobile/index.js','mobile/App.tsx','mobile/src/i18n/locale.ts','mobile/src/i18n/react.tsx','mobile/src/i18n/nativeLocale.ts'])if(!seen.has(required))throw Error('Required bundled application source missing: '+required);
    return {applicationSources:seen.size,staticAssets:assets.size,dependencyEntries:records.filter(r=>r.kind==='dependency').length,virtualEntries:records.filter(r=>r.kind==='virtual').length,utf8SerializationChanges:records.filter(r=>r.kind==='application'&&r.sha256!==r.serializedSourceSha256).length,totalEntries:records.length,unresolvedEntries:0,records};
  }
  return {root,mobile,dependencies,assertFile,assertResolution,verifySourceMap};
}

function preflight(manifest,dependencyRoot) {
  const guard=createGuard(manifest,dependencyRoot);
  // Ensure complete copying, not just successful resolution of a few entry files.
  for(const record of manifest.files)guard.assertFile(path.join(guard.root,record.path));
  const pkg=JSON.parse(fs.readFileSync(path.join(guard.mobile,'package.json')));
  if(pkg.main!=='index.js')throw Error('Application-owned index.js entry required');
  const expoRequire=createRequire(path.join(guard.dependencies,'expo/scripts/resolveAppEntry.js'));
  const entry=expoRequire('@expo/config/paths').resolveEntryPoint(guard.mobile,{platform:'android'});
  if(guard.assertFile(entry)!==fs.realpathSync(path.join(guard.mobile,'index.js')))throw Error('Expo entry escaped application workspace');
  for(const file of ['App.tsx','src/i18n/locale.ts','src/i18n/react.tsx','src/i18n/nativeLocale.ts','metro.config.cjs','scripts/checkAndroidSource.cjs'])guard.assertFile(path.join(guard.mobile,file));
  if(fs.realpathSync(path.join(guard.mobile,'node_modules'))!==guard.dependencies)throw Error('Dependency junction differs from verified source');
  return {entry,applicationRoot:guard.mobile,dependencyRoot:guard.dependencies,filesVerified:manifest.files.length};
}

module.exports={createGuard,preflight};
if(require.main===module){
  try{
    const [manifestFile,dependencies,mapFile]=process.argv.slice(2);
    if(!manifestFile||!dependencies)throw Error('Usage: node checkAndroidSource.cjs <manifest> <verified-node_modules> [source-map]');
    const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    console.log(JSON.stringify(preflight(manifest,dependencies)));
    if(mapFile)console.log(JSON.stringify(createGuard(manifest,dependencies).verifySourceMap(JSON.parse(fs.readFileSync(mapFile,'utf8')))));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
