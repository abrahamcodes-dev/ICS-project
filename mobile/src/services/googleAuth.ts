import {Platform} from 'react-native';
const firebase=()=>require('./firebaseConfig') as typeof import('./firebaseConfig');

export class GoogleAuthError extends Error {
 constructor(readonly code:string){super(googleAuthMessage({code}));}
}
export function googleAuthMessage(error:unknown):string{
 const {code,details}=(error??{}) as {code?:string;details?:{reason?:string}};
 if(code==='google/not-configured'||details?.reason==='google_not_configured')return 'Google sign-in is not configured for this environment. Use email and password for now.';
 if(code==='registration-incomplete')return 'Google sign-in succeeded, but account setup is not confirmed. Retry Continue with Google here; no second account will be created.';
 if(details?.reason==='google_link_required'||['auth/account-exists-with-different-credential','auth/email-already-in-use'].includes(code??''))return 'Sign in with your existing method, then use Link Google account in your account settings. Your existing account will be preserved.';
 if(details?.reason==='google_registration_required')return 'Choose Patient or Doctor using Sign up, then continue with Google.';
 if(['auth/credential-already-in-use','auth/provider-already-linked'].includes(code??''))return 'This Google account is already linked. No accounts were merged. Use its existing sign-in method.';
 if(code==='PLAY_SERVICES_NOT_AVAILABLE')return 'Update Google Play Services, or use email and password.';
 if(code==='10'||code==='DEVELOPER_ERROR'||code==='12500')return 'Google sign-in configuration needs attention. Use email and password for now.';
 if(code==='google/session-changed')return 'Your session changed. Retry from the current account.';
 if(code==='google/email-mismatch')return 'Choose the Google account with the same email as your CallADoc account. No accounts were linked.';
 if(details?.reason==='google_mfa_required'||code==='auth/multi-factor-auth-required')return 'This account requires additional authentication. Use your existing supported sign-in method.';
 if(code==='IN_PROGRESS'||code==='google/in-progress')return 'A Google sign-in request is already in progress.';
 return 'Google authentication could not be confirmed. Check your connection and try again. No accounts were merged.';
}
export function googleConfigured(){
 return ['android','ios'].includes(Platform.OS)&&!!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  &&(Platform.OS!=='ios'||(!!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID&&!!process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME));
}
export function googleConnection(uid:string){
 const {auth}=firebase();
 const user=auth?.currentUser;if(user?.uid!==uid)return null;
 const providers=user.providerData??[];
 return {linked:providers.some(p=>p.providerId==='google.com'),password:providers.some(p=>p.providerId==='password')};
}
let configured=false,busy=false,generation=0;
let sdk:typeof import('@react-native-google-signin/google-signin')|undefined;
export function cancelGoogleAuthentication(){generation++;}
function nativeGoogle(){
 if(!googleConfigured())throw new GoogleAuthError('google/not-configured');
 sdk??=require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
 if(!configured){sdk.GoogleSignin.configure({webClientId:process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ...(Platform.OS==='ios'?{iosClientId:process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID}:{}),offlineAccess:false});configured=true;}
 return sdk.GoogleSignin;
}
/** Native tokens exist only inside this operation. Firebase owns persistence. */
async function withGoogleCredential<T>(use:(idToken:string,email:string)=>Promise<T>):Promise<T|null>{
 if(!googleConfigured())throw new GoogleAuthError('google/not-configured');
 if(busy)throw new GoogleAuthError('google/in-progress');
 busy=true;
 const version=generation;
 try{
  const google=nativeGoogle();
  if(!await google.hasPlayServices({showPlayServicesUpdateDialog:true}))throw new GoogleAuthError('PLAY_SERVICES_NOT_AVAILABLE');
  // Always show an interactive choice, including linking/deletion. Never restore
  // a Google account silently after CallADoc logout or an account switch.
  await google.signOut();
  const result=await google.signIn();
  if(version!==generation)throw new GoogleAuthError('google/session-changed');
  if(result.type==='cancelled')return null;
  if(!result.data.idToken)throw new GoogleAuthError('google/missing-token');
  return await use(result.data.idToken,result.data.user.email);
 }catch(error){if((error as {code?:string}).code==='SIGN_IN_CANCELLED')return null;throw error;}
 finally{await clearNativeGoogleSession();busy=false;}
}
/** Best effort: native cleanup must not prevent Firebase logout/deletion. */
export async function clearNativeGoogleSession(){
 try{if(googleConfigured()||(sdk&&configured))await (sdk&&configured?sdk.GoogleSignin:nativeGoogle()).signOut();}
 catch{/* No silent sign-in is used; Firebase sign-out still proceeds. */}
}
export async function signInGoogleAccount(allowCreate:boolean){
 const {auth,functions}=firebase();
 const {httpsCallable}=require('firebase/functions') as typeof import('firebase/functions');
 const {signInWithCustomToken,signOut}=require('firebase/auth') as typeof import('firebase/auth');
 const version=generation;
 if(auth.currentUser)throw new GoogleAuthError('google/session-changed');
 return withGoogleCredential(async idToken=>{
  if(auth.currentUser||generation!==version)throw new GoogleAuthError('google/session-changed');
  const response=await httpsCallable<{idToken:string;allowCreate:boolean},{uid:string;customToken:string}>(functions,'signInWithGoogle')({idToken,allowCreate});
  if(auth.currentUser||generation!==version)throw new GoogleAuthError('google/session-changed');
  const {uid,customToken}=response.data;
  if(typeof uid!=='string'||!uid||typeof customToken!=='string'||!customToken)throw new GoogleAuthError('google/invalid-response');
  const result=await signInWithCustomToken(auth,customToken);
  if(generation!==version){if(auth.currentUser===result.user)await signOut(auth);throw new GoogleAuthError('google/session-changed');}
  if(result.user.uid!==uid)throw new GoogleAuthError('google/session-changed');
  sameUser(uid);
  return result.user;
 });
}
function sameUser(uid:string){if(firebase().auth.currentUser?.uid!==uid)throw new GoogleAuthError('google/session-changed');}
export async function linkGoogleAccount(password:string){
 const {auth}=firebase();
 const {GoogleAuthProvider,linkWithCredential,reauthenticateWithCredential,EmailAuthProvider}=require('firebase/auth') as typeof import('firebase/auth');
 const user=auth.currentUser;
 if(!user?.email||!password||!user.providerData.some(p=>p.providerId==='password'))throw new GoogleAuthError('google/session-changed');
 const uid=user.uid;
 // Both credentials are proven. Matching email alone is never authorization.
 await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,password));sameUser(uid);
 return withGoogleCredential(async(idToken,email)=>{
  sameUser(uid);
  if(email.toLowerCase()!==user.email!.toLowerCase())throw new GoogleAuthError('google/email-mismatch');
  const result=await linkWithCredential(user,GoogleAuthProvider.credential(idToken));sameUser(uid);
  if(result.user.uid!==uid)throw new GoogleAuthError('google/session-changed');
  await user.getIdToken(true);sameUser(uid);return true;
 });
}
export async function reauthenticateGoogleAccount(){
 const {auth}=firebase();
 const {GoogleAuthProvider,reauthenticateWithCredential}=require('firebase/auth') as typeof import('firebase/auth');
 const user=auth.currentUser;if(!user?.providerData.some(p=>p.providerId==='google.com'))throw new GoogleAuthError('google/session-changed');
 const uid=user.uid;
 const confirmed=await withGoogleCredential(async idToken=>{
  sameUser(uid);const result=await reauthenticateWithCredential(user,GoogleAuthProvider.credential(idToken));sameUser(uid);
  if(result.user.uid!==uid)throw new GoogleAuthError('google/session-changed');
  await user.getIdToken(true);sameUser(uid);return true;
 });
 if(!confirmed)throw new GoogleAuthError('google/cancelled');
}
