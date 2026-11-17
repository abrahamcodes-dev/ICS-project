import {systemMessage} from '../../i18n/translate';
import {localeTag} from "../../i18n/locale";
import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import React,{useEffect,useState} from 'react';
import {Pressable,View} from 'react-native';
import {Action,Card,Copy,Loading,Notice,Screen,Status,usePalette} from '../../ui/design';
import {AppointmentPatient} from '../../components/AppointmentPatient';
import {useAppointmentPatients} from '../../hooks/useAppointmentPatients';
import {useSchedulingSession} from '../../hooks/useSchedulingSession';
import {DAY_MS,localDate,localDateRange} from '../../services/schedulingService';
import {readAppointmentPage,consultationUnavailable,type AppointmentRow,type AppointmentCursor} from '../../services/appointmentReads';

export function shiftDay(day:string,days:number){const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+days);return localDate(d.getTime());}
export function weekDays(day:string){const d=new Date(day+'T12:00:00');return Array.from({length:7},(_,i)=>shiftDay(day,i-(d.getDay()+6)%7));}
export function supportedDay(day:string){try{const {start,end}=localDateRange(day);return start>=Date.UTC(100,0,2)&&end<=Date.UTC(9999,11,30);}catch{return false;}}
export function availabilityPartitions(day:string){const {start,end}=localDateRange(day);const dates:string[]=[];for(let t=Math.floor(start/DAY_MS)*DAY_MS;t<end;t+=DAY_MS)dates.push(new Date(t).toISOString().slice(0,10));return dates;}
const time=(t:number)=>new Date(t).toLocaleTimeString(localeTag(),{hour:'numeric',minute:'2-digit'});

export default function DoctorSchedule({uid,open,manage,details}:{uid:string;open(id:string):void;manage():void;details?(id:string):void}){
  useLocale();
 const p=usePalette(),[day,setDay]=useState(()=>localDate()),[tab,setTab]=useState<'Appointments'|'Availability'>('Appointments');
 const [retry,setRetry]=useState(0);
 return <Screen variant="dashboard"><Copy title>{tr("Schedule")}</Copy>
  <Card style={{padding:12,gap:12}}>
   <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
    {([-7,7] as const).map((delta,index)=><React.Fragment key={delta}>{index===1&&<Copy variant="label">{new Date(day+'T12:00:00').toLocaleDateString(localeTag(),{month:'long',year:'numeric'})}</Copy>}<Pressable accessibilityRole="button" accessibilityLabel={delta<0?tr("Previous week"):tr("Next week")} accessibilityState={{disabled:!supportedDay(shiftDay(day,delta))}} disabled={!supportedDay(shiftDay(day,delta))} onPress={()=>setDay(shiftDay(day,delta))} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><Copy style={{fontSize:26,color:p.accent}}>{delta<0?'‹':'›'}</Copy></Pressable></React.Fragment>)}
   </View>
   <View style={{flexDirection:'row'}}>{weekDays(day).map((date,index)=><View key={date} style={{flex:1,alignItems:'center',gap:5}}><Copy variant="caption" tone="muted">{new Date(date+'T12:00:00').toLocaleDateString(localeTag(),{weekday:'short'})}</Copy><Pressable accessibilityRole="button" accessibilityLabel={date} accessibilityState={{selected:date===day,disabled:!supportedDay(date)}} disabled={!supportedDay(date)} onPress={()=>setDay(date)} style={{minHeight:44,width:'100%',alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:date===day?p.primary:'transparent'}}><Copy variant="label" style={{color:date===day?p.onPrimary:p.text}}>{Number(date.slice(-2))}</Copy></Pressable></View>)}</View>
  </Card>
  <ScheduleDay key={uid+':'+day+':'+retry} uid={uid} day={day} tab={tab} setTab={setTab} open={open} details={details} retry={()=>setRetry(v=>v+1)}/>
  <Action title={tr("Manage availability")} onPress={manage}/>
 </Screen>;
}

function ScheduleDay({uid,day,tab,setTab,open,retry,details}:{uid:string;day:string;tab:'Appointments'|'Availability';setTab(tab:'Appointments'|'Availability'):void;open(id:string):void;retry():void;details?(id:string):void}){
  useLocale();
 const p=usePalette(),session=useSchedulingSession(uid),[rows,setRows]=useState<AppointmentRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 const [windows,setWindows]=useState<Array<{startAt:number;endAt:number}>>([]),[availabilityLoading,setAvailabilityLoading]=useState(true),[availabilityError,setAvailabilityError]=useState(false),[now,setNow]=useState(Date.now());
 const {start,end}=localDateRange(day);
 const patients=useAppointmentPatients(uid,rows);
 useEffect(()=>{let active=true;void(async()=>{try{
  let cursor:AppointmentCursor|undefined;const all=new Map<string,AppointmentRow>();
  do{const page=await readAppointmentPage(uid,'doctor','day',start,cursor,end);if(!active)return;page.rows.forEach(a=>{if(a.startAt>=start&&a.startAt<end)all.set(a.appointmentId,a);});cursor=page.cursor??undefined;}while(cursor);
  setRows([...all.values()].sort((a,b)=>a.startAt-b.startAt));
 }catch{if(active)setError(true);}finally{if(active)setLoading(false);}})();
 const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{active=false;clearInterval(timer);};},[uid,start,end]);
 useEffect(()=>{if(!session||tab!=='Availability')return;let active=true;setAvailabilityLoading(true);setAvailabilityError(false);
 void Promise.all(availabilityPartitions(day).map(date=>session.ownDay(date))).then(results=>{if(active)setWindows(results.flatMap(result=>result.day?.windows??[]).filter(w=>w.startAt<end&&w.endAt>start).map(w=>({startAt:Math.max(start,w.startAt),endAt:Math.min(end,w.endAt)})).sort((a,b)=>a.startAt-b.startAt));}).catch(()=>{if(active)setAvailabilityError(true);}).finally(()=>{if(active)setAvailabilityLoading(false);});return()=>{active=false;};},[session,day,tab,start,end]);
 return <>
  <View style={{flexDirection:'row',backgroundColor:p.surface,borderRadius:14,padding:4}}>{(['Appointments','Availability'] as const).map(name=><Pressable key={name} accessibilityRole="tab" accessibilityLabel={name==='Appointments'?tr("Scheduled appointments"):tr("Saved availability")} accessibilityState={{selected:tab===name}} onPress={()=>setTab(name)} style={{flex:1,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:tab===name?p.primary:p.surface}}><Copy variant="label" style={{color:tab===name?p.onPrimary:p.muted}}>{name==='Appointments'?`${tr("Appointments")}${loading||error?'':` (${rows.length})`}`:systemMessage(name)}</Copy></Pressable>)}</View>
  {tab==='Appointments'?<>
   {loading?<Loading label={tr("Loading appointments...")}/>:error?<><Notice message={tr("Unable to load appointments.")}/><Action title={tr("Retry appointments")} onPress={retry}/></>:!rows.length?<Card><Copy>{tr("No appointments on this day.")}</Copy></Card>:rows.map(a=>{const eligible=!consultationUnavailable(a,uid,'doctor',now);const join=()=>{if(!consultationUnavailable(a,uid,'doctor',Date.now()))open(a.appointmentId);};return <Card key={a.appointmentId} style={{padding:14}}><View style={{flexDirection:'row',alignItems:'center',gap:10}}><View style={{flex:1,gap:8}}><Copy variant="label">{time(a.startAt)} – {time(a.endAt)}</Copy><Pressable accessibilityRole="button" accessibilityLabel={tr("View consultation details")} disabled={!details} onPress={()=>details?.(a.appointmentId)} style={{minHeight:44,justifyContent:'center'}}><AppointmentPatient compact display={patients[a.appointmentId]}/></Pressable></View>{eligible?<Action title={tr("Join")} onPress={join}/>:<Status label={a.status==='no_show'?'No-show':a.status.charAt(0).toUpperCase()+a.status.slice(1)} tone="neutral"/>}</View></Card>;})}
  </>:<>
   <Copy tone="muted">{tr("Times in")}{' '}{Intl.DateTimeFormat().resolvedOptions().timeZone}</Copy>
   {availabilityLoading?<Loading label={tr("Loading availability...")}/>:availabilityError?<><Notice message={tr("Unable to load saved availability.")}/><Action title={tr("Retry availability")} onPress={retry}/></>:windows.length?windows.map(w=><Card key={w.startAt}><Copy variant="label">{time(w.startAt)} – {time(w.endAt)}</Copy><Copy tone="muted">{tr("Saved availability")}</Copy></Card>):<Card><Copy>{tr("No saved availability on this day.")}</Copy></Card>}
   <Copy tone="muted">{loading?tr("Loading appointment coverage..."):error?tr("Appointment coverage unavailable."):tr("{0} scheduled appointments on this day. Saved windows may include booked times.", {"0": rows.filter(a=>a.status==='scheduled').length})}</Copy>
  </>}
 </>;
}
