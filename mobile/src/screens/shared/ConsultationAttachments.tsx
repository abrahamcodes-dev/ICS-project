import {systemMessage} from "../../i18n/translate";
import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import React,{useEffect,useRef,useState} from 'react';
import {Alert,AppState,Image,Modal,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {PatientStackParams} from '../../navigation/types';
import {uuid} from 'expo-modules-core';
import {Action,Copy,Loading,Notice,usePalette} from '../../ui/design';
import {attachmentError,createAttachmentSession,type SelectedAttachment} from '../../services/consultationAttachments';
import type {ConsultationView} from '../../services/consultationService';
import type {ConsultationAttachment} from '@shared/types/consultationAttachments';

export function ConsultationAttachmentComposer({room,uid}:{room:ConsultationView;uid:string}){
  useLocale();
 const navigation=useNavigation<NativeStackNavigationProp<PatientStackParams>>();
 const [file,setFile]=useState<SelectedAttachment|null>(null),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState<string|null>(null),[message,setMessage]=useState('');
 const api=useRef<ReturnType<typeof createAttachmentSession>|null>(null),intent=useRef<{requestId:string;attachmentId?:string}|null>(null),lock=useRef(false),alive=useRef(false),cancelled=useRef(false);
 const patient=uid===room.patientId;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;api.current?.dispose();api.current=null;intent.current=null;};},[room.consultationId,uid]);
 function session(){return api.current??(api.current=createAttachmentSession(uid,room.consultationId));}
 async function pick(){if(lock.current)return;lock.current=true;setBusy(true);setError(null);setMessage('');
  try{const next=await session().pick();if(alive.current&&next){cancelled.current=false;setFile(next);intent.current={requestId:uuid.v4()};setProgress(tr("Ready to share"));}}
  catch(e){if(alive.current)setError(attachmentError(e));}finally{lock.current=false;if(alive.current)setBusy(false);}}
 async function upload(){if(lock.current||!file||!intent.current)return;lock.current=true;cancelled.current=false;setBusy(true);setError(null);setMessage('');
  try{const result=await session().upload(file,intent.current,p=>{if(alive.current)setProgress(p);});
   if(result.attachment.consultationId!==room.consultationId||result.attachment.senderId!==uid)throw new Error(tr("Invalid acknowledgement"));
   await session().clearSelection();if(alive.current){setFile(null);intent.current=null;setMessage(tr("Document shared. It will appear in message history."));}}
  catch(e){if(alive.current&&!cancelled.current)setError(attachmentError(e));}
  finally{lock.current=false;if(alive.current)setBusy(false);}}
 async function cancel(){if(cancelled.current)return;cancelled.current=true;
  try{await session().cancel(intent.current?.attachmentId);if(alive.current){setFile(null);intent.current=null;setError(null);setMessage(tr("Upload cancelled."));}}
  catch(e){cancelled.current=false;if(alive.current)setError(attachmentError(e));}finally{if(alive.current)setBusy(false);}}
 return <View style={{gap:12}}><Action secondary title={tr("Attach document")} disabled={!room.canSend||busy||!!file} onPress={()=>{
  if(patient)Alert.alert(tr("Medical-record sharing unavailable"),tr("Patient document sharing is disabled pending approved privacy and consent policy. Your text chat remains available."),[{text:tr("Close"),style:'cancel'},{text:tr("Review Privacy & Consent"),onPress:()=>navigation.navigate('Profile')}]);
  else void pick();
 }}/>{file&&<><Copy numberOfLines={3}>{file.filename}</Copy><Copy tone="muted">{file.contentType} · {(file.sizeBytes/1024).toFixed(0)} {tr("KiB")}</Copy><Copy accessibilityLiveRegion="polite">{systemMessage(progress)}</Copy>
 <Action title={busy?tr("Uploading document…"):error?tr("Retry same document"):tr("Share document")} disabled={busy||!room.canSend} loading={busy} onPress={()=>{void upload();}}/>
 <Action secondary title={tr("Cancel document upload")} onPress={()=>{void cancel();}}/></>}
 <Notice message={error}/>{!!message&&<Copy accessibilityLiveRegion="polite">{systemMessage(message)}</Copy>}
 {file&&<Copy tone="muted">{tr("A retry uses the same upload and message identifier. After leaving, check history before selecting the file again.")}</Copy>}</View>;
}

export function ConsultationAttachmentViewer({room,uid,attachment,onClose}:{room:ConsultationView;uid:string;attachment:ConsultationAttachment;onClose:()=>void}){
  useLocale();
 const p=usePalette(),[uri,setUri]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{let alive=true;const api=createAttachmentSession(uid,room.consultationId);
  const subscription=AppState.addEventListener('change',state=>{if(state!=='active'){alive=false;api.dispose();close.current();}});
  void api.view(attachment).then(result=>{if(alive)setUri(result.uri);}).catch(e=>{if(alive)setError(attachmentError(e));});
  return()=>{alive=false;subscription.remove();api.dispose();};
 },[attachment.attachmentId,room.consultationId,uid]);
 // Reuse the same native PDF renderer/settings as private administrator evidence.
 const Pdf=uri&&attachment.contentType==='application/pdf'?(require('react-native-pdf') as typeof import('react-native-pdf')).default:null;
 return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:p.background}}><View style={{flex:1,padding:16,gap:12}}>
 <Copy variant="heading" numberOfLines={3}>{attachment.filename}</Copy>{!uri&&!error&&<Loading label={tr("Opening private document")}/>}<Notice message={error}/>
 {uri&&(Pdf?<Pdf style={{flex:1,width:'100%'}} source={{uri,cache:false}} trustAllCerts={false} enableAnnotationRendering={false} onError={()=>{setError(tr("Unable to render this private PDF."));setUri(null);}}/>:<Image accessibilityLabel={tr("Private consultation document")} source={{uri}} resizeMode="contain" style={{flex:1,width:'100%'}} onError={()=>{setError(tr("Unable to render this image."));setUri(null);}}/>)}
 <Action title={tr("Close document")} onPress={onClose}/></View></SafeAreaView></Modal>;
}
