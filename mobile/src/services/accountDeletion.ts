import type {AccountDeletionView} from '@shared/types/accountDeletion';
export function deletionUsesGoogle(){
 const {auth}=require('./firebaseConfig') as typeof import('./firebaseConfig');
 const providers=auth?.currentUser?.providerData??[];
 return providers.some(p=>p.providerId==='google.com')&&!providers.some(p=>p.providerId==='password');
}
export async function reauthenticateForDeletion(password:string){
 if(deletionUsesGoogle())return (require('./googleAuth') as typeof import('./googleAuth')).reauthenticateGoogleAccount();
 const {auth}=require('./firebaseConfig') as typeof import('./firebaseConfig');
 const {EmailAuthProvider,reauthenticateWithCredential}=require('firebase/auth') as typeof import('firebase/auth');
 const user=auth.currentUser;if(!user?.email||!password)throw Error('Sign in again to confirm deletion.');
 const uid=user.uid;await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,password));
 if(auth.currentUser?.uid!==uid)throw Error('Session changed.');
 await user.getIdToken(true);
}
async function ownCall(name:string,input:unknown){
 const {auth,functions}=require('./firebaseConfig') as typeof import('./firebaseConfig');
 const {httpsCallable}=require('firebase/functions') as typeof import('firebase/functions');
 const uid=auth.currentUser?.uid;if(!uid)throw Error('Sign in required.');
 const response=await httpsCallable<unknown,{job:AccountDeletionView|null}>(functions,name)(input);
 if(auth.currentUser?.uid!==uid)throw Error('Session changed.');return response.data.job;
}
export const getOwnDeletion=()=>ownCall('getOwnAccountDeletion',{});
export const requestOwnDeletion=(requestId:string)=>ownCall('requestOwnAccountDeletion',{requestId,confirmation:'delete-account'});
export function deletionError(e:unknown){
 if((e as {details?:{reason?:string}}).details?.reason==='financial_obligation')return 'Resolve pending payments, uncertain payment outcomes and refunds in Payment history before deleting your account.';
 const code=(e as {code?:string}).code??'';
 if(/auth\/|google\//.test(code))return 'Could not confirm your sign-in. Check your sign-in method or sign in again. No deletion was requested.';
 if(/failed-precondition/.test(code))return 'Reauthenticate and resolve outstanding care before deleting: cancel future appointments, finish active consultations and wait for their access window to end.';
 if(/permission-denied|unauthenticated/.test(code))return 'Your session cannot start a new deletion. Refresh its status or sign in again.';
 return 'Deletion could not be confirmed. Check deletion status before retrying; an accepted request continues on the server.';
}
