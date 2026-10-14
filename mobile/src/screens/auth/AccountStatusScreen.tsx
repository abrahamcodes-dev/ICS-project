import React,{useState} from 'react';
import {useAuth} from '../../hooks/useAuth';
import {Action,Brand,Card,Copy,Loading,Notice,Screen} from '../../ui/design';
import AuthForm from './AuthForm';
export default function AccountStatusScreen(){
 const {status,user,loading,refreshIdentity,logout}=useAuth();const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError(null);try{await action();}catch{setError('Unable to complete this action. Check your connection and retry.');}finally{setBusy(false);}}
 if(loading)return <Screen><Brand/><Loading/></Screen>;
 if(status==='identityMissing')return <AuthForm mode="complete" footer={<><Action secondary title="Sign out" disabled={busy} onPress={()=>{void run(logout);}}/><Notice message={error}/></>}/>;
 const disabled=user?.status==='disabled',doctor=user?.role==='doctor'&&user.verificationStatus!=='approved';
 return <Screen><Brand/><Card><Copy title>{disabled?'Account unavailable':doctor?'Doctor verification':'Unable to load account'}</Copy>
 <Copy>{disabled?'This account is disabled. Contact your administrator for assistance.':doctor?`Verification status: ${user.verificationStatus}. Clinical access remains locked until approval. Verification submission is not available in this app screen yet.`:'We could not confirm your account details. Retry without creating another account.'}</Copy>
 <Notice message={error}/><Action title="Refresh account" disabled={busy} onPress={()=>{void run(refreshIdentity);}}/><Action secondary title="Sign out" disabled={busy} onPress={()=>{void run(logout);}}/></Card></Screen>;
}
