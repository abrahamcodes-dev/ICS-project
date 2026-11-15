import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Alert,BackHandler,Modal,Pressable,ScrollView,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../hooks/useAuth';
import {useSchedulingSession} from '../../hooks/useSchedulingSession';
import {Screen,Card,Copy,Action,Notice,Loading,usePalette} from '../../ui/design';
import {availabilityError,localDay,planLocalAvailability,shiftDate,timeChoices,timeLabel,visibleWindows,zonedDate,type Snapshot,type Window} from '../../services/localAvailability';
import SchedulingAppointments from '../shared/SchedulingAppointments';

export default function SetAvailabilityScreen({navigation}:{navigation:{navigate(name:'ConsultationRoom',params:{appointmentId:string}):void;goBack():void}}){
 const {firebaseUid,user,status}=useAuth(),focused=useIsFocused();
 const [dirty,setDirty]=useState(false);
 const back=()=>{if(dirty)Alert.alert('Leave unsaved hours?','Your changes have not been saved.',[{text:'Keep editing',style:'cancel'},{text:'Leave',style:'destructive',onPress:()=>navigation.goBack()}]);else navigation.goBack();};
 useEffect(()=>{if(!focused)return;const listener=BackHandler.addEventListener('hardwareBackPress',()=>{back();return true;});return()=>listener.remove();},[focused,dirty,navigation]);
 if(!firebaseUid||status!=='ready'||user?.role!=='doctor'||user.status!=='active'||user.verificationStatus!=='approved')return <Screen><Copy>An active, approved doctor account is required.</Copy></Screen>;
 return <AvailabilityEditor key={firebaseUid} uid={firebaseUid} dirtyChanged={setDirty} back={back} open={appointmentId=>navigation.navigate('ConsultationRoom',{appointmentId})}/>;
}
export function AvailabilityEditor({uid,open,dirtyChanged,back}:{uid:string;open(id:string):void;dirtyChanged?(dirty:boolean):void;back?():void}){
 const session=useSchedulingSession(uid),p=usePalette(),generation=useRef(0),saving=useRef(false);
 const [zone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone);
 const [date,setDate]=useState(()=>zonedDate(zone)),[snapshot,setSnapshot]=useState<Snapshot>({}),[rows,setRows]=useState<Window[]>([]),[baseline,setBaseline]=useState<Window[]>([]);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[confirm,setConfirm]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null),[retry,setRetry]=useState(0);
 const [picker,setPicker]=useState<{index:number;field:'startAt'|'endAt'}|null>(null),[now,setNow]=useState(Date.now());
 const dirty=JSON.stringify(rows)!==JSON.stringify(baseline);
 useEffect(()=>{dirtyChanged?.(dirty||busy);},[dirty,busy,dirtyChanged]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
 const context=useMemo(()=>{try{return {range:localDay(date,zone),choices:timeChoices(date,zone),error:null};}catch{return {range:null,choices:[],error:'This date has a clock change at midnight and cannot be edited safely. Choose another date.'};}},[date,zone]);
 useEffect(()=>{
  const token=++generation.current;if(!session)return;
  setLoading(true);setConfirm(false);setError(null);setRows([]);setBaseline([]);setSnapshot({});
  void(async()=>{try{
   if(!context.range)throw Error('date');
   const entries=await Promise.all(context.range.dates.map(async d=>[d,(await session.ownDay(d)).day] as const));
   if(token!==generation.current)return;
   const next=Object.fromEntries(entries),saved=visibleWindows(next,context.range.start,context.range.end);
   setSnapshot(next);setRows(saved);setBaseline(saved);setBlocked(false);
  }catch{if(token===generation.current){setError('Unable to load saved hours. Retry before making changes.');setBlocked(true);}}
  finally{if(token===generation.current)setLoading(false);}})();
  return()=>{++generation.current;};
 },[session,date,retry,context]);
 let plan:ReturnType<typeof planLocalAvailability>=null,validation:string|null=context.error;
 if(!loading&&!blocked&&!validation)try{plan=planLocalAvailability(date,zone,rows,snapshot,now);}catch(e){validation=(e as Error).message;}
 const locked=(w:Window)=>Object.values(snapshot).some(d=>d?.windows.some(old=>old.startAt<=now&&old.startAt<w.endAt&&old.endAt>w.startAt));
 function change(next:Window[]){setRows(next);setConfirm(false);setMessage(null);}
 function discardThen(action:()=>void){if(dirty)Alert.alert('Discard unsaved hours?','Your changes have not been saved.',[{text:'Keep editing',style:'cancel'},{text:'Discard',style:'destructive',onPress:action}]);else action();}
 async function save(){
  if(!session||saving.current||blocked||loading||!confirm)return;
  let request;try{request=planLocalAvailability(date,zone,rows,snapshot,Date.now());}catch(e){setError((e as Error).message);setConfirm(false);return;}if(!request)return;
  const token=generation.current;saving.current=true;setBusy(true);setError(null);
  try{if('days' in request)await session.replaceMany(request);else await session.replace(request);
   const entries=await Promise.all(context.range!.dates.map(async d=>[d,(await session.ownDay(d)).day] as const));
   if(token!==generation.current)return;const next=Object.fromEntries(entries),saved=visibleWindows(next,context.range!.start,context.range!.end);
   setSnapshot(next);setRows(saved);setBaseline(saved);setConfirm(false);setMessage('Availability saved. Showing your latest saved hours.');
  }catch(e){if(token===generation.current){setError(availabilityError(e));setBlocked(true);setConfirm(false);}}
  finally{saving.current=false;if(token===generation.current)setBusy(false);}
 }
 return <Screen variant="dashboard"><View style={{flexDirection:'row',alignItems:'center',gap:8}}>{back&&<Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={busy} onPress={back} style={{minWidth:44,minHeight:44,justifyContent:'center'}}><Copy style={{fontSize:26}}>{'\u2039'}</Copy></Pressable>}<Copy variant="heading" style={{flex:1}}>Manage Availability</Copy></View><Copy tone="muted">Time zone: {zone}</Copy>
 <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Pressable accessibilityRole="button" accessibilityLabel="Previous day" disabled={busy||date<=zonedDate(zone)} onPress={()=>discardThen(()=>{setDate(shiftDate(date,-1));setMessage(null);})} style={{minWidth:44,minHeight:44,justifyContent:'center'}}><Copy>{'\u2039'}</Copy></Pressable><View style={{flex:1}}><Copy variant="label" style={{textAlign:'center'}}>{new Date(date+'T12:00:00Z').toLocaleDateString(undefined,{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'})}</Copy></View><Pressable accessibilityRole="button" accessibilityLabel="Next day" disabled={busy||date>=shiftDate(zonedDate(zone),90)} onPress={()=>discardThen(()=>{setDate(shiftDate(date,1));setMessage(null);})} style={{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center'}}><Copy>{'\u203a'}</Copy></Pressable></View>
 <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{Array.from({length:7},(_,i)=>shiftDate(date,i-3)).map(d=><Pressable key={d} accessibilityRole="button" accessibilityLabel={`Select ${d}`} accessibilityState={{selected:d===date,disabled:busy||d<zonedDate(zone)||d>shiftDate(zonedDate(zone),90)}} disabled={busy||d<zonedDate(zone)||d>shiftDate(zonedDate(zone),90)} onPress={()=>discardThen(()=>{setDate(d);setMessage(null);})} style={{minWidth:54,minHeight:52,padding:12,borderRadius:12,backgroundColor:d===date?p.primary:p.surface,borderWidth:1,borderColor:p.border}}><Copy style={{color:d===date?p.onPrimary:p.text}}>{d.slice(8)}</Copy></Pressable>)}</ScrollView>
 <Action secondary title="Reload saved availability" disabled={busy||loading} onPress={()=>discardThen(()=>{setMessage(null);setRetry(v=>v+1);})}/>
 {loading&&<Loading label="Loading saved availability..."/>}<Notice message={error}/><Notice message={validation}/>{message&&<Copy accessibilityLiveRegion="polite">{message}</Copy>}
 {dirty&&<Copy tone="muted">Unsaved changes</Copy>}
 {!loading&&context.range&&<><Copy variant="heading">Availability windows</Copy>{!rows.length&&<Copy tone="muted">No availability configured for this day.</Copy>}
 {rows.map((w,i)=><Card key={i} style={{padding:16,gap:10}}><Copy variant="label">Window {i+1}</Copy>{(['startAt','endAt'] as const).map(field=><Action key={field} secondary title={`${field==='startAt'?'Start':'End'}: ${Number.isFinite(w[field])?timeLabel(w[field],zone)+(field==='endAt'&&w[field]===context.range!.end?' (next day)':''):'Select time'}`} disabled={busy||blocked||locked(w)} onPress={()=>setPicker({index:i,field})}/>)}{locked(w)&&<Copy tone="muted">These hours have started and must remain unchanged.</Copy>}<Action secondary title={`Remove window ${i+1}`} disabled={busy||blocked||locked(w)} onPress={()=>change(rows.filter((_,index)=>index!==i))}/></Card>)}
 <Action secondary title="Add availability" disabled={busy||blocked||rows.length>=8} onPress={()=>change([...rows,{startAt:NaN,endAt:NaN}])}/>
 <Copy tone="muted">Patients select 15, 30 or 60 minutes. Booked appointments must remain covered. Repeated or skipped times during clock changes are unavailable.</Copy>
 <Action title="Review changes" disabled={busy||blocked||!!validation||!plan} onPress={()=>setConfirm(true)}/>
 {confirm&&plan&&<Card tone="mint"><Copy variant="heading">Review availability</Copy><Copy>{date} / {zone}</Copy>{rows.map((w,i)=><Copy key={i}>{timeLabel(w.startAt,zone)} - {timeLabel(w.endAt,zone)}</Copy>)}{!rows.length&&<Copy>Remove available hours for this local day.</Copy>}{('days' in plan?plan.days:[plan]).map(day=><View key={day.utcDate}><Copy tone="muted">UTC date affected: {day.utcDate}</Copy>{day.windows.map(w=><Copy variant="caption" key={w.startAt}>{new Date(w.startAt).toISOString().slice(11,16)} - {new Date(w.endAt).toISOString().slice(11,16)} UTC</Copy>)}</View>)}<Copy>Existing bookings and started hours are checked again when you save.</Copy><Action title="Save availability" loading={busy} onPress={()=>void save()}/><Action secondary title="Continue editing" disabled={busy} onPress={()=>setConfirm(false)}/></Card>}
 <Copy variant="heading">Appointments on this day</Copy><SchedulingAppointments key={`${uid}:${date}:${retry}`} uid={uid} role="doctor" mode="day" boundary={context.range.start} end={context.range.end} open={open}/></>}
 <Modal visible={picker!==null} animationType="slide" onRequestClose={()=>setPicker(null)}><SafeAreaView style={{flex:1,backgroundColor:p.background,padding:20,gap:12}}><Copy title>Select {picker?.field==='startAt'?'start':'end'} time</Copy><Copy tone="muted">{date} / {zone}</Copy><Action secondary title="Cancel time selection" onPress={()=>setPicker(null)}/><ScrollView>{context.choices.filter(c=>picker?.field!=='startAt'||c.value<context.range!.end).map(c=><Pressable key={c.value} accessibilityRole="button" accessibilityLabel={c.label} onPress={()=>{if(picker)change(rows.map((r,i)=>i===picker.index?{...r,[picker.field]:c.value}:r));setPicker(null);}} style={{minHeight:48,padding:12,borderBottomWidth:1,borderColor:p.border}}><Copy>{c.label}</Copy></Pressable>)}</ScrollView></SafeAreaView></Modal>
 </Screen>;
}
