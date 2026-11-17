import {displayCode,tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import React,{useState} from 'react';
import {useAuth} from '../../hooks/useAuth';
import {Action,Brand,Card,Copy,Loading,Notice,Screen} from '../../ui/design';
import AuthForm from './AuthForm';
import {AccountDeletion} from '../../components/AccountDeletion';
export default function AccountStatusScreen(){
  useLocale();
 const {status,user,loading,refreshIdentity,logout}=useAuth();const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError(null);try{await action();}catch{setError(tr("Unable to complete this action. Check your connection and retry."));}finally{setBusy(false);}}
 if(loading)return <Screen><Brand/><Loading/></Screen>;
 if(status==='identityMissing')return <AuthForm mode="recover" footer={<><Action secondary title={tr("Sign out")} disabled={busy} onPress={()=>{void run(logout);}}/><Notice message={error}/></>}/>;
 const disabled=user?.status==='disabled',doctor=user?.role==='doctor'&&user.verificationStatus!=='approved';
 return <Screen><Brand/><Card><Copy title>{disabled?tr("Account unavailable"):doctor?tr("Doctor verification"):tr("Unable to load account")}</Copy>
 <Copy>{disabled?tr("This account is disabled. Contact your administrator for assistance."):doctor?tr("Verification status: {0}. Clinical access remains locked until approval. Verification submission is not available in this app screen yet.", {"0": displayCode(user.verificationStatus)}):tr("We could not confirm your account details. Retry without creating another account.")}</Copy>
 {disabled&&user?.uid&&<AccountDeletion key={`deletion:${user.uid}`} uid={user.uid} statusOnly/>}
 <Notice message={error}/><Action title={tr("Refresh account")} disabled={busy} onPress={()=>{void run(refreshIdentity);}}/><Action secondary title={tr("Sign out")} disabled={busy} onPress={()=>{void run(logout);}}/></Card></Screen>;
}
