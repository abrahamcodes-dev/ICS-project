import React,{useEffect,useState} from 'react';
import {Image,Pressable,TextInput,View,useWindowDimensions} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {PatientStackParams} from '../../navigation/types';
import {useAuth} from '../../hooks/useAuth';
import {Action,Card,Copy,Loading,Notice,Screen,usePalette} from '../../ui/design';
import {PatientIcon,type PatientIconName} from '../../ui/PatientIcon';
import {PatientMenu,PatientAvatar} from './PatientMenu';
import {consultationUnavailable,type AppointmentRow} from '../../services/appointmentReads';
import {getPatientDoctor,type PublicDoctor} from '../../services/patientDoctors';
import {createNotificationSession} from '../../services/notificationService';

const specialties=(p:ReturnType<typeof usePalette>):{label:string;icon:PatientIconName;color:string;background:string}[]=>[
 {label:'General Practice',icon:'stethoscope',color:p.success,background:p.successSurface},
 {label:'Dermatology',icon:'skin',color:p.tertiary,background:p.tertiarySurface},
 {label:'Pediatrics',icon:'baby',color:p.info,background:p.infoSurface},
 {label:'Mental Health',icon:'brain',color:p.purple,background:p.purpleSurface},
];
type Navigation=NativeStackScreenProps<PatientStackParams,'Home'>['navigation'];
export function PatientHomeDashboard({navigation,data}:{navigation:Navigation;data:{rows:AppointmentRow[];loading:boolean;error:boolean;retry():void}}) {
 const p=usePalette(),{user,firebaseUid}=useAuth(),focused=useIsFocused();
 const {width}=useWindowDimensions();
 const doctorWidth=Math.min(150,width*.34)*1.4;
 const tileSize=Math.min(76,Math.max(44,(width-48-24)/4)),iconSize=Math.min(44,tileSize*.6);
 const [search,setSearch]=useState(''),[now,setNow]=useState(Date.now),[unread,setUnread]=useState<string|null>(null);
 useEffect(()=>{if(!focused||!firebaseUid)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),15000);let active=true;setUnread(null);
  const session=createNotificationSession(firebaseUid);
  void session.list().then(page=>{if(active)setUnread(page.items.some(n=>!n.read)?firebaseUid:null);}).catch(()=>{if(active)setUnread(null);});
  return()=>{active=false;clearInterval(timer);session.dispose();};
 },[focused,firebaseUid]);
 const next=data.rows.filter(a=>a.status==='scheduled'&&a.endAt+15*60000>now).sort((a,b)=>a.startAt-b.startAt)[0];
 const hour=new Date(now).getHours(),greeting=hour<12?'Good morning,':hour<18?'Good afternoon,':'Good evening,';
 const firstName=user?.fullName?.trim().split(/\s+/)[0]||'Patient';
 return <Screen variant="dashboard" footer={<PatientMenu navigation={navigation} active="Home"/>}>
  <View style={{flexDirection:'row',alignItems:'center',gap:16}}><PatientAvatar uid={firebaseUid??undefined} name={user?.fullName||'Patient'}/><View style={{flex:1}}><Copy tone="muted" style={{fontSize:16,lineHeight:22}}>{greeting}</Copy><Copy title style={{fontSize:28,lineHeight:36}}>{firstName}</Copy></View>
   <Pressable accessibilityRole="button" accessibilityLabel={unread!==null&&unread===firebaseUid?'Notifications, unread notifications':'Notifications'} onPress={()=>navigation.navigate('Notifications')} style={{width:48,height:48,alignItems:'center',justifyContent:'center'}}><PatientIcon name="bell" color={p.text}/>{unread!==null&&unread===firebaseUid&&<View testID="unread-notification-dot" style={{position:'absolute',right:10,top:8,width:8,height:8,borderRadius:4,backgroundColor:p.danger}}/>}</Pressable>
  </View>
  <View style={{flexDirection:'row',alignItems:'center',backgroundColor:p.surface,borderWidth:1,borderColor:p.border,borderRadius:22,paddingHorizontal:12}}>
   <Pressable accessibilityRole="button" accessibilityLabel="Search doctors" onPress={()=>navigation.navigate('Doctors',{search})} style={{width:44,height:54,justifyContent:'center'}}><PatientIcon name="search" size={26} color={p.muted}/></Pressable>
   <TextInput accessibilityLabel="Search doctors or specialties" placeholder="Search doctors, specialties..." placeholderTextColor={p.muted} value={search} onChangeText={setSearch} returnKeyType="search" onSubmitEditing={()=>navigation.navigate('Doctors',{search})} style={{flex:1,minWidth:0,minHeight:54,fontSize:16,color:p.text}}/>
  </View>
  <View style={{flexDirection:'row',gap:6}}>{specialties(p).map(s=><Pressable key={s.label} accessibilityRole="button" accessibilityLabel={s.label} onPress={()=>navigation.navigate('Doctors',{search:s.label})} style={({pressed})=>({flex:1,alignItems:'center',gap:8,opacity:pressed?.7:1})}><View style={{width:tileSize,height:tileSize,borderRadius:22,backgroundColor:s.background,alignItems:'center',justifyContent:'center'}}><PatientIcon name={s.icon} size={iconSize} color={s.color}/></View><Copy style={{fontSize:13,lineHeight:18,textAlign:'center'}}>{s.label==='General Practice'?'General\nPractice':s.label==='Mental Health'?'Mental\nHealth':s.label}</Copy></Pressable>)}</View>
  <Pressable accessibilityRole="button" accessibilityLabel="Consult a doctor" onPress={()=>navigation.navigate('Doctors')} style={({pressed})=>({backgroundColor:p.mint,borderRadius:24,minHeight:148,padding:20,paddingRight:8,paddingBottom:0,flexDirection:'row',alignItems:'center',gap:12,overflow:'hidden',opacity:pressed?.8:1})}>
   <View pointerEvents="none" style={{position:'absolute',right:-30,bottom:-65,width:180,height:180,borderRadius:100,backgroundColor:p.accent,opacity:.06}}/>
   <View style={{flex:1,minWidth:0,gap:5,paddingBottom:20}}><Copy variant="heading" style={{fontSize:24,lineHeight:31}}>Consult a doctor</Copy><Copy tone="muted" style={{fontSize:16,lineHeight:22}}>Anytime, anywhere</Copy></View>
   <View testID="consult-doctor-artwork" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{width:Math.min(150,width*.34),height:164,alignSelf:'flex-end',overflow:'hidden'}}>
    <Image testID="consult-doctor-image" source={require('../../../assets/consult-doctor-transparent.png')} accessible={false} resizeMode="contain" style={{position:'absolute',width:doctorWidth,height:doctorWidth*1199/1312,left:'-20%',top:0}}/>
    <View style={{position:'absolute',right:0,top:12,width:36,height:36,borderRadius:18,backgroundColor:p.primary,alignItems:'center',justifyContent:'center'}}><PatientIcon name="arrow" color={p.onPrimary} size={20}/></View>
   </View>
  </Pressable>
  <View style={{gap:12}}><View style={{flexDirection:'row',alignItems:'center',gap:8}}><Copy variant="heading" style={{flex:1,fontSize:18}}>Upcoming Appointment</Copy><Pressable accessibilityRole="button" accessibilityLabel="View all appointments" onPress={()=>navigation.navigate('Appointments')} style={{minHeight:44,justifyContent:'center',paddingHorizontal:4}}><Copy style={{color:p.accent,fontSize:14}}>View all</Copy></Pressable></View>
   {data.loading?<Loading label="Loading appointments..."/>:data.error?<Card><Notice message="Unable to load appointments."/><Action title="Retry" onPress={data.retry}/></Card>:next&&firebaseUid?<HomeAppointment key={`${firebaseUid}:${next.appointmentId}`} uid={firebaseUid} appointment={next} now={now} navigation={navigation}/>:<Pressable accessibilityRole="button" accessibilityLabel="Find a doctor" accessibilityHint="Book a consultation to get started" onPress={()=>navigation.navigate('Doctors')} style={({pressed})=>({borderRadius:24,backgroundColor:p.surface,padding:16,minHeight:100,flexDirection:'row',alignItems:'center',gap:12,opacity:pressed?.75:1})}><View style={{width:48,height:56,borderRadius:16,backgroundColor:p.background,alignItems:'center',justifyContent:'center'}}><PatientIcon name="calendar" color={p.muted} size={30}/></View><View style={{flex:1,gap:4}}><Copy variant="label">No upcoming appointments</Copy><Copy tone="muted" style={{fontSize:13,lineHeight:18}}>Book a consultation to get started.</Copy></View><PatientIcon name="arrow" size={20} color={p.muted}/></Pressable>}
  </View>
  <View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:8}}>{([{label:'My prescriptions',route:'Prescriptions'},{label:'Health assistant',route:'Chatbot'}] as const).map(item=><Pressable key={item.route} accessibilityRole="button" accessibilityLabel={item.label} onPress={()=>navigation.navigate(item.route)} style={{minHeight:48,justifyContent:'center',paddingHorizontal:8}}><Copy style={{fontSize:14,color:p.accent}}>{item.label}</Copy></Pressable>)}</View>
 </Screen>;
}
function HomeAppointment({uid,appointment:a,now,navigation}:{uid:string;appointment:AppointmentRow;now:number;navigation:Navigation}) {
 const p=usePalette(),[doctor,setDoctor]=useState<PublicDoctor|null>(null),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setDoctor(null);setFailed(false);void getPatientDoctor(a.doctorId).then(d=>{if(active)setDoctor(d);}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[a.doctorId,retry]);
 const unavailable=consultationUnavailable(a,uid,'patient',now);
 return <Card style={{padding:16,gap:12}}><View style={{flexDirection:'row',gap:12,alignItems:'center'}}><PatientAvatar uid={a.doctorId} name={doctor?.professionalName||'Doctor'}/><View style={{flex:1}}><Copy variant="label">{doctor?.professionalName||(failed?'Doctor details unavailable':'Loading doctor details...')}</Copy>{doctor&&<Copy tone="muted" style={{fontSize:13}}>{doctor.specialty}</Copy>}</View></View>
  {failed&&<Action secondary title="Retry doctor details" onPress={()=>setRetry(v=>v+1)}/>}
  <View style={{flexDirection:'row',gap:8,alignItems:'center'}}><PatientIcon name="calendar" size={20} color={p.muted}/><View style={{flex:1}}><Copy style={{fontSize:14}}>{new Date(a.startAt).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</Copy><Copy tone="muted" style={{fontSize:14}}>{new Date(a.startAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</Copy></View><Action title="Join" disabled={!!unavailable} onPress={()=>{if(!consultationUnavailable(a,uid,'patient',Date.now()))navigation.navigate('Consultation',{appointmentId:a.appointmentId});}}/></View>
  {unavailable&&<Copy variant="caption" tone="muted">{unavailable}</Copy>}
 </Card>;
}
