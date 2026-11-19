import {localeTag} from "../../i18n/locale";
import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import {FeeDisplay} from '../../components/Payments';
import React, { useEffect, useRef, useState } from 'react';
import {View,ScrollView,Pressable,TextInput} from 'react-native';
import {usePalette} from '../../ui/design';
import {PatientIcon} from '../../ui/PatientIcon';
import {ProfileAvatar} from '../../components/ProfileAvatar';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PatientStackParams } from '../../navigation/types';
import { useAuth } from '../../hooks/useAuth';
import { useSchedulingSession } from '../../hooks/useSchedulingSession';
import { getPatientDoctor, type PublicDoctor } from '../../services/patientDoctors';
import { localDate, schedulingError } from '../../services/schedulingService';
import type { AvailableAppointmentTime } from '@shared/types/scheduling';
import { Screen, Copy, Action, Card, Field, Loading, Notice, Status } from '../../ui/design';
import PatientAppointmentCard from './PatientAppointmentCard';
import SchedulingAppointments from '../shared/SchedulingAppointments';
import {PatientAvatar} from './PatientMenu';
import {PatientMenu} from './PatientMenu';

export function PatientAppointments({ navigation }: NativeStackScreenProps<PatientStackParams, 'Appointments'>) {
  useLocale();
  const { firebaseUid } = useAuth(), focused = useIsFocused();
  const [mode, setMode] = useState<'upcoming' | 'history'>('upcoming'), [boundary] = useState(() => Date.now() - 45 * 60000);
  const colors=usePalette();
  return <Screen variant="dashboard" footer={<PatientMenu navigation={navigation} active="Appointments"/>}>
    {firebaseUid && focused && <SchedulingAppointments key={firebaseUid+':'+mode} uid={firebaseUid} role="patient" patientPresentation mode={mode} boundary={boundary}
      findDoctor={()=>navigation.navigate('Doctors')} renderCard={(a,content)=><PatientAppointmentCard appointment={a}>{content}</PatientAppointmentCard>}
      header={(refresh,disabled)=><>
        <View style={{flexDirection:'row',alignItems:'center',gap:12}}><View style={{flex:1}}/><Pressable accessibilityRole="button" accessibilityLabel={tr("Refresh appointments")} accessibilityState={{disabled}} disabled={disabled} onPress={refresh} style={{width:44,height:44,borderRadius:22,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',opacity:disabled?0.5:1}}><PatientIcon name="refresh" color={colors.text}/></Pressable></View>
        <Copy tone="muted">{tr("View and manage your appointments. Times use your device time zone.")}</Copy>
        <View style={{flexDirection:'row',gap:6,padding:4,borderRadius:22,borderWidth:1,borderColor:colors.border}}>
          {(['upcoming','history'] as const).map(value=><Pressable key={value} accessibilityRole="tab" accessibilityLabel={value==='upcoming'?tr("Upcoming & Active"):tr("Appointment History")} accessibilityState={{selected:mode===value}} onPress={()=>setMode(value)} style={{flex:1,minHeight:64,padding:8,borderRadius:18,backgroundColor:mode===value?colors.primary:colors.surface,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}}><PatientIcon name="calendar" color={mode===value?colors.onPrimary:colors.muted} size={20}/><Copy variant="label" style={{flex:1,textAlign:'center',color:mode===value?colors.onPrimary:colors.muted}}>{value==='upcoming'?tr("Upcoming & Active"):tr("Appointment History")}</Copy></Pressable>)}
        </View>
      </>}
      history={appointmentId => navigation.navigate('ConsultationHistory', { appointmentId })}
      open={appointmentId => navigation.navigate('Consultation', { appointmentId })}
      rate={consultationId => navigation.navigate('RateDoctor', { consultationId })}
    />}
  </Screen>;
}
export function DoctorsScreen(props: NativeStackScreenProps<PatientStackParams, 'Doctors'>) {
  useLocale();
  const { firebaseUid } = useAuth(), focused = useIsFocused();
  return firebaseUid && focused ? <DoctorDirectory key={firebaseUid} uid={firebaseUid} {...props}/> : <Screen><Loading/></Screen>;
}
function DoctorDirectory({ uid, navigation, route }: NativeStackScreenProps<PatientStackParams, 'Doctors'> & { uid: string }) {
  useLocale();
  const session = useSchedulingSession(uid), generation = useRef(0), busy = useRef(false);
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]), [cursor, setCursor] = useState<string | null>(null), [search, setSearch] = useState(route?.params?.search??'');
  const [specialty,setSpecialty]=useState(route?.params?.specialty??'');
  useEffect(()=>{setSearch(route?.params?.search??'');setSpecialty(route?.params?.specialty??'');},[route?.params?.search,route?.params?.specialty]);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0);
  async function load(more: boolean, token = generation.current) {
    if (!session || busy.current) return; busy.current = true; setLoading(true); setError(null);
    try {
      const page = await session.listDoctors(more ? cursor ?? undefined : undefined); if (token !== generation.current) return;
      setDoctors(previous => [...new Map([...(more ? previous : []), ...page.items].map(d => [d.uid, d])).values()]); setCursor(page.nextCursor);
    } catch (e) { if (token === generation.current) setError(schedulingError(e)); }
    finally { if (token === generation.current) { busy.current = false; setLoading(false); } }
  }
  useEffect(() => { const token = ++generation.current; busy.current = false; setDoctors([]); setCursor(null); void load(false, token); return () => { ++generation.current; }; }, [session, retry]);
  const colors=usePalette(), [filtersOpen,setFiltersOpen]=useState(false);
  const specialties=[...new Set([...doctors.map(d=>d.specialty),...(specialty?[specialty]:[])])].sort();
  const matches = doctors.filter(d => (!specialty||d.specialty===specialty)&& (d.professionalName+' '+d.specialty).toLowerCase().includes(search.trim().toLowerCase()));
  const chip=(s:string)=><Pressable key={s||'all'} accessibilityRole="button" accessibilityLabel={s||tr('All')} accessibilityState={{selected:specialty===s}} onPress={()=>setSpecialty(s)} style={{minHeight:48,paddingHorizontal:18,paddingVertical:12,borderWidth:1,borderRadius:20,borderColor:colors.border,backgroundColor:specialty===s?colors.primary:colors.surface}}><Copy style={{color:specialty===s?colors.onPrimary:colors.text,fontWeight:'600'}}>{s||tr('All')}</Copy></Pressable>;
  return <Screen variant="dashboard" footer={<PatientMenu navigation={navigation} active="Doctors"/>}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('Home')} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><View style={{transform:[{rotate:'180deg'}]}}><PatientIcon name="arrow" color={colors.text}/></View></Pressable>
      <Copy style={{flex:1,fontSize:26,fontWeight:'700'}}>{tr("Find a Doctor")}</Copy>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Filter specialties")} accessibilityState={{expanded:filtersOpen}} onPress={()=>setFiltersOpen(v=>!v)} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><PatientIcon name="filter" color={specialty?colors.accent:colors.text}/></Pressable>
    </View>
    <View style={{flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderRadius:24,paddingHorizontal:16,backgroundColor:colors.surface,borderColor:colors.border,elevation:1}}>
      <PatientIcon name="search" color={colors.muted} size={24}/>
      <TextInput accessibilityLabel={tr("Search by name or specialty")} placeholder={tr("Search by name or specialty...")} placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={{flex:1,minHeight:54,color:colors.text,fontSize:16,paddingVertical:10}}/>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:8}}>{['',...specialties].map(chip)}</ScrollView>
    {filtersOpen&&<Card style={{padding:16,gap:12}}><Copy variant="label">{tr("Specialties in loaded results")}</Copy><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{['',...specialties].map(chip)}</View>{!specialties.length&&<Copy tone="muted">{tr("Specialty filters appear when doctors are loaded.")}</Copy>}<Action secondary title={tr("Clear filters")} onPress={()=>{setSpecialty('');setSearch('');}}/><Action title={tr("Done")} onPress={()=>setFiltersOpen(false)}/></Card>}
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Copy variant="caption" tone="muted" style={{flex:1}}>{tr("Search and filters apply to loaded doctors.")}</Copy><Pressable accessibilityRole="button" accessibilityLabel={tr("Refresh doctors")} disabled={loading} accessibilityState={{disabled:loading}} onPress={()=>setRetry(v=>v+1)} style={{minHeight:44,justifyContent:'center',paddingHorizontal:8,opacity:loading?0.5:1}}><Copy variant="label" style={{color:colors.accent}}>{tr("Refresh")}</Copy></Pressable></View>
    {loading && <Loading label={tr("Loading doctors...")}/>}<Notice message={error}/>
    {error&&<Action secondary title={tr("Retry loading doctors")} disabled={loading} onPress={()=>void load(doctors.length>0||!!cursor)}/>}
    {!loading&&!error&&!matches.length&&<Card style={{alignItems:'center',paddingVertical:32}}><PatientIcon name="stethoscope" color={colors.accent} size={40}/><Copy variant="heading" style={{textAlign:'center'}}>{!doctors.length&&!cursor&&!search.trim()&&!specialty?tr("No approved doctors available"):tr("No matching doctors")}</Copy><Copy tone="muted" style={{textAlign:'center'}}>{cursor?tr("Load more doctors to continue browsing."):search.trim()||specialty?tr("Try another name or specialty, or clear your filters."):tr("Please check back soon or refresh the directory.")}</Copy>{(!!search.trim()||!!specialty)&&<Action secondary title={tr("Clear filters")} onPress={()=>{setSearch('');setSpecialty('');}}/>}</Card>}
    {matches.map(d=><Pressable key={d.uid} testID="directory-doctor-card" accessibilityRole="button" accessibilityLabel={tr("View doctor: ")+d.professionalName} onPress={()=>navigation.navigate('DoctorProfile',{doctorId:d.uid})} style={({pressed})=>({opacity:pressed?0.75:1})}><Card style={{padding:16,flexDirection:'row',alignItems:'center',gap:14}}><ProfileAvatar uid={d.uid} name={d.professionalName} size={80}/><View style={{flex:1,gap:5}}><Copy style={{fontSize:19,fontWeight:'700'}}>{d.professionalName}</Copy><Copy tone="muted">{d.specialty}</Copy><Copy variant="caption" tone="muted">{tr("Ratings unavailable")}</Copy><Copy variant="caption" tone="muted">{tr("View appointment availability")}</Copy></View></Card></Pressable>)}
    {cursor && <Action title={tr("Load more doctors")} disabled={loading} onPress={() => void load(true)}/>}
    </Screen>;
}
export function DoctorProfileScreen(props: NativeStackScreenProps<PatientStackParams, 'DoctorProfile'>) {
  useLocale();
  const { firebaseUid } = useAuth(), focused = useIsFocused();
  return firebaseUid && focused ? <DoctorTimes key={`${firebaseUid}:${props.route.params.doctorId}`} uid={firebaseUid} {...props}/> : <Screen><Loading/></Screen>;
}
function DoctorTimes({ uid, route, navigation }: NativeStackScreenProps<PatientStackParams, 'DoctorProfile'> & { uid: string }) {
  useLocale();
  const [durationMinutes,setDuration]=useState<15|30|60>(30);
  const session = useSchedulingSession(uid), [day, setDay] = useState(() => localDate());
  const [doctor, setDoctor] = useState<PublicDoctor | null>(null), [times, setTimes] = useState<AvailableAppointmentTime[]>([]);
  const [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setTimes([]); setDoctor(null); setError(null); setLoading(true); if (!session) return;
    void getPatientDoctor(route.params.doctorId).then(async d => { const slots = await session.times(d.uid, day,durationMinutes); if (active) { setDoctor(d); setTimes(slots); } })
      .catch(e => { if (active) setError(schedulingError(e)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; };
  }, [route.params.doctorId, day, session, retry,durationMinutes]);
  const nearbyDays=Array.from({length:7},(_,offset)=>{const date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()+offset);return {key:date.getTime(),value:localDate(date.getTime()),label:date.toLocaleDateString(localeTag(),{weekday:'short',day:'numeric',month:'short'})};});
  return <Screen variant="dashboard" footer={<PatientMenu navigation={navigation} active="Doctors"/>}><Copy title>{tr("Doctor profile")}</Copy><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{nearbyDays.map(d=><Action key={d.key} secondary selected={day===d.value} title={d.label} onPress={()=>setDay(d.value)}/>)}</ScrollView><Field label={tr("Local appointment date (YYYY-MM-DD)")} value={day} onChangeText={setDay} maxLength={10}/>
    <Copy>{tr("Time zone:")}{' '}{Intl.DateTimeFormat().resolvedOptions().timeZone}{tr(". Select a date within the next 90 days.")}</Copy>
    {loading && <Loading/>}<Notice message={error}/><Action secondary title={tr("Refresh available times")} disabled={loading} onPress={() => setRetry(v => v + 1)}/>
    {doctor && <Card><PatientAvatar uid={doctor.uid} name={doctor.professionalName}/><Copy title>{doctor.professionalName}</Copy><Copy tone="muted">{doctor.specialty}</Copy><FeeDisplay uid={uid} doctorId={doctor.uid}/><Status label={tr("Approved public profile")} tone="success"/><Copy variant="heading">{tr("About")}</Copy><Copy>{tr("Specialty:")}{' '}{doctor.specialty}{tr(". Choose an available appointment below to book a consultation.")}</Copy></Card>}
    {!loading && !error && <Card><Copy variant="heading">{tr("Book an appointment")}</Copy><View style={{flexDirection:'row',gap:8,flexWrap:'wrap'}}>{([15,30,60] as const).map(n=><View key={n} style={{flex:1,minWidth:84}}><Action secondary selected={durationMinutes===n} title={`${n} minutes`} onPress={()=>setDuration(n)}/></View>)}</View><Copy>{tr("Minimum five-minute lead. Availability is rechecked on confirmation.")}</Copy>
      {times.length ? times.map(t => <Action key={t.startAt} title={tr("Select {0} to {1}", {"0": new Date(t.startAt).toLocaleTimeString(localeTag()), "1": new Date(t.endAt).toLocaleTimeString(localeTag())})} onPress={() => navigation.navigate('BookAppointment', { doctorId: route.params.doctorId, startAt: t.startAt,durationMinutes })}/>) : <Copy>{tr("No available times on this local date.")}</Copy>}</Card>}
    </Screen>;
}
