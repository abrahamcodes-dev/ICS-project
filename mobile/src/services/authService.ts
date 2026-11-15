import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,sendEmailVerification,reload,getIdToken } from "firebase/auth";
import {isHostedAcademicDemo} from './academicDemo';
import {ACADEMIC_NOTICE_VERSION} from './academicNotice';
import { getFunctions, httpsCallable } from "firebase/functions";
import type { PublicRegistrationRole, PublicRegistrationRequest, RegistrationSubmission, CallADocIdentity } from "@shared/types/identity";
import { auth, app } from "./firebaseConfig";
import { loadOwnIdentity } from "./identityService";
import { parseIdentity } from "./identityParser";
import { prepareNotificationLogout } from "./notificationDevice";
import {consentRequest,validateConsentChoice,type ConsentChoice} from './patientConsent';

// Keep the original form mounted while Auth publishes a user before profile creation.
let registrationOpen=false;
let pendingRegistration:{uid:string;email:string}|null=null;
const registrationListeners=new Set<()=>void>();
export const isRegistrationOpen=()=>registrationOpen;
export function onRegistrationChange(listener:()=>void){registrationListeners.add(listener);return()=>{registrationListeners.delete(listener);};}
function setRegistrationOpen(value:boolean){registrationOpen=value;registrationListeners.forEach(listener=>listener());}
const identityListeners = new Set<() => void>();
export function onIdentityRefresh(listener: () => void) {
  identityListeners.add(listener);
  return () => { identityListeners.delete(listener); };
}
function currentUid() { return auth.currentUser?.uid; }
function notifyIdentityRefresh() { identityListeners.forEach(listener => listener()); }
function registrationInput(fullName: string, role: PublicRegistrationRole): PublicRegistrationRequest {
  if ((role !== "patient" && role !== "doctor") || typeof fullName !== "string"
    || !fullName.trim() || fullName.trim().length > 200) throw new Error("A patient or doctor role and valid full name are required.");
  return { role, fullName: fullName.trim() };
}
export class RegistrationIncompleteError extends Error {
  readonly code = "registration-incomplete";
  constructor() { super("Account setup could not be confirmed. Retry completion with the existing Auth account; do not create another account."); }
}
/** Retry after login or a partial registration; never creates another Auth account. */
export async function completeUserRegistration(fullName: string, role: PublicRegistrationRole, choice?:ConsentChoice): Promise<CallADocIdentity> {
  const input = registrationInput(fullName, role);
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in before completing registration.");
  if(role==='patient')validateConsentChoice(choice);
  if(isHostedAcademicDemo()){
    const user=auth.currentUser!;await reload(user);
    if(!user.emailVerified){await sendEmailVerification(user);throw Object.assign(new Error('Verify the invitation email before retrying registration.'),{code:'academic-email-verification'});}
    await getIdToken(user,true);
  }
  try {
    const complete = httpsCallable<RegistrationSubmission, unknown>(getFunctions(app), "completeRegistration");
    if(isHostedAcademicDemo()&&!choice?.privacyAcknowledged)throw new Error('Acknowledge the hosted academic notice.');
    const payload=role==='patient'?{...input,consent:consentRequest(0,choice!.sharingDecision!,'registration')}:input;
    const result = await complete(isHostedAcademicDemo()?{...payload,academicNoticeVersion:ACADEMIC_NOTICE_VERSION,academicNoticeAcknowledged:true}:payload);
    if (auth.currentUser?.uid !== uid) throw new Error("Authentication changed.");
    parseIdentity(result.data, uid);
    const identity = await loadOwnIdentity(uid);
    if (!identity || identity.role !== role) throw new Error("Identity setup not confirmed.");
    return identity;
  } catch {
    throw new RegistrationIncompleteError();
  } finally {
    notifyIdentityRefresh();
  }
}
export async function registerUser(email: string, password: string, fullName: string, role: PublicRegistrationRole, choice?:ConsentChoice) {
  const input=registrationInput(fullName,role);
  const normalizedEmail=email.trim().toLowerCase();
  if(auth.currentUser && (pendingRegistration?.uid!==auth.currentUser.uid||pendingRegistration.email!==normalizedEmail))throw new Error('Already signed in; use registration recovery or sign out.');
  if(role==='patient')validateConsentChoice(choice);
  setRegistrationOpen(true);
  try {
    if(!auth.currentUser){
      const credential=await createUserWithEmailAndPassword(auth,email,password);
      if(currentUid()!==credential.user.uid)throw new RegistrationIncompleteError();
      pendingRegistration={uid:credential.user.uid,email:normalizedEmail};
    }
    const identity=await completeUserRegistration(input.fullName,input.role,choice);
    pendingRegistration=null;
    setRegistrationOpen(false);
    return identity;
  } catch(error) {
    if(!auth.currentUser || pendingRegistration?.uid!==auth.currentUser.uid)setRegistrationOpen(false);
    throw error;
  }
}
export function loginUser(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}
let pendingGoogleUid:string|null=null;
export async function loginGoogleUser(){
 return (require('./googleAuth') as typeof import('./googleAuth')).signInGoogleAccount(false);
}
export async function registerGoogleUser(fullName:string,role:PublicRegistrationRole,choice?:ConsentChoice){
 const input=registrationInput(fullName,role);if(role==='patient')validateConsentChoice(choice);
 if(auth.currentUser&&auth.currentUser.uid!==pendingGoogleUid)throw new Error('Already signed in.');
 setRegistrationOpen(true);
 try{
  if(!auth.currentUser){
   const user=await (require('./googleAuth') as typeof import('./googleAuth')).signInGoogleAccount(true);
   if(!user){setRegistrationOpen(false);return null;}
   pendingGoogleUid=user.uid;
  }
  const uid=auth.currentUser!.uid;
  const existing=isHostedAcademicDemo()?null:await loadOwnIdentity(uid);
  if(currentUid()!==uid)throw new RegistrationIncompleteError();
  // Existing role, approval and consent are authoritative; never rewrite them.
  const identity=existing??await completeUserRegistration(input.fullName,input.role,choice);
  pendingGoogleUid=null;setRegistrationOpen(false);notifyIdentityRefresh();return identity;
 }catch(error){
  if(!auth.currentUser||auth.currentUser.uid!==pendingGoogleUid)setRegistrationOpen(false);
  throw error;
 }
}
export async function logoutUser() {
  await prepareNotificationLogout();
  const google=require('./googleAuth') as typeof import('./googleAuth');
  google.cancelGoogleAuthentication();await google.clearNativeGoogleSession();
  await signOut(auth);
  pendingGoogleUid=null;
  pendingRegistration=null;setRegistrationOpen(false);
  notifyIdentityRefresh();
}
/** Accepted deletion already disabled server access. Normal token-revocation
 * RPCs can no longer authorize, so clear local state and sign out directly. */
export async function logoutDeletedAccount(){
 const {clearDeletedAccountNotificationState}=require('./notificationDevice') as typeof import('./notificationDevice');
 clearDeletedAccountNotificationState();
 const google=require('./googleAuth') as typeof import('./googleAuth');
 google.cancelGoogleAuthentication();await google.clearNativeGoogleSession();
 pendingGoogleUid=null;
 await signOut(auth);pendingRegistration=null;setRegistrationOpen(false);notifyIdentityRefresh();
}
