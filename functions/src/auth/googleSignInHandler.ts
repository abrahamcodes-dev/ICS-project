import {createHash,randomUUID} from 'crypto';
import {HttpsError} from 'firebase-functions/v2/https';

export interface GoogleIdentity {sub:string;email:string;emailVerified:boolean;name?:string}
export interface GoogleAccount {uid:string;email?:string;disabled:boolean;providerData:Array<{providerId:string;uid:string}>;multiFactor?:{enrolledFactors:unknown[]}}
export interface GoogleSignInDependencies {
 verify(token:string):Promise<GoogleIdentity>;
 byGoogle(sub:string):Promise<GoogleAccount|null>;
 byEmail(email:string):Promise<GoogleAccount|null>;
 get(uid:string):Promise<GoogleAccount>;
 create(input:{uid:string;email:string;emailVerified:true;displayName?:string}):Promise<GoogleAccount>;
 link(uid:string,identity:GoogleIdentity):Promise<void>;
 available(uid:string):Promise<boolean>;
 mint(uid:string):Promise<string>;
}
const fingerprint=(sub:string,nonce:string)=>createHash('sha256').update(`google.com:${sub}:${nonce}`).digest('hex').slice(0,32);
function provisionalUid(sub:string){const nonce=randomUUID().replace(/-/g,'');return `g_${nonce}_${fingerprint(sub,nonce)}`;}
// Only Admin SDK can assign these UIDs. This identifies OUR interrupted creation,
// not an unrelated account sharing the email. Never import/overwrite an account.
function ownsProvisional(user:GoogleAccount,sub:string){
 const match=/^g_([a-f0-9]{32})_([a-f0-9]{32})$/.exec(user.uid);
 return !!match&&match[2]===fingerprint(sub,match[1])&&user.providerData.length===0;
}
export function createGoogleSignInHandler(deps:GoogleSignInDependencies){
 return async(request:{auth?:unknown;data:unknown})=>{
  if(request.auth)throw new HttpsError('failed-precondition','Sign out before changing accounts.');
  const input=request.data as Record<string,unknown>;
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['idToken','allowCreate'].includes(k))
   ||typeof input.idToken!=='string'||input.idToken.length<20||input.idToken.length>16384||typeof input.allowCreate!=='boolean')
   throw new HttpsError('invalid-argument','A Google credential and explicit registration intent are required.');
  let identity:GoogleIdentity;
  try{identity=await deps.verify(input.idToken);}catch{throw new HttpsError('unauthenticated','Google authentication could not be verified. Sign in again.');}
  if(!identity.emailVerified||!identity.sub||identity.sub.length>255||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email))
   throw new HttpsError('unauthenticated','A verified Google identity is required.');
  const linkRequired=()=>new HttpsError('failed-precondition','Sign in with your existing method, then explicitly link Google.',{reason:'google_link_required'});
  try{
   let user=await deps.byGoogle(identity.sub);
   if(!user){
    if(!input.allowCreate)throw new HttpsError('failed-precondition','Choose Patient or Doctor through Sign up first.',{reason:'google_registration_required'});
    try{user=await deps.create({uid:provisionalUid(identity.sub),email:identity.email,emailVerified:true,
     ...(identity.name?.trim()?{displayName:identity.name.trim().slice(0,200)}:{})});}
    catch(error){
     if((error as {code?:string}).code!=='auth/email-already-exists')throw error;
     // Recover concurrent/partial provisioning only with the SAME Google subject.
     user=await deps.byGoogle(identity.sub);
     if(!user){const pending=await deps.byEmail(identity.email);
      if(!pending||(!ownsProvisional(pending,identity.sub)&&!pending.providerData.some(p=>p.providerId==='google.com'&&p.uid===identity.sub)))throw linkRequired();user=pending;}
    }
    if(user.disabled||!await deps.available(user.uid))throw new HttpsError('permission-denied','Account unavailable.');
    if(!user.providerData.some(p=>p.providerId==='google.com'&&p.uid===identity.sub))await deps.link(user.uid,identity);
   }
   // Re-read before minting; linking must be confirmed and disabled/deleting
   // identities must never receive a new session. No role/approval claims minted.
   user=await deps.get(user.uid);
   if(user.disabled||!await deps.available(user.uid))throw new HttpsError('permission-denied','Account unavailable.');
   if(user.multiFactor?.enrolledFactors.length)throw new HttpsError('failed-precondition','Additional authentication is required. Use your existing supported sign-in method.',{reason:'google_mfa_required'});
   if(!user.providerData.some(p=>p.providerId==='google.com'&&p.uid===identity.sub))throw new Error('Google binding not confirmed');
   return {uid:user.uid,customToken:await deps.mint(user.uid)};
  }catch(error){
   if(error instanceof HttpsError)throw error;
   throw new HttpsError('unavailable','Google sign-in could not be confirmed. Retry without creating another account.');
  }
 };
}
