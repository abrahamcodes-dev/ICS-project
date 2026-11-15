import {OAuth2Client} from 'google-auth-library';
import {getAuth} from 'firebase-admin/auth';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {db} from '../shared/firestoreRefs';
import {createGoogleSignInHandler,type GoogleIdentity} from './googleSignInHandler';

const google=new OAuth2Client();
export async function verifyGoogleIdentity(token:string):Promise<GoogleIdentity>{
 const audience=process.env.GOOGLE_SIGN_IN_WEB_CLIENT_ID;
 if(!audience||!/^\S+\.apps\.googleusercontent\.com$/.test(audience))throw new Error('Google authentication is not configured');
 const payload=(await google.verifyIdToken({idToken:token,audience})).getPayload();
 if(!payload?.sub||!payload.email||payload.email_verified!==true)throw new Error('Invalid Google identity');
 return {sub:payload.sub,email:payload.email,emailVerified:true,name:payload.name};
}
const missing=async<T>(action:()=>Promise<T>):Promise<T|null>=>{
 try{return await action();}catch(error){if((error as {code?:string}).code==='auth/user-not-found')return null;throw error;}
};
// Firebase can automatically link a trusted provider by email. This verified
// exchange deliberately avoids signInWithCredential and preserves explicit linking.
export const signInWithGoogle=onCall({maxInstances:10},async request=>{
 if(!process.env.GOOGLE_SIGN_IN_WEB_CLIENT_ID)throw new HttpsError('failed-precondition','Google sign-in is not configured for this environment.',{reason:'google_not_configured'});
 const auth=getAuth();
 return createGoogleSignInHandler({
  verify:verifyGoogleIdentity,
  byGoogle:sub=>missing(()=>auth.getUserByProviderUid('google.com',sub)),
  byEmail:email=>missing(()=>auth.getUserByEmail(email)),get:uid=>auth.getUser(uid),
  create:input=>auth.createUser(input),
  link:async(uid,identity)=>{await auth.updateUser(uid,{providerToLink:{providerId:'google.com',uid:identity.sub,email:identity.email}});},
  available:async uid=>{
   const [profile,deletion]=await db.getAll(db.doc(`users/${uid}`),db.doc(`accountDeletionJobs/${uid}`));
   return !deletion.exists&&(!profile.exists||profile.data()?.status==='active');
  },
  mint:uid=>auth.createCustomToken(uid),
 })({auth:request.auth,data:request.data});
});
