import React,{useEffect,useRef,useState} from 'react';
import {tr} from '../../i18n/translate';
import {useLocale} from '../../i18n/react';
import {localeTag} from '../../i18n/locale';
import {Action,Card,Copy,Loading,Notice} from '../../ui/design';
import {AppointmentPatient} from '../../components/AppointmentPatient';
import {createAvatarSession} from '../../services/avatarService';
import {onIdentityRefresh} from '../../services/authService';
import {createConsultationMessageSession,type ConsultationView,type ConsultationMessageView} from '../../services/consultationService';
import {ConsultationAttachmentViewer} from '../shared/ConsultationAttachments';
import type {AppointmentPatientDisplay} from '@shared/types/schedulingReads';
import type {ConsultationAttachment} from '@shared/types/consultationAttachments';

/** No patient-profile, medical-history or optional-record reads. Backend checks the appointment participant. */
export function ConsultationPatientSummary({uid,room}:{uid:string;room:ConsultationView}){
 useLocale();
 const [display,setDisplay]=useState<AppointmentPatientDisplay|null>(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true),[blocked,setBlocked]=useState(false);
 useEffect(()=>{
  let alive=true;setDisplay(null);setError(false);setLoading(true);
  const api=createAvatarSession(uid);
  const stop=onIdentityRefresh(()=>{alive=false;api.dispose();setDisplay(null);setBlocked(true);});
  if(uid===room.doctorId)void api.readAppointmentPatient(room.appointmentId).then(value=>{if(alive)setDisplay(value);}).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setLoading(false);});
  else {setError(true);setLoading(false);}
  return()=>{alive=false;stop();api.dispose();};
 },[uid,room.appointmentId,room.doctorId,attempt]);
 if(blocked)return <Copy>{tr('Session changed. Reopen the consultation to continue.')}</Copy>;
 return <Card><Copy variant="heading">{tr('Patient summary')}</Copy>
  {loading&&<Loading/>}{display&&<AppointmentPatient display={display}/>}
  <Notice message={error?tr('Unable to load the authorized patient summary. Refresh your account status.'):null}/>
  {error&&<Action title={tr('Retry')} onPress={()=>setAttempt(v=>v+1)}/>}
  <Copy>{tr('Only appointment-linked identity information is shown. This view does not provide medical history or optional patient records.')}</Copy>
  <Copy variant="label">{tr('Medical history and optional records')}</Copy>
  <Copy>{tr('Restricted. Optional medical-record sharing is not available through this consultation. Consultation attachments are listed separately.')}</Copy>
 </Card>;
}

/** Bounded existing history reads only; never lists Storage or optional patient records. */
export function ConsultationDocuments({uid,room}:{uid:string;room:ConsultationView}){
 useLocale();
 const [rows,setRows]=useState<ConsultationMessageView[]>([]),[error,setError]=useState(false),[loading,setLoading]=useState(true),[exhausted,setExhausted]=useState(false),[blocked,setBlocked]=useState(false),[attempt,setAttempt]=useState(0),[selected,setSelected]=useState<ConsultationAttachment|null>(null);
 const session=useRef<ReturnType<typeof createConsultationMessageSession>|null>(null),alive=useRef(false),busy=useRef(false);
 useEffect(()=>{
  alive.current=true;setRows([]);setSelected(null);setLoading(true);setError(false);setExhausted(false);
  const api=createConsultationMessageSession();session.current=api;
  const stop=onIdentityRefresh(()=>{alive.current=false;api.dispose();setRows([]);setSelected(null);setBlocked(true);});
  let starting=true;
  if(uid===room.doctorId)api.start(room.consultationId,values=>{if(starting&&!values.length)return;if(alive.current){setRows(values);setLoading(false);setError(false);setExhausted(values.length<30);}},()=>{if(alive.current){setRows([]);setSelected(null);setError(true);setLoading(false);}});
  else {setError(true);setLoading(false);}
  starting=false;
  return()=>{alive.current=false;api.dispose();session.current=null;stop();};
 },[uid,room.consultationId,room.doctorId,attempt]);
 async function older(){
  if(!alive.current||busy.current||!rows.length)return;
  busy.current=true;setLoading(true);
  const first=[...rows].sort((a,b)=>a.createdAtTimestamp.seconds-b.createdAtTimestamp.seconds||a.createdAtTimestamp.nanoseconds-b.createdAtTimestamp.nanoseconds||a.messageId.localeCompare(b.messageId))[0];
  try{const page=await session.current?.loadOlder({createdAt:first.createdAtTimestamp,messageId:first.messageId});if(alive.current&&page)setExhausted(page.messages.length<30);}
  catch{if(alive.current){setRows([]);setSelected(null);setError(true);}}
  finally{busy.current=false;if(alive.current)setLoading(false);}
 }
 if(blocked)return <Copy>{tr('Session changed. Reopen the consultation to continue.')}</Copy>;
 const attachments=rows.filter(r=>r.type==='attachment'&&r.senderId===room.doctorId&&r.attachment?.status==='finalized'&&r.attachment.consultationId===room.consultationId&&r.attachment.senderId===room.doctorId);
 return <Card><Copy variant="heading">{tr('Consultation documents')}</Copy>
  <Copy>{tr('Documents shared in this consultation only. Optional patient medical records remain restricted.')}</Copy>
  {loading&&<Loading/>}<Notice message={error?tr('Unable to load consultation documents. Check your connection and consultation access.'):null}/>
  {error&&<Action title={tr('Retry')} onPress={()=>setAttempt(v=>v+1)}/>}
  {!error&&!loading&&!attachments.length&&<Copy>{tr('No consultation attachments in the loaded messages.')}</Copy>}
  {attachments.map(row=><Card key={row.messageId}><Copy selectable>{row.attachment!.filename}</Copy><Copy tone="muted">{new Date(row.createdAt).toLocaleString(localeTag())}</Copy><Action title={tr('View private document')} onPress={()=>setSelected(row.attachment!)}/></Card>)}
  {!error&&!exhausted&&rows.length>0&&<Action title={tr('Load older messages')} disabled={loading} onPress={()=>void older()}/>}
  {selected&&<ConsultationAttachmentViewer uid={uid} room={room} attachment={selected} onClose={()=>setSelected(null)}/>}
 </Card>;
}
