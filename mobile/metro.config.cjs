const {getDefaultConfig}=require('expo/metro-config');
const {createGuard,preflight}=require('./scripts/checkAndroidSource.cjs');
const fs=require('node:fs');

const config=getDefaultConfig(__dirname);
const manifestFile=process.env.CALLADOC_SOURCE_MANIFEST;
const dependencyRoot=process.env.CALLADOC_VERIFIED_DEPENDENCIES;
const hostedRelease=process.env.CALLADOC_APP_VARIANT==='academic-demo'&&process.env.NODE_ENV==='production';
if(hostedRelease||manifestFile||dependencyRoot){
  if(!manifestFile||!dependencyRoot)throw Error('Academic release requires a source manifest and verified dependency directory');
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  preflight(manifest,dependencyRoot);
  const guard=createGuard(manifest,dependencyRoot);
  if(require('node:fs').realpathSync(__dirname)!==guard.mobile)throw Error('Metro project differs from approved source root');
  const previous=config.resolver.resolveRequest;
  config.resolver.resolveRequest=(context,moduleName,platform)=>guard.assertResolution(
    previous?previous(context,moduleName,platform):context.resolveRequest(context,moduleName,platform)
  );
}
module.exports=config;
