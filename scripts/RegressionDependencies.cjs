'use strict';
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
function hashFile(file){const hash=require('node:crypto').createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(1024*1024);try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,n));}finally{fs.closeSync(fd);}return hash.digest('hex');}
function tarBinary(){return process.platform==='win32'?path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'):'tar';}
function verify(root,marker){
 if(!marker.complete||marker.purpose!=='calladoc-disposable-regression-v1'||!marker.dependencyArchives)throw Error('Archive-backed disposable copy required.');
 for(const dir of ['mobile','functions']){const item=marker.dependencyArchives[dir];if(!item||item.path!=='.regression-dependencies/'+dir+'.tar'||hashFile(path.join(root,item.path))!==item.sha256)throw Error('Dependency archive missing/changed: '+dir);}
}
function materialise(root,marker,dir){
 if(!['mobile','functions'].includes(dir)||path.resolve(marker.source)===root)throw Error('Development dependency writes refused.');
 const target=path.join(root,dir,'node_modules'),record=path.join(root,'.regression-dependencies','materialised-'+dir+'.json');
 if(fs.existsSync(target)){
  if(!fs.existsSync(record)||JSON.parse(fs.readFileSync(record,'utf8')).sha256!==marker.dependencyArchives[dir].sha256||!fs.realpathSync(target).startsWith(root+path.sep))throw Error('Unverified dependency directory; prepare a new disposable copy.');
  return;
 }
 execFileSync(tarBinary(),['-xf',path.join(root,marker.dependencyArchives[dir].path),'-C',path.join(root,dir)],{stdio:'inherit'});
 if(!fs.existsSync(target)||!fs.realpathSync(target).startsWith(root+path.sep))throw Error('Independent dependency extraction failed.');
 fs.writeFileSync(record,JSON.stringify({sha256:marker.dependencyArchives[dir].sha256}));
}
module.exports={hashFile,tarBinary,verify,materialise};
if(require.main===module){const root=path.resolve(__dirname,'..'),marker=JSON.parse(fs.readFileSync(path.join(root,'.calladoc-regression.json'),'utf8'));if(process.version!=='v22.23.3'||process.argv.length!==3||!['mobile','functions','all'].includes(process.argv[2]))throw Error('Use Node 22.23.3 and mobile, functions or all in the prepared copy.');verify(root,marker);for(const d of process.argv[2]==='all'?['mobile','functions']:[process.argv[2]])materialise(root,marker,d);console.log('Independent dependencies materialised; no tests executed.');}
