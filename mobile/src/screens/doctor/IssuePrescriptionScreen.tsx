import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import React,{useEffect,useState} from 'react';
import {useIsFocused} from '@react-navigation/native';
import {useAuth} from '../../hooks/useAuth';
import PrescriptionWorkspace,{PrescriptionRecord,type PrescriptionMode} from '../shared/PrescriptionWorkspace';
import {Screen,Copy} from '../../ui/design';
export default function IssuePrescriptionScreen({route,navigation}:{route?:{params?:{appointmentId:string}};navigation?:{setOptions(options:{title:string}):void}}){
  const language=useLocale();
 const identity=useAuth(),focused=useIsFocused(),id=route?.params?.appointmentId;
 const [mode,setMode]=useState<PrescriptionMode>(id?'loading':'list');
 useEffect(()=>{setMode(id?'loading':'list');},[id,identity.firebaseUid]);
 useEffect(()=>{navigation?.setOptions({title:mode==='view'?tr('View prescription'):mode==='create'?tr('Create Prescription'):tr('Digital prescriptions')});},[mode,language,navigation]);
 if(!focused)return null;
 if(!id)return <PrescriptionWorkspace onModeChange={setMode}/>;
 if(identity.status!=='ready'||!identity.firebaseUid||identity.user?.role!=='doctor'||identity.user.status!=='active'||identity.user.verificationStatus!=='approved'||!/^[a-f0-9]{64}$/.test(id))return <Screen><Copy>{tr("An active approved doctor and valid consultation are required.")}</Copy></Screen>;
 return <Screen variant="dashboard"><PrescriptionRecord key={identity.firebaseUid+':'+id} uid={identity.firebaseUid} cid={id} doctor onModeChange={setMode}/></Screen>;
}
