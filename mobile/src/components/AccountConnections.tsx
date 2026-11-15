import React,{useEffect,useRef,useState} from 'react';
import {Alert,View} from 'react-native';
import {Action,Copy,Field,Notice} from '../ui/design';
import {googleConfigured,googleConnection,googleAuthMessage,linkGoogleAccount} from '../services/googleAuth';

export function AccountConnections({uid}:{uid:string}){
 const [open,setOpen]=useState(false),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[linked,setLinked]=useState(false);
 const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[uid]);
 const connection=googleConnection(uid);if(!connection)return null;
 if(connection.linked||linked)return <Copy variant="caption" tone="muted">Google sign-in is linked to this account.</Copy>;
 if(!connection.password)return null;
 async function link(){
  if(lock.current)return;lock.current=true;setBusy(true);setError(null);
  const proof=password;setPassword('');
  try{if(await linkGoogleAccount(proof)){if(alive.current){setLinked(true);setOpen(false);}}}
  catch(e){if(alive.current)setError(googleAuthMessage(e));}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <View style={{gap:12}}><Action secondary title="Link Google account" disabled={busy||!googleConfigured()} onPress={()=>setOpen(v=>!v)}/>
  {!googleConfigured()&&<Copy variant="caption" tone="muted">Google sign-in is not configured for this build.</Copy>}
  {open&&<><Copy>Confirm your current password, then choose your Google account with the same email. This keeps your CallADoc account, email and records. Accounts will not be merged.</Copy>
   <Field label="Current password for account linking" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" editable={!busy}/>
   <Action secondary title="Confirm Google linking" loading={busy} disabled={busy||!password} onPress={()=>Alert.alert('Link Google sign-in?','You will be able to use Google or your existing password for this same CallADoc account. Choose only your own Google account.',[
    {text:'Cancel',style:'cancel'},{text:'Link Google',onPress:()=>{void link();}},
   ])}/></>}
  <Notice message={error}/>
 </View>;
}
