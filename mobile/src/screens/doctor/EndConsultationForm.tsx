import React,{useState} from 'react';
import {Modal,Pressable,Switch,View} from 'react-native';
import {Action,Card,Copy,Field,Notice,Screen,usePalette} from '../../ui/design';

/** Presentation only: completion and reconciliation remain owned by the consultation workflow. */
export default function EndConsultationForm({back,confirm,setConfirm,submit,busy,error,retrying,eligible}:{back():void;confirm:boolean;setConfirm(value:boolean):void;submit():void;busy:boolean;error:string|null;retrying:boolean;eligible:boolean}){
 const p=usePalette();
 const [outcome,setOutcome]=useState<'completed'|null>(retrying?'completed':null),[choosing,setChoosing]=useState(false);
 return <Screen variant="dashboard">
  <View style={{flexDirection:'row',alignItems:'center'}}><Pressable accessibilityRole="button" accessibilityLabel="Back to consultation options" disabled={busy} onPress={back} style={{width:44,height:44,justifyContent:'center'}}><Copy style={{fontSize:28}}>←</Copy></Pressable><Copy variant="heading" style={{flex:1,textAlign:'center'}}>End Consultation</Copy><View style={{width:44}}/></View>
  <Field label="Add consultation notes (optional)" placeholder="Enter your notes about this consultation..." value="" multiline editable={false} maxLength={2000} style={{minHeight:150}} helperText="Consultation notes cannot currently be saved securely. This field is unavailable."/>
  <View style={{gap:8}}><Copy variant="label">Outcome</Copy><Action secondary title={outcome?'Completed':'Select outcome'} disabled={busy||confirm||retrying} onPress={()=>setChoosing(v=>!v)}/>{choosing&&<Action secondary title="Completed" onPress={()=>{setOutcome('completed');setChoosing(false);}}/>}<Copy variant="caption" tone="muted">This workflow records the appointment as completed. Clinical outcome categories are not supported.</Copy></View>
  <View style={{gap:8}}><View style={{flexDirection:'row',alignItems:'center'}}><Copy variant="label" style={{flex:1}}>Follow-up required?</Copy><Switch trackColor={{false:p.disabled,true:p.primary}} thumbColor={p.onDisabled} accessibilityLabel="Follow-up required" value={false} disabled/></View><Copy variant="caption" tone="muted">Follow-up information cannot currently be saved. No appointment or reminder will be created.</Copy></View>
  {!eligible&&!retrying&&<Copy tone="muted">Completion requires your scheduled appointment to have reached its end time.</Copy>}
  <Notice message={error}/>
  <Action title={busy?'Ending consultation...':retrying?'Retry ending consultation':'End consultation'} disabled={!outcome||busy||(!eligible&&!retrying)} onPress={()=>{if(outcome&& !busy&&(eligible||retrying))setConfirm(true);}}/>
  <Modal visible={confirm} transparent animationType="fade" onRequestClose={()=>{if(!busy)setConfirm(false);}}>
   <View style={{flex:1,justifyContent:'center',padding:24,backgroundColor:p.overlay}}><Card><Copy variant="heading">End consultation?</Copy><Copy>The appointment will be recorded as completed and the consultation will close. Chat and calls will no longer be available.</Copy><Action title={busy?'Closing consultation...':retrying?'Retry closing consultation':'Confirm end consultation'} disabled={busy||!outcome} onPress={()=>{if(outcome&&!busy)submit();}}/><Action secondary title="Keep consultation open" disabled={busy} onPress={()=>setConfirm(false)}/></Card></View>
  </Modal>
 </Screen>;
}
