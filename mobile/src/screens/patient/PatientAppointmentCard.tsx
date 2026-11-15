import React, {useEffect, useState} from 'react';
import {Pressable, View} from 'react-native';
import {Card, Copy, usePalette} from '../../ui/design';
import {PatientIcon} from '../../ui/PatientIcon';
import {ProfileAvatar} from '../../components/ProfileAvatar';
import {getPatientDoctor, type PublicDoctor} from '../../services/patientDoctors';
import type {AppointmentRow} from '../../services/appointmentReads';

const statuses = (p:ReturnType<typeof usePalette>)=>({
  scheduled: {label:'Scheduled', background:p.successSurface, color:p.success},
  completed: {label:'Completed', background:p.infoSurface, color:p.info},
  cancelled: {label:'Cancelled', background:p.errorSurface, color:p.error},
  no_show: {label:'No-show', background:p.warningSurface, color:p.warning},
});

export default function PatientAppointmentCard({appointment:a, children}:{appointment:AppointmentRow;children:React.ReactNode}) {
  const colors=usePalette(), [doctor,setDoctor]=useState<PublicDoctor|null>(null), [expanded,setExpanded]=useState(false);
  useEffect(()=>{let active=true;setDoctor(null);void getPatientDoctor(a.doctorId).then(d=>{if(active)setDoctor(d);}).catch(()=>{/* Historical public profiles may no longer be available. */});return()=>{active=false;};},[a.doctorId]);
  const status=statuses(colors)[a.status], name=doctor?.professionalName??'Doctor';
  const date=new Date(a.startAt).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  const time=(value:number)=>new Date(value).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  return <Card style={{padding:16,gap:16}}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Appointment with '+name+', '+date} accessibilityHint="Show appointment details and available actions" accessibilityState={{expanded}} onPress={()=>setExpanded(v=>!v)} style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:108}}>
      <ProfileAvatar uid={a.doctorId} name={name} size={64}/>
      <View style={{flex:1,gap:6}}>
        <View style={{alignSelf:'flex-end',backgroundColor:status.background,borderRadius:20,paddingHorizontal:12,paddingVertical:5}}><Copy variant="caption" style={{color:status.color,fontWeight:'700'}}>{status.label}</Copy></View>
        <Copy style={{fontSize:18,fontWeight:'700'}}>{name}</Copy>
        <Copy tone="muted">{doctor?.specialty??'Doctor details unavailable'}</Copy>
        <View style={{flexDirection:'row',gap:8,alignItems:'center'}}><PatientIcon name="calendar" size={18} color={colors.accent}/><Copy variant="caption" tone="muted" style={{flex:1}}>{date}</Copy></View>
        <View style={{flexDirection:'row',gap:8,alignItems:'center'}}><PatientIcon name="clock" size={18} color={colors.accent}/><Copy variant="caption" tone="muted" style={{flex:1}}>{time(a.startAt)} – {time(a.endAt)}</Copy></View>
      </View>
      <Copy tone="muted" style={{fontSize:26}}>{expanded?'⌄':'›'}</Copy>
    </Pressable>
    {expanded&&children}
  </Card>;
}
