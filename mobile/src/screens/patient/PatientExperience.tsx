import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import {AccountConnections} from '../../components/AccountConnections';
import {PaymentHistory} from '../../components/Payments';
import {AccountDeletion} from '../../components/AccountDeletion';
import {PatientPrivacy} from '../../components/PatientPrivacy';
import {PatientHomeDashboard} from './PatientHomeDashboard';
﻿import React,{useEffect,useState} from 'react';
import {View,ScrollView} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {PatientStackParams} from '../../navigation/types';
import {useAuth} from '../../hooks/useAuth';
import {Action,Card,Copy,Field,Loading,Notice,Screen,Status} from '../../ui/design';
import {observeAppointments,type AppointmentRow} from '../../services/appointmentReads';

import {AvatarEditor} from '../../components/ProfileAvatar';
import {PatientMenu,PatientAvatar} from './PatientMenu';
export {PatientMenu} from './PatientMenu';
const EMPTY_ROWS: AppointmentRow[] = [];
function usePatientAppointments(){
 const {firebaseUid,user,status}=useAuth(),focused=useIsFocused();
 const [state,setState]=useState<{uid:string;rows:AppointmentRow[];error:boolean;loading:boolean}>({uid:'',rows:[],error:false,loading:true});
 const [retry,setRetry]=useState(0);
 useEffect(()=>{if(!focused||!firebaseUid||status!=='ready'||user?.role!=='patient'||user.status!=='active')return;
  let active=true;setState({uid:firebaseUid,rows:[],error:false,loading:true});
  const stop=observeAppointments(firebaseUid,'patient',rows=>{if(active)setState({uid:firebaseUid,rows,error:false,loading:false});},()=>{if(active)setState({uid:firebaseUid,rows:[],error:true,loading:false});},true);
  return()=>{active=false;stop();};
 },[firebaseUid,status,user?.role,user?.status,focused,retry]);
 return {...(focused&&state.uid===firebaseUid?state:{rows:EMPTY_ROWS,error:false,loading:true}),retry:()=>setRetry(v=>v+1)};
}
export function PatientHomeScreen({navigation}:NativeStackScreenProps<PatientStackParams,'Home'>){
  useLocale();
 const data=usePatientAppointments();return <PatientHomeDashboard navigation={navigation} data={data}/>;
}
export {PatientAppointments,DoctorsScreen,DoctorProfileScreen} from './PatientScheduling';
export function PatientProfileScreen({navigation}:NativeStackScreenProps<PatientStackParams,'Profile'>){
  useLocale();
 const {user,logout,firebaseUid}=useAuth(),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 return <Screen variant="dashboard" footer={<PatientMenu navigation={navigation} active="Profile"/>}><Copy title>{tr("My profile")}</Copy><Card><Copy title>{user?.fullName||tr("Patient")}</Copy><Copy>{user?.email}</Copy><Copy>{tr("Patient account")}</Copy><Copy>{tr("Health profile editing is not available in this presentation workflow yet.")}</Copy>{firebaseUid&&<AvatarEditor key={firebaseUid} uid={firebaseUid}/>}{firebaseUid&&<PatientPrivacy key={`privacy:${firebaseUid}`} uid={firebaseUid}/>}{firebaseUid&&<AccountConnections key={`connections:${firebaseUid}`} uid={firebaseUid}/>}{firebaseUid&&<AccountDeletion key={`deletion:${firebaseUid}`} uid={firebaseUid}/>}{firebaseUid&&<PaymentHistory key={`payments:${firebaseUid}`} uid={firebaseUid} confirmed={()=>navigation.navigate('Appointments')}/>}<Notice message={error}/><Action title={tr("Sign out")} disabled={busy} onPress={()=>{setBusy(true);void logout().catch(()=>setError(tr("Unable to sign out. Please retry."))).finally(()=>setBusy(false));}}/></Card></Screen>;
}
