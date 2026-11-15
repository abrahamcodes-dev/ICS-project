import React,{useEffect,useRef,useState} from 'react';
import {Pressable,View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {DoctorStackParams} from '../../navigation/types';
import {useAuth} from '../../hooks/useAuth';
import {useAppointmentPatients} from '../../hooks/useAppointmentPatients';
import {useSchedulingSession} from '../../hooks/useSchedulingSession';
import {AppointmentPatient} from '../../components/AppointmentPatient';
import {observeAppointment,consultationUnavailable,type AppointmentRow} from '../../services/appointmentReads';
import {schedulingError} from '../../services/schedulingService';
import {Action,Card,Copy,Loading,Notice,Screen,Status,usePalette} from '../../ui/design';
import {PatientIcon,type PatientIconName} from '../../ui/PatientIcon';

export default function ConsultationDetailsScreen({route,navigation}:NativeStackScreenProps<DoctorStackParams,'ConsultationDetails'>){
 const identity=useAuth(),focused=useIsFocused();
 if(!focused)return null;
 if(identity.status!=='ready'||!identity.firebaseUid||identity.user?.role!=='doctor'||identity.user.status!=='active'||identity.user.verificationStatus!=='approved')return <Screen><Copy>An active, approved doctor account is required.</Copy></Screen>;
 return <ConsultationDetails key={identity.firebaseUid+':'+route.params.appointmentId} uid={identity.firebaseUid} id={route.params.appointmentId} back={()=>navigation.goBack()} join={()=>navigation.navigate('ConsultationRoom',{appointmentId:route.params.appointmentId})}/>;
}
export function canCancel(a:AppointmentRow,uid:string,now:number){return a.doctorId===uid&&a.status==='scheduled'&&now<a.startAt;}
export function ConsultationDetails({uid,id,back,join}:{uid:string;id:string;back():void;join():void}){
 const p=usePalette(),session=useSchedulingSession(uid),[row,setRow]=useState<AppointmentRow|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0),[now,setNow]=useState(Date.now());
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null),[failure,setFailure]=useState<string|null>(null),[info,setInfo]=useState<string|null>(null);
 const lock=useRef(false),alive=useRef(true),latest=useRef(row);latest.current=row;
 const patients=useAppointmentPatients(uid,row?[row]:[]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{let active=true;setRow(null);setError(false);setConfirm(false);
 const stop=observeAppointment(uid,'doctor',id,a=>{if(active)setRow(a);},()=>{if(active){setRow(null);setError(true);}});
 const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{active=false;stop();clearInterval(timer);};},[uid,id,retry]);
 async function cancel(){
  const a=latest.current;if(!session||!confirm||!a||lock.current||!canCancel(a,uid,Date.now()))return;
  lock.current=true;setBusy(true);setFailure(null);
  try{await session.cancel(id);if(alive.current){setMessage('Appointment cancelled.');setConfirm(false);setRetry(v=>v+1);}}
  catch(e){if(alive.current){setFailure(schedulingError(e));setConfirm(false);setRetry(v=>v+1);}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 const reason=row?consultationUnavailable(row,uid,'doctor',now):null;
 const time=(t:number)=>new Date(t).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
 const information=(icon:PatientIconName,label:string)=><View style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:8}}><PatientIcon name={icon} color={p.accent} size={22}/><Copy style={{flex:1}}>{label}</Copy></View>;
 return <Screen variant="dashboard">
  <View style={{flexDirection:'row',alignItems:'center',gap:6}}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={{width:44,height:44,justifyContent:'center'}}><Copy style={{fontSize:28}}>←</Copy></Pressable><Copy variant="heading" style={{flex:1,textAlign:'center',fontSize:19}}>Consultation Details</Copy>{row&&<Status label={row.status==='no_show'?'No-show':row.status.charAt(0).toUpperCase()+row.status.slice(1)} tone="neutral"/>}</View>
  {!row&&!error&&<Loading label="Loading consultation details..."/>}{error&&<><Notice message="Appointment unavailable. Check your connection and account access."/><Action title="Retry details" onPress={()=>setRetry(v=>v+1)}/></>}
  {row&&<>
   <Card><AppointmentPatient prominent display={patients[id]}/></Card>
   <Card style={{gap:2}}>{information('calendar',new Date(row.startAt).toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'}))}{information('clock',`${time(row.startAt)} – ${time(row.endAt)} · ${(row.endAt-row.startAt)/60000} minutes`)}{information('clock',Intl.DateTimeFormat().resolvedOptions().timeZone)}</Card>
   {(['Patient information','Previous consultations'] as const).map((label,index)=><Card key={label} style={{padding:12}}><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={()=>setInfo(index===0?'Patient medical information is not available through this appointment.':'Patient-specific consultation history is not available here. Your Consultations History tab lists your authorized appointments.')} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:12}}><PatientIcon name={index===0?'profile':'calendar'} size={24} color={p.accent}/><Copy variant="label" style={{flex:1}}>{label}</Copy><Copy>›</Copy></Pressable></Card>)}
   {info&&<Copy tone="muted">{info}</Copy>}
   <View style={{backgroundColor:p.infoSurface,borderRadius:14,padding:16}}><Copy style={{color:p.info}}>{reason??'Consultation is available. You can join now.'}</Copy></View>
   <Action title="Join consultation" disabled={!!reason||busy} onPress={()=>{const a=latest.current;if(a&&!busy&&!consultationUnavailable(a,uid,'doctor',Date.now()))join();}}/>
   {canCancel(row,uid,now)&&<Pressable accessibilityRole="button" accessibilityLabel="Cancel appointment" accessibilityState={{disabled:busy}} disabled={busy} onPress={()=>{setConfirm(true);setFailure(null);}} style={{minHeight:52,borderRadius:16,borderWidth:1,borderColor:p.error,alignItems:'center',justifyContent:'center'}}><Copy style={{color:p.error,fontWeight:'600'}}>Cancel appointment</Copy></Pressable>}
   {confirm&&canCancel(row,uid,now)&&<Card><Copy>Cancel this appointment? This cannot be undone.</Copy><Action title="Confirm cancellation" danger disabled={busy||!session} onPress={()=>void cancel()}/><Action title="Keep appointment" secondary disabled={busy} onPress={()=>setConfirm(false)}/></Card>}
  </>}
  {message&&<Copy>{message}</Copy>}<Notice message={failure}/>
 </Screen>;
}
