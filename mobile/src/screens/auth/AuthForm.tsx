import React,{useEffect,useRef,useState} from 'react';
import {Action,Brand,Card,Copy,Field,Loading,Notice,Screen} from '../../ui/design';
import {loginUser,registerUser,completeUserRegistration} from '../../services/authService';
export function validateAuth(mode:string,email:string,password:string,name:string,confirm:string):string|null{
 if(mode!=='complete' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return 'Enter a valid email address.';
 if(mode!=='complete' && !password)return 'Enter your password.';
 if(mode==='register' && password.length<6)return 'Use at least 6 characters for your password.';
 if(mode==='register' && password!==confirm)return 'Passwords do not match.';
 if(mode!=='login' && (!name.trim()||name.trim().length>200))return 'Enter your full name (up to 200 characters).';
 return null;
}
export function authError(error:unknown){const code=(error as {code?:string})?.code;
 if(code==='registration-incomplete')return 'Your sign-in account exists. Finish account setup without registering again.';
 if(code==='auth/network-request-failed'||code==='functions/unavailable')return 'Unable to connect. Check your connection and try again.';
 if(code==='auth/too-many-requests')return 'Too many attempts. Please wait before trying again.';
 if(code==='auth/weak-password'||code==='auth/password-does-not-meet-requirements')return 'Choose a stronger password that meets the account password policy.';
 return 'Unable to continue. Check your details or sign in if you already have an account.';
}
export default function AuthForm({mode,onAlternate,footer}:{mode:'login'|'register'|'complete';onAlternate?:()=>void;footer?:React.ReactNode}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[name,setName]=useState('');
 const [role,setRole]=useState<'patient'|'doctor'>('patient'),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const lock=useRef(false),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function submit(){if(lock.current)return;const invalid=validateAuth(mode,email,password,name,confirm);setError(invalid);if(invalid)return;
  lock.current=true;setBusy(true);try{
   if(mode==='login')await loginUser(email.trim(),password);
   else if(mode==='complete')await completeUserRegistration(name.trim(),role);
   else await registerUser(email.trim(),password,name.trim(),role);
  }catch(e){if(alive.current)setError(authError(e));}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <Screen><Brand/><Card><Copy title>{mode==='login'?'Welcome back':mode==='complete'?'Finish account setup':'Create your account'}</Copy>
 <Copy>{mode==='login'?'Sign in to manage your care.':'Choose how you will use CallADoc.'}</Copy>
 {mode!=='login' && <><Action secondary title={role==='patient'?'Patient selected':'Register as a patient'} disabled={busy} onPress={()=>setRole('patient')}/><Action secondary title={role==='doctor'?'Doctor selected':'Register as a doctor'} disabled={busy} onPress={()=>setRole('doctor')}/><Field label="Full name" value={name} onChangeText={setName} editable={!busy} autoComplete="name" maxLength={200}/>{role==='doctor'&&<Copy>Doctor accounts require verification and approval before clinical access. Registration does not grant approval.</Copy>}</>}
 {mode!=='complete' && <><Field label="Email" value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email"/><Field label="Password" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete={mode==='login'?'current-password':'new-password'}/>{mode==='register'&&<Field label="Confirm password" value={confirm} onChangeText={setConfirm} editable={!busy} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="new-password"/>}<Action secondary title={visible?'Hide password':'Show password'} onPress={()=>setVisible(v=>!v)}/></>}
 <Notice message={error}/>{busy&&<Loading label="Please wait…"/>}<Action title={mode==='login'?'Sign in':mode==='complete'?'Complete setup':'Create account'} disabled={busy} onPress={()=>{void submit();}}/>
 {onAlternate&&<Action secondary disabled={busy} title={mode==='login'?'Create an account':'Already registered? Sign in'} onPress={onAlternate}/>} {footer}</Card></Screen>;
}
