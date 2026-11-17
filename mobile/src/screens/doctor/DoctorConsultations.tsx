import {localeTag} from "../../i18n/locale";
import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import React,{useState} from 'react';
import {Pressable,View} from 'react-native';
import {Card,Copy,Screen,Status,usePalette} from '../../ui/design';
import SchedulingAppointments from '../shared/SchedulingAppointments';
import {AppointmentPatient} from '../../components/AppointmentPatient';
import {useAppointmentPatients} from '../../hooks/useAppointmentPatients';
import {consultationUnavailable,type AppointmentRow} from '../../services/appointmentReads';

export default function DoctorConsultations({uid,open,history:viewHistory,details}:{uid:string;open(id:string):void;history?(id:string):void;details?(id:string):void}){
  useLocale();
 const p=usePalette(),[history,setHistory]=useState(false),[boundary]=useState(()=>Date.now()-45*60000);
 return <Screen variant="dashboard">
  <SchedulingAppointments key={history?'history':'upcoming'} uid={uid} role="doctor" mode={history?'history':'upcoming'} boundary={boundary} open={open} history={viewHistory}
   header={(refresh,disabled)=><>
    <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Copy title style={{flex:1}}>{tr("Consultations")}</Copy><Pressable accessibilityRole="button" accessibilityLabel={tr("Refresh consultations")} accessibilityState={{disabled}} disabled={disabled} onPress={refresh} style={{width:48,height:48,alignItems:'center',justifyContent:'center',borderRadius:24,backgroundColor:p.surface}}><Copy style={{fontSize:26,color:p.accent}}>↻</Copy></Pressable></View>
    <View style={{flexDirection:'row',borderRadius:14,padding:4,backgroundColor:p.surface,borderWidth:1,borderColor:p.border}}>{['Upcoming & Active','History'].map((name,index)=><Pressable key={name} accessibilityRole="tab" accessibilityLabel={name} accessibilityState={{selected:history===(index===1)}} onPress={()=>setHistory(index===1)} style={{flex:1,minHeight:48,padding:8,alignItems:'center',justifyContent:'center',borderRadius:11,backgroundColor:history===(index===1)?p.primary:p.surface}}><Copy variant="label" style={{color:history===(index===1)?p.onPrimary:p.muted,textAlign:'center'}}>{name}</Copy></Pressable>)}</View>
   </>}
   renderCard={(appointment,actions,now)=><ConsultationRow uid={uid} appointment={appointment} now={now} actions={actions} details={details}/>}/>
 </Screen>;
}

export function ConsultationRow({uid,appointment:a,now,actions,details}:{uid:string;appointment:AppointmentRow;now:number;actions:React.ReactNode;details?(id:string):void}){
  useLocale();
 const p=usePalette(),[expanded,setExpanded]=useState(false),patients=useAppointmentPatients(uid,[a]);
 // Scheduled is the stored status; access timing is shown only by the existing gated actions.
 const label=a.status==='no_show'?'No-show':a.status.charAt(0).toUpperCase()+a.status.slice(1);
 const eligible=!consultationUnavailable(a,uid,'doctor',now);
 const time=(t:number)=>new Date(t).toLocaleTimeString(localeTag(),{hour:'numeric',minute:'2-digit'});
 return <Card style={{padding:14,gap:12}}>
  <Pressable accessibilityRole="button" accessibilityLabel={tr("Appointment {0}", {"0": new Date(a.startAt).toLocaleString(localeTag())})} accessibilityHint={details?tr("Open consultation details"):tr("Show or hide consultation actions")} accessibilityState={{expanded}} onPress={()=>details?details(a.appointmentId):setExpanded(v=>!v)} style={{minHeight:64,flexDirection:'row',alignItems:'center',gap:10}}>
   <AppointmentPatient display={patients[a.appointmentId]}><Copy variant="caption" tone="muted">{new Date(a.startAt).toLocaleDateString(localeTag(),{weekday:'short',month:'short',day:'numeric',year:'numeric'})} · {time(a.startAt)} – {time(a.endAt)}</Copy><View style={{alignSelf:'flex-start'}}><Status label={label} tone={eligible?'success':'neutral'}/></View></AppointmentPatient>
   <Copy style={{fontSize:25,color:p.muted}}>{expanded?'⌄':'›'}</Copy>
  </Pressable>
  {details&&<Pressable accessibilityRole="button" accessibilityLabel={tr("Appointment actions")} accessibilityState={{expanded}} onPress={()=>setExpanded(v=>!v)} style={{minHeight:44,justifyContent:'center'}}><Copy variant="caption" style={{color:p.accent}}>{tr("Appointment actions")}</Copy></Pressable>}
  {expanded&&<View style={{gap:10,borderTopWidth:1,borderColor:p.border,paddingTop:12}}>{actions}</View>}
 </Card>;
}
