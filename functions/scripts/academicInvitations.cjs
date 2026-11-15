'use strict';
// Privileged owner/IAM tool; never packaged, never invoked by application clients.
function parseArgs(args){
 const v={apply:false};const allowed=new Set(['--project','--email','--expires-at','--operator','--bootstrap-admin-uid']);
 for(let i=0;i<args.length;i++){const k=args[i];if(k==='--apply'){if(v.apply)throw Error('Duplicate apply');v.apply=true;continue;}
  if(k==='--notice-acknowledged'){v.noticeAcknowledged=true;continue;}
  if(!allowed.has(k)||v[k]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid argument');v[k]=args[++i];}
 if(!/^[a-z][a-z0-9-]*-academic-demo$/.test(v['--project']||'')||(v['--project']||'').startsWith('demo-')
  ||(v['--project']||'').length>30||!v['--operator']?.trim()
  ||!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(v['--email']||'')||!Number.isFinite(Date.parse(v['--expires-at']))||Date.parse(v['--expires-at'])<=Date.now())throw Error('Explicit academic project, email, future expiry and operator are required');
 if(v['--bootstrap-admin-uid']&&!v.noticeAcknowledged)throw Error('Bootstrap administrator must acknowledge the hosted notice');
 return v;
}
async function main(){
 const v=parseArgs(process.argv.slice(2));
 if(Object.keys(process.env).some(k=>(k.endsWith('_EMULATOR_HOST')||k==='FUNCTIONS_EMULATOR')&&process.env[k]))throw Error('Hosted IAM operation refuses emulator overrides');
 if(!v.apply){console.log('Arguments valid; dry run only. No cloud access performed.');return;}
 const {initializeApp,applicationDefault,deleteApp}=require('firebase-admin/app'),{getFirestore,Timestamp}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
 const app=initializeApp({projectId:v['--project'],credential:applicationDefault()},'academic-owner-admission');
 try{
  const db=getFirestore(app),auth=getAuth(app),email=v['--email'].toLowerCase(),uid=v['--bootstrap-admin-uid'],expiry=Timestamp.fromDate(new Date(v['--expires-at']));
  let admin;
  if(uid){admin=await auth.getUser(uid);const identity=(await db.doc('users/'+uid).get()).data();
   const {validIdentity}=require('../lib/auth/registrationPolicy');
   if(admin.disabled||!admin.emailVerified||admin.email?.toLowerCase()!==email||!validIdentity(identity)||identity.uid!==uid||identity.status!=='active'||identity.role!=='administrator')throw Error('Existing verified canonical administrator required');}
  await db.runTransaction(async tx=>{const ref=db.doc('academicDemoInvitations/'+email),old=(await tx.get(ref)).data();
   if(uid&&old?.uid&&old.uid!==uid)throw Error('Invitation already bound');
   tx.set(ref,{email,uid:uid||old?.uid||null,enabled:true,expiresAt:expiry});
   if(uid)tx.set(db.doc('academicDemoTesters/'+uid),{uid,email,enabled:true,expiresAt:expiry,noticeVersion:'academic-demo-2026-11-15-v1',noticeAcknowledgedAt:Timestamp.now()});
   tx.create(db.collection('academicDemoAdmissionAudit').doc(),{operator:v['--operator'],action:uid?'bootstrap-administrator':'invite',at:Timestamp.now()});});
  if(uid)await auth.setCustomUserClaims(uid,{...admin.customClaims,academicDemoAdmin:true});
  console.log('Privileged academic admission operation completed.');
 }finally{await deleteApp(app);}
}
module.exports={parseArgs};
if(require.main===module)main().catch(()=>{console.error('Admission operation failed; inspect arguments, IAM and canonical administrator prerequisites. Secret values are not logged.');process.exitCode=1;});
