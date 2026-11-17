import React,{useEffect,useState} from 'react';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../hooks/useAuth';
import {onIdentityRefresh} from '../../services/authService';
import {readConsultationHistory} from '../../services/consultationHistory';
import type {ParticipantRole} from '../../services/appointmentReads';
import type {ConsultationView} from '../../services/consultationService';
import {Action,Copy,Loading,Screen} from '../../ui/design';
import {tr} from '../../i18n/translate';
import {useLocale} from '../../i18n/react';
import ConsultationChat from './ConsultationChat';

export default function ConsultationHistoryScreen({route}:{route?:{params?:{appointmentId?:string}}}) {
  useLocale();
  const identity=useAuth(), focused=useIsFocused(), id=route?.params?.appointmentId;
  const user=identity.user;
  if (!focused) return null;
  if (identity.status!=='ready' || user?.status!=='active' || !identity.firebaseUid
    || !['patient','doctor'].includes(user.role) || (user.role==='doctor' && user.verificationStatus!=='approved'))
    return <Screen><Copy>{tr('Sign in with an active patient or doctor account.')}</Copy></Screen>;
  if (!id || !/^[a-f0-9]{64}$/.test(id)) return <Screen><Copy>{tr('Open a scheduled appointment to enter its consultation.')}</Copy></Screen>;
  return <History key={`${identity.firebaseUid}:${user.role}:${id}`} id={id} uid={identity.firebaseUid} role={user.role as ParticipantRole}/>;
}

function History({id,uid,role}:{id:string;uid:string;role:ParticipantRole}) {
  useLocale();
  const [room,setRoom]=useState<ConsultationView|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
  const [blocked,setBlocked]=useState(false);
  useEffect(()=>{
    let alive=true; setRoom(null);setError(false);
    const stop=onIdentityRefresh(()=>{alive=false;setRoom(null);setBlocked(true);});
    void readConsultationHistory(id,uid,role).then(value=>{if(alive)setRoom(value);}).catch(()=>{if(alive)setError(true);});
    return()=>{alive=false;stop();};
  },[id,uid,role,attempt]);
  return <Screen><Copy title>{tr('Consultation history')}</Copy>
    <Copy>{tr('This consultation has ended. Calls and new messages are unavailable.')}</Copy>
    {blocked?<Copy>{tr('Session changed. Reopen the consultation to continue.')}</Copy>:error?<>
      <Copy>{tr('Unable to open this consultation. Check your connection, appointment time and eligibility.')}</Copy>
      <Action title={tr('Retry opening consultation')} onPress={()=>setAttempt(v=>v+1)}/>
    </>:room?<ConsultationChat room={room} uid={uid} readOnly/>:<Loading label={tr('Loading messages...')}/>}
  </Screen>;
}
