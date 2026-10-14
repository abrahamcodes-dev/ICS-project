import React,{useEffect,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {DoctorStackParams} from '../../navigation/types';
import {useAuth} from '../../hooks/useAuth';
import {Action,Card,Copy,Field,Loading,Notice,Screen,usePalette} from '../../ui/design';
import {observeAppointments,consultationUnavailable,type AppointmentRow} from '../../services/appointmentReads';
import {readOwnDoctorProfile} from '../../services/doctorProfileRead';

export const doctorTabs=['Home','Schedule','Consultations','Profile'] as const;
type Tab=typeof doctorTabs[number];
export function localDay(time:number){const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function validDay(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(`${value}T12:00:00`);return Number.isFinite(d.getTime())&&localDay(d.getTime())===value;}

export default function DoctorWorkspace({navigation}:NativeStackScreenProps<DoctorStackParams,'DoctorWorkspace'>){
 const identity=useAuth(),focused=useIsFocused(),colors=usePalette();
 const [tab,setTab]=useState<Tab>('Home');
 if(!focused)return null;
 if(identity.status!=='ready'||identity.user?.role!=='doctor'||identity.user.status!=='active'||identity.user.verificationStatus!=='approved'||!identity.firebaseUid)
  return <Screen><Copy>Clinical access requires an active, approved doctor account.</Copy></Screen>;
 return <View style={{flex:1,backgroundColor:colors.background}}>
  <DoctorContent key={`${identity.firebaseUid}:${tab}`} uid={identity.firebaseUid} tab={tab} select={setTab} open={appointmentId=>navigation.navigate('ConsultationRoom',{appointmentId})}/>
  <SafeAreaView edges={['bottom']} style={{backgroundColor:colors.surface,borderTopWidth:1,borderColor:colors.border}}>
   <View style={{flexDirection:'row'}}>{doctorTabs.map(name=><Pressable key={name} accessibilityRole="tab" accessibilityLabel={name} accessibilityState={{selected:tab===name}} onPress={()=>setTab(name)} style={({pressed})=>({flex:1,minHeight:64,paddingVertical:12,paddingHorizontal:4,alignItems:'center',justifyContent:'center',opacity:pressed?0.65:1,borderTopWidth:3,borderTopColor:tab===name?colors.accent:'transparent'})}><Text style={{color:colors.text,fontSize:12,fontWeight:tab===name?'700':'400',textAlign:'center'}}>{name}</Text></Pressable>)}</View>
  </SafeAreaView>
 </View>;
}

export function DoctorContent({uid,tab,select,open}:{uid:string;tab:Tab;select(tab:Tab):void;open(id:string):void}){
 const {user}=useAuth();const [rows,setRows]=useState<AppointmentRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 const [now,setNow]=useState(Date.now()),[day,setDay]=useState(localDay(Date.now())),[previous,setPrevious]=useState(false);
 useEffect(()=>{if(tab==='Profile')return;let active=true;setLoading(true);setError(false);setRows([]);
  const stop=observeAppointments(uid,'doctor',value=>{if(active){setRows(value);setLoading(false);}},()=>{if(active){setRows([]);setLoading(false);setError(true);}});
  const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{active=false;stop();clearInterval(timer);};
 },[uid,tab,retry]);
 if(tab==='Profile')return <DoctorAccount uid={uid}/>;
 const today=rows.filter(a=>localDay(a.startAt)===localDay(now));
 const next=rows.filter(a=>a.status==='scheduled'&&a.endAt+900000>now).sort((a,b)=>a.startAt-b.startAt)[0];
 const list=tab==='Home'?today:tab==='Schedule'?rows.filter(a=>localDay(a.startAt)===day):rows.filter(a=>previous?(a.status!=='scheduled'||a.endAt+900000<=now):(a.status==='scheduled'&&a.endAt+900000>now));
 return <Screen><Copy title>{tab==='Home'?`Hello, ${user?.fullName||'Doctor'}`:tab}</Copy>
  {tab==='Home'&&<><Copy>Verification status: {user?.role==='doctor'?user.verificationStatus:'Unavailable'}</Copy><Card><Copy title>Your next consultation</Copy>{!loading&&!error&&next?<><Copy>{new Date(next.startAt).toLocaleString()}</Copy><Action title="View consultations" onPress={()=>select('Consultations')}/></>:<Copy>{loading?'Loading your schedule…':error?'Schedule unavailable.':'No upcoming consultation in your latest 50 records.'}</Copy>}</Card><Action title="Manage my schedule" onPress={()=>select('Schedule')}/><Action secondary title="My consultations" onPress={()=>select('Consultations')}/><Copy title>Today’s appointments</Copy></>}
  {tab==='Schedule'&&<><Field label="Schedule date (YYYY-MM-DD)" value={day} onChangeText={setDay} autoCapitalize="none" maxLength={10}/>{!validDay(day)&&<Notice message="Enter a valid calendar date."/>}<Card><Copy title>Availability</Copy><Copy>Availability slots and editing are not available in this doctor interface yet. Your appointments below are confirmed records, not open slots.</Copy><Action title="Availability editing unavailable" disabled onPress={()=>{}}/></Card></>}
  {tab==='Consultations'&&<View style={{gap:8}}><Action title="Upcoming and active" secondary={previous} onPress={()=>setPrevious(false)}/><Action title="Previous and canceled" secondary={!previous} onPress={()=>setPrevious(true)}/></View>}
  <Copy>Latest 50 appointments. Dates and times use your device time zone.</Copy>
  {loading&&<Loading label="Loading appointments…"/>}{error&&<><Notice message="Unable to load appointments. Check your connection and account access."/><Action title="Retry" onPress={()=>setRetry(v=>v+1)}/></>}
  {!loading&&!error&&list.length===0&&<Card><Copy>No appointments in this view.</Copy></Card>}
  {[...list].sort((a,b)=>a.startAt-b.startAt).map(a=><DoctorAppointmentCard key={a.appointmentId} appointment={a} uid={uid} now={now} open={open}/>)}</Screen>;
}
export function DoctorAppointmentCard({appointment:a,uid,now,open}:{appointment:AppointmentRow;uid:string;now:number;open(id:string):void}){
 const reason=consultationUnavailable(a,uid,'doctor',now);
 return <Card><Copy title>{new Date(a.startAt).toLocaleDateString()}</Copy><Copy>{new Date(a.startAt).toLocaleTimeString()} – {new Date(a.endAt).toLocaleTimeString()}</Copy><Copy>Status: {a.status.replace('_',' ')}</Copy>{reason&&<Copy>{reason}</Copy>}<Action title="Open consultation" disabled={!!reason} onPress={()=>{if(!consultationUnavailable(a,uid,'doctor',Date.now()))open(a.appointmentId);}}/></Card>;
}
function DoctorAccount({uid}:{uid:string}){
 const {user,logout}=useAuth();const [profile,setProfile]=useState<Awaited<ReturnType<typeof readOwnDoctorProfile>>>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setLoading(true);setProfile(null);setError(null);void readOwnDoctorProfile(uid).then(p=>{if(active)setProfile(p);}).catch(()=>{if(active)setError('Unable to load your professional profile.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[uid,retry]);
 return <Screen><Copy title>Doctor profile</Copy><Card><Copy title>{user?.fullName}</Copy><Copy>{user?.email}</Copy><Copy>Verification status: {user?.role==='doctor'?user.verificationStatus:'Unavailable'}</Copy></Card>
 <Card><Copy title>Professional information</Copy>{loading&&<Loading/>}<Notice message={error}/>{error&&<Action title="Retry profile" onPress={()=>setRetry(v=>v+1)}/>}{profile?Object.entries(profile).map(([key,value])=><View key={key}><Copy>{({professionalName:'Professional name',specialty:'Specialty',phoneNumber:'Phone',registrationNumber:'Registration number',issuingAuthority:'Issuing authority'} as Record<string,string>)[key]}</Copy><Copy>{value}</Copy></View>):!loading&&!error&&<Copy>No professional profile available.</Copy>}<Copy>These are your stored professional fields. Editing and credential submission are not connected in this screen.</Copy></Card>
 <Action title="Sign out" disabled={busy} onPress={()=>{setBusy(true);void logout().catch(()=>setError('Unable to sign out. Please retry.')).finally(()=>setBusy(false));}}/></Screen>;
}
