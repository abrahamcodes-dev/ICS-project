import {localeTag} from "../../i18n/locale";
import {systemMessage} from '../../i18n/translate';
import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import React, {useEffect,useState} from 'react';
import {Button, ScrollView, Text, View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {PatientStackParams,DoctorStackParams} from '../../navigation/types';
import {useAuth} from '../../hooks/useAuth';
import {observeAppointments,consultationUnavailable, type AppointmentRow, type ParticipantRole} from '../../services/appointmentReads';

function Appointments({role,open,history}: {role:ParticipantRole;open(id:string):void;history?(id:string):void}) {
  useLocale();
  const identity=useAuth(), focused=useIsFocused();
  if (!focused) return null;
  if (identity.status !== 'ready' || identity.user?.status !== 'active' || identity.user.role !== role || !identity.firebaseUid)
    return <Text>{tr("Sign in with an active")}{role} {tr("account.")}</Text>;
  return <AppointmentList key={`${role}:${identity.firebaseUid}`} uid={identity.firebaseUid} role={role} open={open} history={history}/>;
}
export function AppointmentList({uid,role,open,history}: {uid:string;role:ParticipantRole;open(id:string):void;history?(id:string):void}) {
  useLocale();
  const [rows,setRows]=useState<AppointmentRow[]>([]),[error,setError]=useState(false),[loading,setLoading]=useState(true);
  const [attempt,setAttempt]=useState(0),[now,setNow]=useState(Date.now());
  useEffect(()=>{
    let active=true;setRows([]);setLoading(true);setError(false);
    const stop=observeAppointments(uid,role,value=>{if(active){setRows(value);setLoading(false);}},()=>{
      if(active){setRows([]);setError(true);setLoading(false);}
    });
    const timer=setInterval(()=>setNow(Date.now()),1000);
    return ()=>{active=false;stop();clearInterval(timer);};
  },[uid,role,attempt]);
  return <ScrollView contentContainerStyle={{padding:20,gap:16}}>
    <Text accessibilityRole="header">{tr("My appointments")}</Text>
    <Text>{tr("Latest 50 appointments. Both participants must open the same appointment. Server eligibility is checked when opening and starting a call.")}</Text>
    {loading && <Text>{tr("Loading appointments…")}</Text>}
    {error && <View><Text>{tr("Unable to load appointments. Check your connection and account access.")}</Text><Button title={tr("Retry")} onPress={()=>setAttempt(v=>v+1)}/></View>}
    {!loading && !error && !rows.length && <Text>{tr("No appointments found. A scheduled appointment must be booked before calling.")}</Text>}
    {rows.map(a=>{const reason=consultationUnavailable(a,uid,role,now);return <View key={a.appointmentId} style={{gap:8}}>
      <Text>{new Date(a.startAt).toLocaleString(localeTag())} — {a.status.replace('_',' ')}</Text>
      {reason && <Text>{systemMessage(reason)}</Text>}
      {history && a.status==='completed' && a[`${role}Id`]===uid && <Button title={tr("View consultation history")} onPress={()=>history(a.appointmentId)}/>}
      <Button title={tr("Open consultation")} disabled={!!reason} onPress={()=>{
        if(!consultationUnavailable(a,uid,role,Date.now()))open(a.appointmentId);
      }}/>
    </View>;})}
  </ScrollView>;
}
export function PatientAppointmentsScreen({navigation}:NativeStackScreenProps<PatientStackParams,'Appointments'>){
  useLocale();
  return <Appointments history={appointmentId=>navigation.navigate('ConsultationHistory',{appointmentId})} role="patient" open={appointmentId=>navigation.navigate('Consultation',{appointmentId})}/>;
}
export function DoctorAppointmentsScreen({navigation}:NativeStackScreenProps<DoctorStackParams,'Appointments'>){
  useLocale();
  return <Appointments history={appointmentId=>navigation.navigate('ConsultationHistory',{appointmentId})} role="doctor" open={appointmentId=>navigation.navigate('ConsultationRoom',{appointmentId})}/>;
}
