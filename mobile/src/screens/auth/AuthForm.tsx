import {isHostedAcademicDemo} from '../../services/academicDemo';
import React,{useEffect,useRef,useState} from 'react';
import {Image} from 'react-native';
import {LoginLayout, LoginFieldIcon} from './LoginLayout';
import {RegistrationLayout, RegistrationPassword} from './RegistrationLayout';
import type {AvatarImage} from '../../services/avatarService';
import {Action,Brand,Card,Copy,Field,Loading,Notice,Screen} from '../../ui/design';
import {loginUser,registerUser,completeUserRegistration,loginGoogleUser,registerGoogleUser} from '../../services/authService';
import {googleConfigured,googleAuthMessage} from '../../services/googleAuth';
import {GoogleSignInButton} from '../../components/GoogleSignInButton';
import {PatientConsentControls} from '../../components/PatientConsentControls';
import {validateConsentChoice,type ConsentChoice} from '../../services/patientConsent';
export function validateAuth(mode:string,email:string,password:string,name:string,confirm:string):string|null{
 if(mode!=='recover' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return 'Enter a valid email address.';
 if(mode!=='recover' && !password)return 'Enter your password.';
 if(mode==='register' && password.length<6)return 'Use at least 6 characters for your password.';
 if(mode==='register' && password!==confirm)return 'Passwords do not match.';
 if(mode!=='login' && (!name.trim()||name.trim().length>200))return 'Enter your full name (up to 200 characters).';
 return null;
}
export function authError(error:unknown){const code=(error as {code?:string})?.code;
 if(code==='academic-email-verification')return 'Check your invited email for the verification link, then retry registration here with the same account.';
 if(code==='registration-incomplete')return 'Your sign-in account exists, but registration is not confirmed. Retry Create account with these same details; no second account will be created.';
 if(code==='auth/network-request-failed'||code==='functions/unavailable')return 'Unable to connect. Check your connection and try again.';
 if(code==='auth/too-many-requests')return 'Too many attempts. Please wait before trying again.';
 if(code==='auth/weak-password'||code==='auth/password-does-not-meet-requirements')return 'Choose a stronger password that meets the account password policy.';
 return 'Unable to continue. Check your details or sign in if you already have an account.';
}
export default function AuthForm({mode,onAlternate,footer,initialRole='patient',onBack,onComplete,onAssistant}:{onAssistant?:()=>void;initialRole?:'patient'|'doctor';onBack?:()=>void;onComplete?:(uid:string)=>void;mode:'login'|'register'|'recover';onAlternate?:()=>void;footer?:React.ReactNode}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[name,setName]=useState('');
 const [role,setRole]=useState<'patient'|'doctor'>(initialRole),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const [confirmVisible,setConfirmVisible]=useState(false);
 const [consent,setConsent]=useState<ConsentChoice>({privacyAcknowledged:false,sharingDecision:null});
 const [photo,setPhoto]=useState<AvatarImage|null>(null),[picking,setPicking]=useState(false);const photoRef=useRef<AvatarImage|null>(null),pickLock=useRef(false);
 const lock=useRef(false),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(!lock.current)void photoRef.current?.dispose();};},[]);
 const [googleBusy,setGoogleBusy]=useState(false);
 async function submitGoogle(){
  if(lock.current||pickLock.current)return;
  if(mode==='register'){
   if(!name.trim()||name.trim().length>200){setError('Enter your full name (up to 200 characters).');return;}
   if(role==='patient')try{validateConsentChoice(consent);}catch(e){setError((e as Error).message);return;}
  }
  lock.current=true;setBusy(true);setGoogleBusy(true);setError(null);
  try{
   if(mode==='login')await loginGoogleUser();
   else {
    const identity=await registerGoogleUser(name.trim(),role,role==='patient'||isHostedAcademicDemo()?consent:undefined);
    if(identity){
     if(photoRef.current){const chosen=photoRef.current;photoRef.current=null;void Promise.resolve().then(()=>(require('../../services/avatarService') as typeof import('../../services/avatarService')).uploadRegistrationAvatar(identity.uid,chosen)).catch(()=>chosen.dispose());}
     onComplete?.(identity.uid);
    }
   }
  }catch(e){if(alive.current)setError(googleAuthMessage(e));}
  finally{lock.current=false;if(alive.current){setBusy(false);setGoogleBusy(false);}else void photoRef.current?.dispose();}
 }
 const googleOption=<><GoogleSignInButton disabled={busy||picking||!googleConfigured()} loading={googleBusy} onPress={()=>{void submitGoogle();}}/>
  {!googleConfigured()&&<Copy variant="caption" tone="muted">Google sign-in is not configured for this build. Email and password remain available.</Copy>}
  {googleConfigured()&&process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS==='true'&&<Copy variant="caption" tone="muted">Local Firebase test environment. Account selection uses real Google authentication.</Copy>}</>;
 function choosePhoto(){if(pickLock.current||lock.current)return;pickLock.current=true;setPicking(true);void Promise.resolve().then(()=>(require('../../services/avatarService') as typeof import('../../services/avatarService')).chooseAvatar()).then(async next=>{if(!next)return;if(!alive.current){await next.dispose();return;}await photoRef.current?.dispose();photoRef.current=next;setPhoto(next);}).catch(()=>{if(alive.current)setError('Unable to select a photo. You can continue without one.');}).finally(()=>{pickLock.current=false;if(alive.current)setPicking(false);});}
 async function submit(){if(lock.current||pickLock.current)return;const invalid=validateAuth(mode,email,password,name,confirm);setError(invalid);if(invalid)return;
  if(mode!=='login'&&role==='patient'){try{validateConsentChoice(consent);}catch(e){setError((e as Error).message);return;}}
  lock.current=true;setBusy(true);try{
   if(mode==='login')await loginUser(email.trim(),password);
   else {
    const identity=mode==='recover'?(role==='patient'?await completeUserRegistration(name.trim(),role,consent):await completeUserRegistration(name.trim(),role)):(role==='patient'?await registerUser(email.trim(),password,name.trim(),role,consent):await registerUser(email.trim(),password,name.trim(),role));
    if(identity){if(photoRef.current){const chosen=photoRef.current;photoRef.current=null;void Promise.resolve().then(()=>(require('../../services/avatarService') as typeof import('../../services/avatarService')).uploadRegistrationAvatar(identity.uid,chosen)).catch(()=>chosen.dispose());}onComplete?.(identity.uid);}
   }
  }catch(e){if(alive.current)setError(authError(e));else void photoRef.current?.dispose();}finally{lock.current=false;if(alive.current)setBusy(false);}
 }


 if(mode==='login')return <LoginLayout busy={busy} onBack={onBack} onSignUp={onAlternate} onAssistant={onAssistant} footer={footer}>
 <LoginFieldIcon kind="mail"><Field label="Email" placeholder="Enter your email" value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" style={{paddingLeft:48}}/></LoginFieldIcon>
 <RegistrationPassword label="Password" visible={visible} onToggle={()=>setVisible(v=>!v)} disabled={busy}><LoginFieldIcon kind="lock"><Field label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" style={{paddingLeft:48,paddingRight:56}}/></LoginFieldIcon></RegistrationPassword>
 {error&&<Notice message={error}/>}<Action title="Sign in" loading={busy&&!googleBusy} disabled={busy} onPress={()=>{void submit();}}/>{googleOption}
 </LoginLayout>;
 if(mode==='register')return <RegistrationLayout busy={busy||picking} photo={photo} onChoosePhoto={choosePhoto} onRemovePhoto={()=>{void photoRef.current?.dispose();photoRef.current=null;setPhoto(null);}} onBack={onBack} onSignIn={onAlternate}>
 <Field label="Full name" value={name} onChangeText={setName} editable={!busy} autoComplete="name" maxLength={200}/>
 <Field label="Email" value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email"/>
 <RegistrationPassword label="Password" visible={visible} onToggle={()=>setVisible(v=>!v)} disabled={busy}><Field label="Password" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" style={{paddingRight:56}}/></RegistrationPassword>
 <RegistrationPassword label="Confirm password" visible={confirmVisible} onToggle={()=>setConfirmVisible(v=>!v)} disabled={busy}><Field label="Confirm password" value={confirm} onChangeText={setConfirm} editable={!busy} secureTextEntry={!confirmVisible} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" style={{paddingRight:56}}/></RegistrationPassword>
 {role==='doctor'&&<Copy variant="caption" tone="muted">Doctor accounts require verification and approval before clinical access.</Copy>}
 {(role==='patient'||isHostedAcademicDemo())&&<PatientConsentControls noticeOnly={role==='doctor'} value={consent} onChange={setConsent} disabled={busy}/>}
 <Notice message={error}/><Action title="Create account" loading={busy&&!googleBusy} disabled={busy||picking} onPress={()=>{void submit();}}/>
 <Copy variant="caption" tone="muted">Or use Google with your full name and the choices above. Email and password fields are only required for email registration. Existing accounts keep their current role.</Copy>{googleOption}{footer}
 </RegistrationLayout>;
 return <Screen variant="form">{onBack&&<Action secondary title="Back" disabled={busy} onPress={onBack}/>}<Brand/><Card><Copy title>Create your account</Copy>
 <Copy>Help us personalise your experience. Your name and account type are saved securely.</Copy>
 {<><Action secondary selected={role==='patient'} title={role==='patient'?'Patient selected':'Register as a patient'} disabled={busy} onPress={()=>setRole('patient')}/><Action secondary selected={role==='doctor'} title={role==='doctor'?'Doctor selected':'Register as a doctor'} disabled={busy} onPress={()=>setRole('doctor')}/><Field label="Full name" value={name} onChangeText={setName} editable={!busy} autoComplete="name" maxLength={200}/>{role==='doctor'&&<Copy>Doctor accounts require verification and approval before clinical access. Registration does not grant approval.</Copy>}</>}
 {<><Copy>Profile picture is optional. If upload fails, your account still succeeds; manage or retry it from your profile.</Copy>{photo&&<Image source={{uri:photo.uri}} accessibilityLabel="Selected profile picture" style={{width:80,height:80,borderRadius:40}}/>}<Action secondary title="Choose optional profile picture" disabled={busy||picking} onPress={choosePhoto}/>{photo&&<Action secondary title="Remove selected picture" disabled={busy||picking} onPress={()=>{void photoRef.current?.dispose();photoRef.current=null;setPhoto(null);}}/>}</>}
 {(role==='patient'||isHostedAcademicDemo())&&<PatientConsentControls noticeOnly={role==='doctor'} value={consent} onChange={setConsent} disabled={busy}/>}
 <Notice message={error}/>{busy&&<Loading label="Please wait…"/>}<Action title="Retry account setup" disabled={busy||picking} onPress={()=>{void submit();}}/>
 {onAlternate&&<Action secondary disabled={busy} title="Already registered? Sign in" onPress={onAlternate}/>}{footer}</Card></Screen>;
}
