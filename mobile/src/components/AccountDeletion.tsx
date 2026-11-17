import {systemMessage} from "../i18n/translate";
import {tr} from "../i18n/translate";
import {useLocale} from "../i18n/react";
import React,{useEffect,useRef,useState} from 'react';
import {Alert,KeyboardAvoidingView,Modal,Platform,ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {uuid} from 'expo-modules-core';
import {Action,Copy,Field,Loading,Notice,usePalette} from '../ui/design';
import {deletionError,deletionUsesGoogle,getOwnDeletion,reauthenticateForDeletion,requestOwnDeletion} from '../services/accountDeletion';
import type {AccountDeletionView} from '@shared/types/accountDeletion';
const labels:Record<string,string>={sessions:tr("Securing your sign-in"),devices:tr("Removing notification registrations"),avatars:tr("Removing profile pictures"),profiles:tr("Minimizing personal profile information"),staging:tr("Cleaning unfinished uploads"),evidence:tr("Protecting verification evidence"),authentication:tr("Removing authentication credentials"),complete:tr("Eligible account cleanup finished")};
export function AccountDeletion({uid,statusOnly=false}:{uid:string;statusOnly?:boolean}){
  useLocale();
 const google=deletionUsesGoogle();
 const p=usePalette(),[open,setOpen]=useState(statusOnly),[job,setJob]=useState<AccountDeletionView|null>(null),[password,setPassword]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const alive=useRef(true),lock=useRef(false),requestId=useRef(uuid.v4()),version=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;version.current++;};},[uid]);
 async function refresh(){const v=++version.current;setLoading(true);try{const current=await getOwnDeletion();if(alive.current&&v===version.current){setJob(current);setError(null);if(statusOnly&&!current)setOpen(false);}}catch(e){if(alive.current&&v===version.current)setError(job?tr("Your deletion request remains recorded. Cleanup continues on the server; you may sign out."):deletionError(e));}finally{if(alive.current&&v===version.current)setLoading(false);}}
 useEffect(()=>{if(!open)return;void refresh();},[open]);
 async function finish(){if(lock.current)return;lock.current=true;setBusy(true);setPassword('');try{await (require('../services/authService') as typeof import('../services/authService')).logoutDeletedAccount();}catch{if(alive.current)setError(tr("Unable to sign out locally. Your server-side deletion request remains recorded. Retry sign out."));}finally{lock.current=false;if(alive.current)setBusy(false);}}
 async function submit(){if(lock.current)return;lock.current=true;setBusy(true);setError(null);
  try{
   // An uncertain response is recovered by querying the authenticated owner's job
   // before any new reauthentication or request, including on disabled accounts.
   const existing=await getOwnDeletion();
   if(existing){if(alive.current)setJob(existing);return;}
   await reauthenticateForDeletion(password);if(!alive.current)return;
   setPassword('');
   const next=await requestOwnDeletion(requestId.current);if(alive.current)setJob(next);
  }catch(e){if(alive.current)setError(deletionError(e));}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 function confirm(){if(lock.current)return;Alert.alert(tr("Delete this account?"),tr("Your account will become unavailable. Eligible personal information will be removed. Clinical, payment, verification, consent and audit records may be retained pending approved policy. This cannot be undone through the app."),[{text:tr("Keep account"),style:'cancel'},{text:tr("Confirm account deletion"),style:'destructive',onPress:()=>{void submit();}}]);}
 const close=()=>{if(busy)return;if(job){void finish();}else{setPassword('');setOpen(false);}};
 return <><Action secondary title={statusOnly?tr("Check deletion status"):tr("Delete account")} onPress={()=>setOpen(true)}/>
 <Modal visible={open} animationType="slide" onRequestClose={close}><SafeAreaView style={{flex:1,backgroundColor:p.background}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24,gap:16}}>
 <Copy title>{tr("Account deletion")}</Copy>
 <Copy>{tr("Your sign-in credentials, profile pictures, eligible personal profile data and notification registrations will be removed. Future appointments and active consultations must be resolved first.")}</Copy>
 <Copy>{tr("Medical history, shared consultations, messages, prescriptions, attachments, professional verification, payment transactions, ratings and consent/audit records may remain protected while retention requirements are reviewed. This is not a promise of complete medical-data erasure.")}</Copy>
 {loading&&<Loading label={tr("Checking deletion status")}/>}<Notice message={error}/>
 {job?<><Copy variant="heading">{job.state==='completed'?tr("Eligible account cleanup completed"):job.state==='retryable'?tr("Cleanup needs another attempt"):tr("Account deletion pending")}</Copy>
 <Copy>{systemMessage(labels[job.phase]??'Processing your recorded request')}</Copy><Copy>{tr("Access is disabled. Cleanup continues independently of this screen. Retained records still require a retention decision.")}</Copy>
 <Copy selectable>{tr("Request reference:")}{' '}{job.requestReference}</Copy><Action secondary title={tr("Refresh deletion status")} disabled={busy||loading} onPress={()=>{void refresh();}}/>
 {job.state==='retryable'&&<Action secondary title={tr("Retry pending cleanup")} disabled={busy} onPress={()=>{if(lock.current)return;lock.current=true;setBusy(true);void requestOwnDeletion(requestId.current).then(next=>{if(alive.current)setJob(next);}).catch(e=>{if(alive.current)setError(deletionError(e));}).finally(()=>{lock.current=false;if(alive.current)setBusy(false);});}}/>}
 <Action title={tr("Close and sign out")} disabled={busy} loading={busy} onPress={()=>{void finish();}}/></>:!statusOnly&&<>{google?<Copy>{tr("You will confirm this request with Google. Do not enter your Google password in CallADoc.")}</Copy>:<Field label={tr("Confirm your current password")} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" editable={!busy}/>}<Action danger title={tr("Request account deletion")} disabled={busy||loading||(!google&&!password)} loading={busy} onPress={confirm}/><Action secondary title={tr("Refresh deletion status")} disabled={busy||loading} onPress={()=>{void refresh();}}/><Action secondary title={tr("Keep account")} disabled={busy} onPress={close}/></>}
 <Action secondary title={tr("Retention and assistance information")} onPress={()=>Alert.alert(tr("Retention review"),systemMessage('Retention periods and a support/erasure-request service have not been approved or configured. Keep your request reference for the service administrator. No support contact is currently provided in the app; do not send medical records to an unverified contact.'))}/>
 {statusOnly&&!job&&<Action secondary title={tr("Close")} disabled={busy} onPress={()=>setOpen(false)}/>}
 </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal></>;
}
