import EndConsultationForm from './EndConsultationForm';
import React,{useEffect,useRef,useState} from 'react';
import {Modal,Pressable,ScrollView,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Action,Copy,Notice,usePalette} from '../../ui/design';
import {PatientIcon,type PatientIconName} from '../../ui/PatientIcon';
import {useAuth} from '../../hooks/useAuth';
import {useSchedulingSession} from '../../hooks/useSchedulingSession';
import {observeAppointment,type AppointmentRow} from '../../services/appointmentReads';
import {openConsultation,type ConsultationView} from '../../services/consultationService';

export default function ConsultationOptions({room,prescribe,ended}:{room:ConsultationView;prescribe():void;ended():void}){
 const identity=useAuth();
 if(identity.status!=='ready'||identity.user?.role!=='doctor'||identity.user.status!=='active'||identity.user.verificationStatus!=='approved'||identity.firebaseUid!==room.doctorId)return null;
 return <DoctorOptions key={identity.firebaseUid+':'+room.appointmentId} uid={identity.firebaseUid} room={room} prescribe={prescribe} ended={ended}/>;
}
function DoctorOptions({uid,room,prescribe,ended}:{uid:string;room:ConsultationView;prescribe():void;ended():void}){
 const p=usePalette(),session=useSchedulingSession(uid),[visible,setVisible]=useState(false),[form,setForm]=useState(false),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const [appointment,setAppointment]=useState<AppointmentRow|null>(null),[now,setNow]=useState(Date.now());
 const lock=useRef(false),alive=useRef(true),completed=useRef(false),attempted=useRef(false),latest=useRef(appointment);latest.current=appointment;
 useEffect(()=>{alive.current=true;const stop=observeAppointment(uid,'doctor',room.appointmentId,setAppointment,()=>setAppointment(null));const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{alive.current=false;stop();clearInterval(timer);};},[uid,room.appointmentId]);
 const canEnd=!!appointment&&appointment.doctorId===uid&&appointment.status==='scheduled'&&now>=appointment.endAt&&room.state==='active';
 const canPrescribe=appointment?.status==='completed';
 const dismiss=()=>{if(!lock.current){setVisible(false);setForm(false);setConfirm(false);setError(null);}};
 async function finish(){
  const a=latest.current;if(lock.current||!confirm||!session||!a||a.doctorId!==uid||(!completed.current&&(!(a.status==='scheduled'||attempted.current&&a.status==='completed')||Date.now()<a.endAt)))return;
  lock.current=true;setBusy(true);setError(null);
  try{
   if(!completed.current){attempted.current=true;await session.complete(room.appointmentId);completed.current=true;}
   const refreshed=await openConsultation(room.appointmentId);
   if(refreshed.appointmentId!==room.appointmentId||refreshed.doctorId!==uid||refreshed.state!=='closed')throw new Error('Closure not confirmed');
   if(alive.current){setVisible(false);ended();}
  }catch{if(alive.current)setError('Closure was not confirmed. Retry to check or complete the same appointment.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 const options:Array<{title:string;description:string;explanation?:string;icon:PatientIconName;danger?:boolean;disabled:boolean;onPress?:()=>void}>=[
  {title:'View patient profile',description:'See medical history and records.',explanation:'Medical history is not available through this consultation.',icon:'profile',disabled:true},
  {title:'View uploaded documents',description:'Lab results, reports, etc.',explanation:'Patient document viewing is not available.',icon:'calendar',disabled:true},
  {title:'Create prescription',description:'Issue a digital prescription.',explanation:canPrescribe?undefined:'Available after the appointment is recorded as completed.',icon:'stethoscope',disabled:!canPrescribe||busy,onPress:()=>{dismiss();prescribe();}},
  {title:'End consultation',description:'Close the consultation session.',explanation:canEnd?undefined:'Completion is available after the scheduled end time for an active consultation.',icon:'clock',danger:true,disabled:(!canEnd&&!attempted.current)||busy,onPress:()=>{if(canEnd||attempted.current){setForm(true);setError(null);}}},
 ];
 return <>
  <Pressable accessibilityRole="button" accessibilityLabel="Consultation Options" onPress={()=>setVisible(true)} style={{minHeight:48,paddingHorizontal:20,justifyContent:'center',alignItems:'flex-end'}}><Copy variant="label" style={{color:p.accent}}>Consultation Options ···</Copy></Pressable>
  <Modal visible={visible} transparent={!form} animationType="slide" onRequestClose={()=>{if(form&&!lock.current){setForm(false);setConfirm(false);}else dismiss();}}>
   {form?<EndConsultationForm back={()=>{if(!lock.current){setForm(false);setConfirm(false);}}} confirm={confirm} setConfirm={setConfirm} submit={()=>void finish()} busy={busy} error={error} retrying={attempted.current} eligible={canEnd}/>:<>
   <View style={{flex:1,justifyContent:'flex-end',backgroundColor:p.overlay}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss consultation options" onPress={dismiss} style={{position:'absolute',top:0,left:0,right:0,bottom:0}}/>
    <SafeAreaView edges={['bottom']} accessibilityViewIsModal style={{maxHeight:'92%',backgroundColor:p.surface,borderTopLeftRadius:26,borderTopRightRadius:26}}>
     <ScrollView contentContainerStyle={{padding:20,gap:12}}>
      <View style={{flexDirection:'row',alignItems:'center'}}><Copy variant="heading" style={{flex:1}}>Consultation Options</Copy><Pressable accessibilityRole="button" accessibilityLabel="Close consultation options" disabled={busy} onPress={dismiss} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Copy style={{fontSize:26}}>×</Copy></Pressable></View>
      {options.map(option=><Pressable key={option.title} accessibilityRole="button" accessibilityLabel={option.title} accessibilityState={{disabled:option.disabled}} disabled={option.disabled} onPress={option.onPress} style={{flexDirection:'row',alignItems:'center',gap:12,padding:14,minHeight:88,borderRadius:16,borderWidth:1,borderColor:p.border}}><View style={{width:44,height:44,borderRadius:22,backgroundColor:option.danger?p.errorSurface:p.mint,alignItems:'center',justifyContent:'center'}}><PatientIcon name={option.icon} color={option.danger?p.error:p.accent} size={24}/></View><View style={{flex:1,gap:4}}><Copy variant="label" style={{color:option.danger?p.error:p.text}}>{option.title}</Copy><Copy variant="caption" tone="muted">{option.description}</Copy>{option.explanation&&<Copy variant="caption" tone="muted">{option.explanation}</Copy>}</View></Pressable>)}
      <Notice message={error}/>
     </ScrollView>
    </SafeAreaView>
   </View>
   </>}
  </Modal>
 </>;
}
