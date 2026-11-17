import {localeTag} from "../../i18n/locale";
import {systemMessage} from '../../i18n/translate';
import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import {AccountConnections} from '../../components/AccountConnections';
import {DoctorPayments} from '../../components/Payments';
import {AccountDeletion} from '../../components/AccountDeletion';
import DoctorConsultations from './DoctorConsultations';
import DoctorSchedule from './DoctorSchedule';
import DoctorHomeDashboard from './DoctorHomeDashboard';
import {PatientIcon,type PatientIconName} from '../../ui/PatientIcon';
import React,{useEffect,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {DoctorStackParams} from '../../navigation/types';
import {useAuth} from '../../hooks/useAuth';
import {Action,Card,Copy,Loading,Notice,Screen,Status,usePalette} from '../../ui/design';
import {observeAppointments,consultationUnavailable,type AppointmentRow} from '../../services/appointmentReads';

import {readOwnDoctorProfile} from '../../services/doctorProfileRead';
import {AvatarEditor,ProfileAvatar} from '../../components/ProfileAvatar';
import {DoctorRatingSummaryPanel} from '../shared/RatingPanels';

export const doctorTabs=['Home','Schedule','Consultations','Profile'] as const;
type Tab=typeof doctorTabs[number];
const tabIcons:Record<Tab,PatientIconName>={Home:'home',Schedule:'calendar',Consultations:'stethoscope',Profile:'profile'};
export function localDay(time:number){const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function validDay(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(`${value}T12:00:00`);return Number.isFinite(d.getTime())&&localDay(d.getTime())===value;}

export default function DoctorWorkspace({navigation}:NativeStackScreenProps<DoctorStackParams,'DoctorWorkspace'>){
  useLocale();
 const identity=useAuth(),focused=useIsFocused(),colors=usePalette();
 const [tab,setTab]=useState<Tab>('Home');
 if(!focused)return null;
 if(identity.status!=='ready'||identity.user?.role!=='doctor'||identity.user.status!=='active'||identity.user.verificationStatus!=='approved'||!identity.firebaseUid)
  return <Screen><Copy>{tr("Clinical access requires an active, approved doctor account.")}</Copy></Screen>;
 return <View style={{flex:1,backgroundColor:colors.background}}>
  <DoctorContent history={appointmentId=>navigation.navigate('ConsultationHistory',{appointmentId})} key={`${identity.firebaseUid}:${tab}`} uid={identity.firebaseUid} notifications={()=>navigation.navigate('Notifications')} prescriptions={()=>navigation.navigate('IssuePrescription')} details={appointmentId=>navigation.navigate('ConsultationDetails',{appointmentId})} tab={tab} select={setTab} manage={()=>navigation.navigate('SetAvailability')} open={appointmentId=>navigation.navigate('ConsultationRoom',{appointmentId})}/>
  <SafeAreaView edges={['bottom']} style={{backgroundColor:colors.tabBarBackground,borderTopWidth:1,borderColor:colors.border}}>
   <View style={{flexDirection:'row'}}>{doctorTabs.map(name=><Pressable key={name} accessibilityRole="tab" accessibilityLabel={systemMessage(name)} accessibilityState={{selected:tab===name}} onPress={()=>setTab(name)} style={({pressed})=>({flex:1,minHeight:64,paddingVertical:12,paddingHorizontal:4,alignItems:'center',gap:5,justifyContent:'center',opacity:pressed?0.65:1,borderRadius:12,backgroundColor:tab===name?colors.mint:colors.tabBarBackground})}><PatientIcon name={tabIcons[name]} color={tab===name?colors.tabActive:colors.tabInactive} size={24}/><Text style={{color:tab===name?colors.tabActive:colors.tabInactive,fontSize:12,fontWeight:tab===name?'700':'400',textAlign:'center'}}>{systemMessage(name)}</Text></Pressable>)}</View>
  </SafeAreaView>
 </View>;
}

export function DoctorContent({uid,tab,select,open,manage,history,details,notifications=()=>{},prescriptions=()=>{}}:{uid:string;tab:Tab;select(tab:Tab):void;open(id:string):void;manage():void;history?(id:string):void;details?(id:string):void;notifications?():void;prescriptions?():void}){
  useLocale();
 const [rows,setRows]=useState<AppointmentRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{if(tab!=='Home')return;let active=true;setLoading(true);setError(false);setRows([]);
  const stop=observeAppointments(uid,'doctor',value=>{if(active){setRows(value);setLoading(false);}},()=>{if(active){setRows([]);setLoading(false);setError(true);}},true);
  const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{active=false;stop();clearInterval(timer);};
 },[uid,tab,retry]);
 if(tab==='Schedule')return <DoctorSchedule uid={uid} open={open} manage={manage} details={details}/>;
 if(tab==='Profile')return <DoctorAccount uid={uid} manage={manage} notifications={notifications} prescriptions={prescriptions}/>;
 if(tab==='Home')return <DoctorHomeDashboard uid={uid} rows={rows} loading={loading} error={error} now={now} retry={()=>setRetry(v=>v+1)} viewAll={()=>select('Consultations')} open={open} notifications={notifications} prescriptions={prescriptions}/>;
 return <DoctorConsultations uid={uid} open={open} history={history} details={details}/>;
}

export function DoctorAppointmentCard({appointment:a,uid,now,open}:{appointment:AppointmentRow;uid:string;now:number;open(id:string):void}){
  useLocale();
 const reason=consultationUnavailable(a,uid,'doctor',now);
 return <Card><Copy title>{new Date(a.startAt).toLocaleDateString(localeTag())}</Copy><Copy>{new Date(a.startAt).toLocaleTimeString(localeTag())} – {new Date(a.endAt).toLocaleTimeString(localeTag())}</Copy><Status label={a.status.replace('_',' ')} tone={a.status==='scheduled'?'success':'neutral'}/>{reason&&<Copy>{reason}</Copy>}<Action title={tr("Open consultation")} disabled={!!reason} onPress={()=>{if(!consultationUnavailable(a,uid,'doctor',Date.now()))open(a.appointmentId);}}/></Card>;
}
function DoctorAccount({uid,manage,notifications,prescriptions}:{uid:string;manage():void;notifications():void;prescriptions():void}){
  useLocale();
 const p=usePalette(),lock=useRef(false),alive=useRef(true);
 const [panel,setPanel]=useState<string|null>(null),[photo,setPhoto]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const {user,logout}=useAuth();const [profile,setProfile]=useState<Awaited<ReturnType<typeof readOwnDoctorProfile>>>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setLoading(true);setProfile(null);setError(null);void readOwnDoctorProfile(uid).then(p=>{if(active)setProfile(p);}).catch(()=>{if(active)setError(tr("Unable to load your professional profile."));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[uid,retry]);
 const name=profile?.professionalName||user?.fullName||'Doctor';
 const menus:[string,string,PatientIconName][]=[[tr("Edit profile"),tr("Update your professional information."),'document'],[tr("Manage availability"),tr("Set your consultation times."),'calendar'],[tr("Consultation settings"),tr("Video, audio and chat preferences."),'message'],['Help & support',tr("Get help or contact support."),'bell']];
 return <Screen variant="dashboard"><Copy title>{tr("Profile")}</Copy>
 <View style={{alignItems:'center',gap:10,paddingVertical:12}}>
 <Pressable accessibilityRole="button" accessibilityLabel={tr("Change profile picture")} accessibilityState={{expanded:photo}} onPress={()=>setPhoto(v=>!v)} style={{padding:6}}><ProfileAvatar uid={uid} name={name} size={104}/>{user?.role==='doctor'&&user.verificationStatus==='approved'&&<View accessibilityLabel={tr("Verified Doctor")} style={{position:'absolute',right:0,bottom:4,borderRadius:16,width:30,height:30,backgroundColor:p.primary,borderWidth:3,borderColor:p.surface,alignItems:'center',justifyContent:'center'}}><Text style={{color:p.onPrimary,fontWeight:'700'}}>✓</Text></View>}</Pressable>
 <Copy variant="heading" style={{textAlign:'center'}}>{name}</Copy>{profile?.specialty&&<Copy tone="muted" style={{textAlign:'center'}}>{profile.specialty}</Copy>}
 </View>{loading&&<Loading/>}<Notice message={error}/>{error&&<Action secondary title={tr("Retry profile")} onPress={()=>setRetry(v=>v+1)}/>}
 {photo&&<AvatarEditor uid={uid}/>}
 <View>{menus.map(([title,subtitle,icon])=><React.Fragment key={title}><Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={title==='Manage availability'?undefined:{expanded:panel===title}} onPress={()=>title==='Manage availability'?manage():setPanel(v=>v===title?null:title)} style={{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:16,minHeight:72,borderBottomWidth:1,borderColor:p.border}}><View style={{width:36,height:36,borderRadius:12,backgroundColor:p.mint,alignItems:'center',justifyContent:'center'}}><PatientIcon name={icon} size={22} color={p.accent}/></View><View style={{flex:1,gap:4}}><Copy variant="label">{title}</Copy><Copy variant="caption" tone="muted">{subtitle}</Copy></View><Copy tone="muted" style={{fontSize:24}}>›</Copy></Pressable>
 {panel===title&&<View style={{gap:12,paddingVertical:16}}>{title==='Edit profile'?<><Copy>{tr("Approved professional information cannot currently be edited. You can still change your profile picture.")}</Copy>{profile&&Object.entries(profile).map(([key,value])=><View key={key}><Copy variant="caption" tone="muted">{({professionalName:tr("Professional name"),specialty:tr("Specialty"),phoneNumber:tr("Phone"),registrationNumber:tr("Registration number"),issuingAuthority:tr("Issuing authority")} as Record<string,string>)[key]}</Copy><Copy>{value}</Copy></View>)}<Action secondary title={tr("Change profile picture")} onPress={()=>setPhoto(true)}/><DoctorRatingSummaryPanel uid={uid}/><Action secondary title={tr("Consultation prescriptions")} onPress={prescriptions}/><Action secondary title={tr("Notifications")} onPress={notifications}/></>:<Copy>{title==='Consultation settings'?tr("Video, audio and chat preferences are not currently available. Use the controls within your consultation."):tr("In-app support and contact details are not currently available.")}</Copy>}</View>}
 </React.Fragment>)}</View>
 <AccountConnections key={`connections:${uid}`} uid={uid}/><DoctorPayments key={`payments:${uid}`} uid={uid}/><AccountDeletion key={`deletion:${uid}`} uid={uid}/><Pressable accessibilityRole="button" accessibilityLabel={tr("Sign out")} accessibilityState={{disabled:busy,busy}} disabled={busy} onPress={()=>{if(lock.current)return;lock.current=true;setBusy(true);setError(null);void logout().catch(()=>{if(alive.current)setError(tr("Unable to sign out. Please retry."));}).finally(()=>{lock.current=false;if(alive.current)setBusy(false);});}} style={{minHeight:50,borderWidth:1,borderColor:p.error,borderRadius:14,alignItems:'center',justifyContent:'center',marginTop:12,opacity:busy?0.6:1}}><Copy variant="label" style={{color:p.error}}>{busy?tr("Signing out…"):tr("Sign out")}</Copy></Pressable>
 </Screen>;
}
