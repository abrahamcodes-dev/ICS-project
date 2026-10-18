import React,{useEffect,useRef,useState} from 'react';
import * as DocumentPicker from 'expo-document-picker';
import {useAuth} from '../../hooks/useAuth';
import {Screen,Card,Copy,Field,Action,Notice,Loading} from '../../ui/design';
import {categories,createVerificationSession,draftInput,fields,mimeTypes,verificationError} from '../../services/doctorVerification';
import type {DoctorDraftInput,DoctorProfile} from '@shared/types/profiles';
import type {CredentialCategory,DoctorCredentialRecord,VerificationRequest} from '@shared/types/verification';

export default function SubmitVerificationScreen(){
 const {user,status,firebaseUid}=useAuth();
 if(status!=='ready'||user?.role!=='doctor'||user.status!=='active'||!['pending','rejected'].includes(user.verificationStatus)||!firebaseUid)
  return <Screen><Copy>Verification submission requires an active pending or rejected doctor account.</Copy></Screen>;
 return <VerificationForm key={firebaseUid} uid={firebaseUid}/>;
}
const labels={professionalName:'Professional name',specialty:'Specialty',registrationNumber:'Registration number',issuingAuthority:'Issuing authority',phoneNumber:'Phone number (optional)'};
export function VerificationForm({uid}:{uid:string}){
 const {user,refreshIdentity,logout}=useAuth();
 const session=useRef<ReturnType<typeof createVerificationSession>|null>(null),alive=useRef(false),working=useRef(false);
 const [profile,setProfile]=useState<DoctorProfile|null>(null),[values,setValues]=useState<DoctorDraftInput>({}),[loaded,setLoaded]=useState(false);
 const [request,setRequest]=useState<VerificationRequest|null>(null),[records,setRecords]=useState<DoctorCredentialRecord[]>([]);
 const [category,setCategory]=useState<CredentialCategory>('medical_license'),[credentialId,setCredentialId]=useState(''),[requestId,setRequestId]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null),[progress,setProgress]=useState<number|null>(null);
 async function load(current:ReturnType<typeof createVerificationSession>){
  const row=await current.profile();if(!alive.current)return;
  setProfile(row);const next:DoctorDraftInput={};for(const key of Object.keys(fields) as (keyof DoctorDraftInput)[])if(row?.[key])next[key]=row[key];setValues(next);setLoaded(true);
  const knownId=row?.activeRequestId||requestId;
  if(knownId){const found=await current.request(knownId);if(alive.current){setRequest(found);setRequestId(found.requestId);}}
 }
 useEffect(()=>{const current=createVerificationSession(uid);session.current=current;alive.current=true;
  void load(current).catch(e=>{if(alive.current)setError(verificationError(e));});
  return()=>{alive.current=false;current.dispose();session.current=null;};
 },[uid]);
 async function run(action:(current:ReturnType<typeof createVerificationSession>)=>Promise<void>){
  if(working.current||!session.current)return;working.current=true;setBusy(true);setError(null);setMessage(null);
  try{await action(session.current);}catch(e){if(alive.current)setError(verificationError(e));}finally{working.current=false;if(alive.current){setBusy(false);setProgress(null);}}
 }
 function add(record:DoctorCredentialRecord){if(alive.current)setRecords(old=>[...old.filter(r=>r.credentialId!==record.credentialId),record]);}
 const locked=!!profile?.activeRequestId;
 const dirty=Object.keys(fields).some(key=>(values[key as keyof DoctorDraftInput]?.trim()||'')!==(profile?.[key as keyof DoctorDraftInput]||''));
 function validate(complete:boolean){try{draftInput(values,complete);return true;}catch(e){setError((e as Error).message);return false;}}
 return <Screen><Copy title>Doctor verification</Copy><Copy>Account status: {user?.role==='doctor'?user.verificationStatus:'Unavailable'}. Clinical access remains locked until approval.</Copy>
  <Notice message={error}/>{message&&<Copy accessibilityLiveRegion="polite">{message}</Copy>}{busy&&<Loading label={progress===null?'Working…':`Uploading: ${progress}%`}/>}
  <Action title="Refresh status and draft" disabled={busy} onPress={()=>void run(async current=>{await refreshIdentity();await load(current);})}/>
  {!loaded&&<Copy>Load your saved draft before editing.</Copy>}
  <Card><Copy title>Professional profile</Copy>{(Object.keys(fields) as (keyof DoctorDraftInput)[]).map(key=><Field key={key} label={labels[key]} value={values[key]??''} maxLength={fields[key]} editable={loaded&&!locked&&!busy} keyboardType={key==='phoneNumber'?'phone-pad':'default'} onChangeText={value=>setValues(old=>({...old,[key]:value}))}/>)}
   <Copy>All professional fields except phone are required for submission. Drafts may be incomplete. Saving replaces these editable fields.</Copy>
   {locked&&<Copy>Your submitted profile is locked while review is pending.</Copy>}
   {user?.role==='doctor'&&user.verificationStatus==='rejected'&&<Copy>After rejection, correct and save the profile to create a newer revision, then upload fresh credentials.</Copy>}
   <Action title="Save draft" disabled={!loaded||busy||locked} onPress={()=>{if(validate(false))void run(async current=>{await current.save(values);await load(current);if(alive.current)setMessage('Draft saved.');});}}/>
   {profile&&<Copy>Saved revision: {profile.revision}</Copy>}
  </Card>
  <Card><Copy title>Credentials</Copy><Copy>PDF, JPEG or PNG, up to 5 MiB each. Select 1–5 documents, including a medical license. Upload and finalize within 15 minutes.</Copy>
   {categories.map(value=><Action key={value} title={value.replace(/_/g,' ')} secondary={category!==value} disabled={busy||locked} onPress={()=>setCategory(value)}/>)}
   <Action title="Select and upload credential" disabled={!loaded||busy||locked||records.length>=5} onPress={()=>void run(async current=>{
    const picked=await DocumentPicker.getDocumentAsync({type:mimeTypes,multiple:false,copyToCacheDirectory:true});if(picked.canceled||!alive.current)return;
    add(await current.upload(picked.assets[0],category,id=>{if(alive.current)setCredentialId(id);},value=>{if(alive.current)setProgress(value);}));
   })}/>
   <Copy>Keep recovery IDs privately. Files are never made public. If interrupted after upload, retry finalization; expired unfinished slots require a new upload.</Copy>
   <Field label="Credential recovery ID" value={credentialId} onChangeText={setCredentialId} autoCapitalize="none" editable={!busy}/>
   <Action title="Recover credential / retry finalization" disabled={busy||locked||!credentialId||records.length>=5} onPress={()=>void run(async current=>{const record=await current.credential(credentialId);add(record.state==='prepared'?await current.finalize(credentialId):record);})}/>
   {records.map(record=><Card key={record.credentialId}><Copy>{record.category.replace(/_/g,' ')} — {record.state}</Copy><Copy selectable>{record.credentialId}</Copy><Action title={`Remove ${record.credentialId} from selection`} secondary disabled={busy||locked} onPress={()=>setRecords(old=>old.filter(r=>r.credentialId!==record.credentialId))}/></Card>)}
   <Copy>Removing a selection does not delete its stored file. After restarting the app, recover known IDs; automatic credential listing is not permitted.</Copy>
  </Card>
  <Action title="Submit verification" disabled={busy||locked||!profile||dirty||records.length===0} onPress={()=>{if(!validate(true)||!profile)return;void run(async current=>{const result=await current.submit(profile,records);if(!alive.current)return;setRequestId(result.requestId);const found=await current.request(result.requestId);if(alive.current){setRequest(found);setMessage('Verification request received.');}await load(current);await refreshIdentity();});}}/>
  {dirty&&<Copy>Save your changes before submitting.</Copy>}
  <Card><Copy title>Submission status</Copy><Field label="Verification request recovery ID" value={requestId} onChangeText={setRequestId} autoCapitalize="none" editable={!busy}/>
   <Action title="Read verification request" disabled={busy||!requestId} onPress={()=>void run(async current=>{const found=await current.request(requestId);if(alive.current)setRequest(found);})}/>
   {request&&<><Copy>Request status: {request.state}</Copy><Copy selectable>{request.requestId}</Copy>{request.state==='rejected'&&<Copy>Reason: {request.rejectionReason}</Copy>}</>}
   <Copy>Pending requests reload from your profile. Rejected history requires its known request ID after restarting; the backend does not allow listing requests.</Copy>
  </Card>
  <Action secondary title="Sign out" disabled={busy} onPress={()=>void run(async()=>{await logout();})}/>
 </Screen>;
}
