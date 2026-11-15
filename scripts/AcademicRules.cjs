'use strict';
const fs=require('node:fs'),path=require('node:path');
function hostedFirestore(source){
  const gate=`function academicAdmission() {
    let uid = request.auth.uid;
    let m = get(/databases/$(database)/documents/academicDemoTesters/$(uid)).data;
    let i = get(/databases/$(database)/documents/academicDemoInvitations/$(m.email)).data;
    return request.auth.token.email_verified == true
      && request.auth.token.email.lower() == m.email
      && m.uid == uid && i.uid == uid && i.email == m.email
      && m.enabled == true && i.enabled == true
      && m.noticeVersion == 'academic-demo-2026-11-15-v1'
      && m.expiresAt is timestamp && i.expiresAt is timestamp
      && m.expiresAt > request.time && i.expiresAt > request.time;
  }
  function isSignedIn() { return request.auth != null && academicAdmission(); }`;
  if(!source.includes('function isSignedIn() { return request.auth != null; }'))throw Error('Firestore admission insertion point changed.');
  if(/allow[^;]+request\.auth\s*!=\s*null/.test(source))throw Error('Raw authorization requires admission review.');
  return '// HOSTED ACADEMIC ONLY: generated from unchanged local domain Rules.\n'+source.replace('function isSignedIn() { return request.auth != null; }',gate);
}
const hostedStorage=`rules_version = '2';
// Hosted objects are mediated by admitted, domain-authorized callables.
// Storage Rules permit only two Firestore lookups; no weaker identity checks.
service firebase.storage { match /b/{bucket}/o { match /{path=**} { allow read, write: if false; } } }
`;
module.exports={hostedFirestore,hostedStorage};
if(require.main===module){const dir=process.argv[2];if(!dir)throw Error('Output directory required.');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'firestore.rules'),hostedFirestore(fs.readFileSync(path.join(__dirname,'../functions/firestore.rules'),'utf8')));fs.writeFileSync(path.join(dir,'storage.rules'),hostedStorage);}
