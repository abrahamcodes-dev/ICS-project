import {displayCode,systemMessage} from "../i18n/translate";
import {localeTag} from "../i18n/locale";
import {tr} from "../i18n/translate";
import {useLocale} from "../i18n/react";
import React,{useEffect,useRef,useState} from 'react';
import {Alert} from 'react-native';
import {Action,Card,Copy,Loading,Notice} from '../ui/design';
import {PatientConsentControls} from './PatientConsentControls';
import {consentRequest,loadPatientConsent,savePatientConsent,validateConsentChoice,type ConsentChoice} from '../services/patientConsent';
import type {PatientConsentInput,PatientConsentState} from '@shared/types/consent';

export function PatientPrivacy({uid}:{uid:string}){
  useLocale();
 const [state,setState]=useState<PatientConsentState|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState('');
 const [choice,setChoice]=useState<ConsentChoice>({privacyAcknowledged:false,sharingDecision:null});
 const alive=useRef(true),lock=useRef(false),pending=useRef<PatientConsentInput|null>(null);
 async function reload(){if(lock.current)return;lock.current=true;setBusy(true);setError(null);try{const next=await loadPatientConsent(uid);if(alive.current){setState(next);setLoaded(true);pending.current=null;setChoice({privacyAcknowledged:false,sharingDecision:null});}}catch{if(alive.current)setError(tr("Unable to load privacy choices. Retry before making changes."));}finally{lock.current=false;if(alive.current)setBusy(false);}}
 useEffect(()=>{alive.current=true;void reload();return()=>{alive.current=false;};},[uid]);
 async function save(withdraw=false){if(lock.current||!loaded)return;
  if(!withdraw&&!pending.current){try{validateConsentChoice(choice);}catch(e){setError((e as Error).message);return;}}
  const request=pending.current??consentRequest(state?.revision??0,withdraw?'withdrawn':choice.sharingDecision!,'profile');pending.current=request;
  lock.current=true;setBusy(true);setError(null);setMessage('');
  try{const next=await savePatientConsent(uid,request);if(alive.current){setState(next);pending.current=null;setChoice({privacyAcknowledged:false,sharingDecision:null});setMessage(tr("Your decision has been saved. Medical-record sharing remains disabled."));}}
  catch(e){if(alive.current){const conflict=(e as {code?:string}).code?.includes('aborted');setError(conflict?tr("Your choices changed elsewhere. Reload before saving."):tr("Unable to confirm the save. Retry the same decision or reload its status."));}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <Card><Copy variant="heading">{tr("Privacy & Consent")}</Copy>{!loaded&&busy&&<Loading label={tr("Loading privacy choices")}/>}
 {loaded&&<><Copy>{state?tr("Medical-record sharing decision: {0}", {"0": displayCode(state.sharingDecision)}):tr("No acknowledgement or sharing decision recorded. Nothing has been assumed.")}</Copy>{state&&<Copy tone="muted">{state.documentVersion} {tr("· Recorded")}{' '}{new Date(state.recordedAt).toLocaleString(localeTag())}</Copy>}
 <PatientConsentControls showHeading={false} value={choice} disabled={busy||!!pending.current} onChange={setChoice}/>
 <Action title={pending.current?tr("Retry privacy save"):tr("Save privacy choices")} disabled={busy} loading={busy} onPress={()=>{void save();}}/>
 {state?.sharingDecision==='granted'&&!pending.current&&<Action secondary title={tr("Withdraw medical-record sharing consent")} disabled={busy} onPress={()=>Alert.alert(tr("Withdraw consent?"),tr("Future medical-record sharing governed by this choice will remain blocked. Existing appointments, chats and prescriptions are unaffected; records are not deleted."),[{text:tr("Keep consent"),style:'cancel'},{text:tr("Withdraw"),style:'destructive',onPress:()=>{void save(true);}}])}/>}</>}
 <Notice message={error}/>{!!message&&<Copy accessibilityLiveRegion="polite">{systemMessage(message)}</Copy>}<Action secondary title={tr("Reload privacy status")} disabled={busy} onPress={()=>{void reload();}}/></Card>;
}
