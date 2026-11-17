'use strict';
// Static interface audit, not a claim of runtime/medical-language acceptance.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'mobile/node_modules/typescript'));
const failures=[],files=[];
const uiProps=new Set(['title','label','placeholder','accessibilityLabel','accessibilityHint','message','helperText']);
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,e.name);
 if(e.isDirectory()&&!['i18n','development'].includes(e.name))walk(file);
 else if(file.endsWith('.tsx'))files.push(file);
}}
walk(path.join(root,'mobile/src'));
for(const file of files){const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function visit(node){
  const visibleText=ts.isJsxText(node)&&/[A-Za-z]/.test(node.text);
  const visibleProp=ts.isStringLiteral(node)&&ts.isJsxAttribute(node.parent)&&uiProps.has(node.parent.name.getText(source));
  if((visibleText||visibleProp)&&/[A-Za-z]/.test(node.text))failures.push({file:path.relative(root,file),line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,text:node.text.trim()});
  ts.forEachChild(node,visit);
 }visit(source);
}
const moduleCopy={exports:{}};
new Function('exports','module',ts.transpileModule(fs.readFileSync(path.join(root,'mobile/src/i18n/messages.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(moduleCopy.exports,moduleCopy);
const {en,sw}=moduleCopy.exports;
for(const key of Object.keys(en))if(!sw[key]||JSON.stringify([...en[key].matchAll(/\{([^}]+)\}/g)].map(x=>x[1]).sort())!==JSON.stringify([...sw[key].matchAll(/\{([^}]+)\}/g)].map(x=>x[1]).sort()))failures.push({key,error:'missing translation or interpolation mismatch'});
if(Object.keys(en).length!==Object.keys(sw).length)failures.push({error:'catalogue key mismatch'});
console.log(JSON.stringify({catalogueKeys:Object.keys(en).length,tsxFiles:files.length,unlocalizedStaticJsx:failures,
 limitations:'Dynamic descriptors, native/OS dialogs, authored data and visual layout require separate review.'},null,2));
if(failures.length)process.exitCode=1;
