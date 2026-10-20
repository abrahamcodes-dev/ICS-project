import React,{useEffect,useState} from 'react';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {PatientStackParams} from '../../navigation/types';
import {useAuth} from '../../hooks/useAuth';
import {Action,Brand,Card,Copy,Loading,Notice,Screen} from '../../ui/design';
import {observeAppointments,type AppointmentRow} from '../../services/appointmentReads';

import {PatientMenu} from './PatientMenu';
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
 const {user}=useAuth(),data=usePatientAppointments();
 const next=data.rows.filter(a=>a.status==='scheduled'&&a.endAt>Date.now()).sort((a,b)=>a.startAt-b.startAt)[0];
 return <Screen><Brand/><Copy title>Hello, {user?.fullName?.split(' ')[0]||'there'}</Copy><Copy>Your care, one step at a time.</Copy>
 <Action title="My prescriptions" onPress={()=>navigation.navigate('Prescriptions')}/>
 <Action title="Notifications" onPress={()=>navigation.navigate('Notifications')}/>
 <Card><Copy title>How can we help?</Copy><Action title="Find a doctor" onPress={()=>navigation.navigate('Doctors')}/><Action title="My appointments" onPress={()=>navigation.navigate('Appointments')}/><Action title="My profile" onPress={()=>navigation.navigate('Profile')}/></Card>
 <Card><Copy title>Next appointment</Copy>{data.loading?<Loading label="Loading appointments..."/>:data.error?<><Notice message="Unable to load appointments."/><Action title="Retry" onPress={data.retry}/></>:next?<><Copy>{new Date(next.startAt).toLocaleString()}</Copy><Copy>Scheduled consultation</Copy><Action title="View appointments" onPress={()=>navigation.navigate('Appointments')}/></>:<Copy>No upcoming appointment.</Copy>}</Card><PatientMenu navigation={navigation}/></Screen>;
}
export {PatientAppointments,DoctorsScreen,DoctorProfileScreen} from './PatientScheduling';
export function PatientProfileScreen({navigation}:NativeStackScreenProps<PatientStackParams,'Profile'>){
 const {user,logout}=useAuth(),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 return <Screen><Copy title>My profile</Copy><Card><Copy title>{user?.fullName||'Patient'}</Copy><Copy>{user?.email}</Copy><Copy>Patient account</Copy><Copy>Health profile editing is not available in this presentation workflow yet.</Copy><Notice message={error}/><Action title="Sign out" disabled={busy} onPress={()=>{setBusy(true);void logout().catch(()=>setError('Unable to sign out. Please retry.')).finally(()=>setBusy(false));}}/></Card><PatientMenu navigation={navigation}/></Screen>;
}
