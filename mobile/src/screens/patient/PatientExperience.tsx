import React,{useEffect,useState} from 'react';
import {View,Pressable,Text} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {PatientStackParams} from '../../navigation/types';
import {useAuth} from '../../hooks/useAuth';
import {Action,Brand,Card,Copy,Field,Loading,Notice,Screen,usePalette} from '../../ui/design';
import {observeAppointments,consultationUnavailable,type AppointmentRow} from '../../services/appointmentReads';
import {getPatientDoctor,getDoctorTimes,type PublicDoctor} from '../../services/patientDoctors';

type Nav=Pick<NativeStackScreenProps<PatientStackParams,'Home'>['navigation'],'navigate'>;
export function PatientMenu({navigation}:{navigation:Nav}){
 const colors=usePalette();
 const icons={Home:'⌂',Doctors:'✚',Appointments:'▦',Profile:'○'};
 return <View style={{flexDirection:'row',flexWrap:'wrap',gap:4,borderTopWidth:1,borderColor:colors.border,paddingTop:12}}>{(['Home','Doctors','Appointments','Profile'] as const).map(name=><Pressable key={name} accessibilityRole="button" accessibilityLabel={name} onPress={()=>navigation.navigate(name)} style={({pressed})=>({flex:1,minWidth:64,minHeight:64,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:pressed?colors.surface:colors.background})}><Text accessible={false} style={{color:colors.accent,fontSize:24}}>{icons[name]}</Text><Text style={{color:colors.text,fontSize:12,textAlign:'center'}}>{name}</Text></Pressable>)}</View>;
}
const EMPTY_ROWS: AppointmentRow[] = [];
function usePatientAppointments(){
 const {firebaseUid,user,status}=useAuth(),focused=useIsFocused();
 const [state,setState]=useState<{uid:string;rows:AppointmentRow[];error:boolean;loading:boolean}>({uid:'',rows:[],error:false,loading:true});
 const [retry,setRetry]=useState(0);
 useEffect(()=>{if(!focused||!firebaseUid||status!=='ready'||user?.role!=='patient'||user.status!=='active')return;
  let active=true;setState({uid:firebaseUid,rows:[],error:false,loading:true});
  const stop=observeAppointments(firebaseUid,'patient',rows=>{if(active)setState({uid:firebaseUid,rows,error:false,loading:false});},()=>{if(active)setState({uid:firebaseUid,rows:[],error:true,loading:false});});
  return()=>{active=false;stop();};
 },[firebaseUid,status,user?.role,user?.status,focused,retry]);
 return {...(focused&&state.uid===firebaseUid?state:{rows:EMPTY_ROWS,error:false,loading:true}),retry:()=>setRetry(v=>v+1)};
}
export function PatientHomeScreen({navigation}:NativeStackScreenProps<PatientStackParams,'Home'>){
 const {user}=useAuth(),data=usePatientAppointments();
 const next=data.rows.filter(a=>a.status==='scheduled'&&a.endAt>Date.now()).sort((a,b)=>a.startAt-b.startAt)[0];
 return <Screen><Brand/><Copy title>Hello, {user?.fullName?.split(' ')[0]||'there'}</Copy><Copy>Your care, one step at a time.</Copy>
 <Card><Copy title>How can we help?</Copy><Action title="Find a doctor" onPress={()=>navigation.navigate('Doctors')}/><Action title="My appointments" onPress={()=>navigation.navigate('Appointments')}/><Action title="My profile" onPress={()=>navigation.navigate('Profile')}/></Card>
 <Card><Copy title>Next appointment</Copy>{data.loading?<Loading label="Loading appointments..."/>:data.error?<><Notice message="Unable to load appointments."/><Action title="Retry" onPress={data.retry}/></>:next?<><Copy>{new Date(next.startAt).toLocaleString()}</Copy><Copy>Scheduled consultation</Copy><Action title="View appointments" onPress={()=>navigation.navigate('Appointments')}/></>:<Copy>No upcoming appointment in your latest 50 records.</Copy>}</Card><PatientMenu navigation={navigation}/></Screen>;
}
export function PatientAppointments({navigation}:NativeStackScreenProps<PatientStackParams,'Appointments'>){
 const data=usePatientAppointments(),{firebaseUid}=useAuth();const [filter,setFilter]=useState('scheduled'),[now,setNow]=useState(Date.now());
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
 const rows=data.rows.filter(a=>a.status===filter);
 return <Screen><Copy title>Your appointments</Copy><Copy>Latest 50 appointments. Times shown in your device time zone.</Copy>
 <View style={{gap:8}}>{[['scheduled','Scheduled'],['completed','Completed'],['cancelled','Canceled'],['no_show','Not attended']].map(([value,label])=><Action key={value} secondary={value!==filter} title={label} onPress={()=>setFilter(value)}/>)}</View>
 {data.loading&&<Loading/>}{data.error&&<><Notice message="Unable to load appointments. Check your connection and account access."/><Action title="Retry" onPress={data.retry}/></>}
 {!data.loading&&!data.error&&!rows.length&&<Card><Copy>No appointments in this category.</Copy></Card>}
 {rows.map(a=>{const reason=consultationUnavailable(a,firebaseUid!,'patient',now);return <Card key={a.appointmentId}><Copy title>{new Date(a.startAt).toLocaleDateString()}</Copy><Copy>{new Date(a.startAt).toLocaleTimeString()}  -  {new Date(a.endAt).toLocaleTimeString()}</Copy><Copy>{a.status.replace('_',' ')}</Copy>{reason&&<Copy>{reason}</Copy>}<Action title="Open consultation" disabled={!!reason} onPress={()=>{if(!consultationUnavailable(a,firebaseUid!,'patient',Date.now()))navigation.navigate('Consultation',{appointmentId:a.appointmentId});}}/><Action secondary title="Doctor profile" onPress={()=>navigation.navigate('DoctorProfile',{doctorId:a.doctorId})}/></Card>;})}<PatientMenu navigation={navigation}/></Screen>;
}
export function DoctorsScreen({navigation}:NativeStackScreenProps<PatientStackParams,'Doctors'>){
 const data=usePatientAppointments(),[search,setSearch]=useState(''),[doctors,setDoctors]=useState<PublicDoctor[]>([]),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;setDoctors([]);setFailed(false);if(data.loading||data.error)return;
  setLoading(true);void Promise.allSettled([...new Set(data.rows.map(a=>a.doctorId))].map(uid=>getPatientDoctor(uid))).then(results=>{if(!active)return;setDoctors(results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]));setFailed(results.some(r=>r.status==='rejected'));setLoading(false);});return()=>{active=false;};
 },[data.rows,data.loading,data.error]);
 const matches=doctors.filter(d=>`${d.professionalName} ${d.specialty}`.toLowerCase().includes(search.trim().toLowerCase()));
 return <Screen><Copy title>Your doctors</Copy><Copy>Search doctors linked to your appointments. A full doctor directory is not available yet.</Copy><Field label="Search name or specialty" value={search} onChangeText={setSearch}/>
 {(data.loading||loading)&&<Loading label="Loading doctors..."/>}{(data.error||failed)&&<><Notice message="Some doctor profiles could not be loaded or are no longer available."/><Action title="Retry" onPress={data.retry}/></>}
 {!data.loading&&!loading&&!matches.length&&<Card><Copy>No matching doctors available.</Copy></Card>}
 {matches.map(d=><Card key={d.uid}><Copy title>{d.professionalName}</Copy><Copy>{d.specialty}</Copy><Copy>Verified public profile</Copy><Action title="View doctor" onPress={()=>navigation.navigate('DoctorProfile',{doctorId:d.uid})}/></Card>)}<PatientMenu navigation={navigation}/></Screen>;
}
export function DoctorProfileScreen({route,navigation}:NativeStackScreenProps<PatientStackParams,'DoctorProfile'>){
 const [doctor,setDoctor]=useState<PublicDoctor|null>(null),[times,setTimes]=useState<Awaited<ReturnType<typeof getDoctorTimes>>>([]),[error,setError]=useState(false),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 const focused=useIsFocused();
 useEffect(()=>{let active=true;setDoctor(null);setTimes([]);setError(false);setLoading(true);if(!focused)return;
  void getPatientDoctor(route.params.doctorId).then(async d=>{if(!active)return;setDoctor(d);const slots=await getDoctorTimes(d.uid);if(active)setTimes(slots);}).catch(()=>{if(active)setError(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[route.params.doctorId,focused,retry]);
 return <Screen><Copy title>Doctor profile</Copy>{loading&&<Loading/>}{error&&<><Notice message="Profile or availability unavailable. Please retry."/><Action title="Retry" onPress={()=>setRetry(v=>v+1)}/></>}
 {doctor&&<Card><Copy title>{doctor.professionalName}</Copy><Copy>{doctor.specialty}</Copy><Copy>Verified public profile. Private credential documents are not shared with patients.</Copy></Card>}
 {!loading&&!error&&<Card><Copy title>Available times</Copy><Copy>Next seven UTC dates; times shown locally. Availability is rechecked when booking.</Copy>{times.length?times.map(t=><Copy key={t.startAt}>{new Date(t.startAt).toLocaleString()}</Copy>):<Copy>No available times in this range.</Copy>}<Action title="Booking not yet available" disabled onPress={()=>{}}/><Copy>Mobile booking is not connected yet. No appointment has been created.</Copy></Card>}<PatientMenu navigation={navigation}/></Screen>;
}
export function PatientProfileScreen({navigation}:NativeStackScreenProps<PatientStackParams,'Profile'>){
 const {user,logout}=useAuth(),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 return <Screen><Copy title>My profile</Copy><Card><Copy title>{user?.fullName||'Patient'}</Copy><Copy>{user?.email}</Copy><Copy>Patient account</Copy><Copy>Health profile editing is not available in this presentation workflow yet.</Copy><Notice message={error}/><Action title="Sign out" disabled={busy} onPress={()=>{setBusy(true);void logout().catch(()=>setError('Unable to sign out. Please retry.')).finally(()=>setBusy(false));}}/></Card><PatientMenu navigation={navigation}/></Screen>;
}
