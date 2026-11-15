import {useAppointmentPatients} from '../../hooks/useAppointmentPatients';
import {AppointmentPatient} from '../../components/AppointmentPatient';
import React,{useEffect,useState} from 'react';
import {Pressable,View} from 'react-native';
import {Action,Card,Copy,Loading,Notice,Screen,Status,usePalette} from '../../ui/design';
import {PatientIcon} from '../../ui/PatientIcon';
import {ProfileAvatar} from '../../components/ProfileAvatar';
import {useAuth} from '../../hooks/useAuth';
import {readOwnDoctorProfile} from '../../services/doctorProfileRead';
import {consultationUnavailable,type AppointmentRow} from '../../services/appointmentReads';

type Props={uid:string;rows:AppointmentRow[];loading:boolean;error:boolean;now:number;retry():void;viewAll():void;open(id:string):void;notifications():void;prescriptions():void};
const time=(value:number)=>new Date(value).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
export default function DoctorHomeDashboard({uid,rows,loading,error,now,retry,viewAll,open,notifications,prescriptions}:Props){
 const p=usePalette(),{user}=useAuth(),[professionalName,setProfessionalName]=useState<string|null>(null);
 useEffect(()=>{let active=true;setProfessionalName(null);void readOwnDoctorProfile(uid).then(profile=>{if(active)setProfessionalName(profile?.professionalName??null);}).catch(()=>{});return()=>{active=false;};},[uid]);
 const name=professionalName||user?.fullName||'Doctor',hour=new Date(now).getHours();
 const greeting=hour<12?'Good morning,':hour<18?'Good afternoon,':'Good evening,';
 const ordered=[...rows].sort((a,b)=>a.startAt-b.startAt);
 const next=ordered.find(a=>a.status==='scheduled'&&a.endAt+900000>now);
 const today=ordered.filter(a=>new Date(a.startAt).toDateString()===new Date(now).toDateString());
 const visible=[...new Map([...today,...(next?[next]:[])].map(a=>[a.appointmentId,a])).values()];
 const patients=useAppointmentPatients(uid,visible);
 const reason=next?consultationUnavailable(next,uid,'doctor',now):null;
 const join=(a:AppointmentRow)=>{if(!consultationUnavailable(a,uid,'doctor',Date.now()))open(a.appointmentId);};
 return <Screen variant="dashboard">
  <View style={{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:p.surface,borderRadius:20,padding:12}}>
   <ProfileAvatar uid={uid} name={name} size={56}/><View style={{flex:1,gap:3}}><Copy tone="muted" variant="label">{greeting}</Copy><Copy style={{fontSize:19,lineHeight:25,fontWeight:'700'}}>{name}</Copy>{user?.role==='doctor'&&user.verificationStatus==='approved'&&<View style={{alignSelf:'flex-start'}}><Status label="Verified Doctor" tone="success"/></View>}</View>
   <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={notifications} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><PatientIcon name="bell" color={p.text} size={25}/></Pressable>
  </View>
  <Card tone="mint" style={{padding:20,gap:14}}><Copy variant="heading" style={{fontSize:19,lineHeight:25}}>Your next consultation</Copy>
   {loading?<Loading label="Loading your schedule..."/>:error?<><Notice message="Unable to load appointments."/><Action title="Retry" onPress={retry}/></>:next?<>
    <View style={{flexDirection:'row',gap:10,alignItems:'center'}}><PatientIcon name="calendar" color={p.primary} size={22}/><Copy variant="label" style={{flex:1}}>{new Date(next.startAt).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}, {time(next.startAt)} – {time(next.endAt)}</Copy></View>
    <AppointmentPatient key={uid+':'+next.appointmentId} display={patients[next.appointmentId]}/>
    <Action title="Join consultation" disabled={!!reason} onPress={()=>join(next)}/>{reason&&<Copy tone="muted" variant="caption">{reason}</Copy>}
   </>:<><Copy>No upcoming consultation</Copy><Copy tone="muted">Your next booked consultation will appear here.</Copy></>}
  </Card>
  <View style={{gap:12}}><View style={{flexDirection:'row',alignItems:'center',gap:8}}><Copy variant="heading" style={{flex:1,fontSize:18,lineHeight:24}}>Today's appointments</Copy><Pressable accessibilityRole="button" accessibilityLabel="View all appointments" onPress={viewAll} style={{minHeight:44,justifyContent:'center',paddingHorizontal:8}}><Copy variant="label" style={{color:p.accent}}>View all</Copy></Pressable></View>
   {!loading&&!error&&(today.length?<Card style={{padding:12,gap:0}}>{today.map((a,index)=>{const unavailable=consultationUnavailable(a,uid,'doctor',now);return <View key={a.appointmentId} style={{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:14,borderTopWidth:index?1:0,borderColor:p.border}}><View style={{width:72,backgroundColor:p.background,borderRadius:12,paddingVertical:12,alignItems:'center'}}><Copy variant="label" style={{textAlign:'center'}}>{time(a.startAt)}</Copy></View><View style={{flex:1,gap:3}}><AppointmentPatient key={uid+':'+a.appointmentId} compact display={patients[a.appointmentId]}/><Copy tone="muted" variant="caption">Until {time(a.endAt)}</Copy></View>{unavailable?<Status label={a.status==='no_show'?'No-show':a.status.charAt(0).toUpperCase()+a.status.slice(1)} tone="neutral"/>:<Action title="Join" onPress={()=>join(a)}/>}</View>;})}</Card>:<Card style={{padding:20}}><Copy variant="label">No appointments today</Copy><Copy tone="muted">Your booked consultations for today will appear here.</Copy></Card>)}
  </View>
  <Pressable accessibilityRole="button" accessibilityLabel="Consultation prescriptions" onPress={prescriptions} style={{minHeight:44,justifyContent:'center',alignItems:'center'}}><Copy variant="label" style={{color:p.accent}}>Consultation prescriptions</Copy></Pressable>
 </Screen>;
}
