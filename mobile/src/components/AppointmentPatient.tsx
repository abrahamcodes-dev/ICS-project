import {tr} from '../i18n/translate';
import {useLocale} from '../i18n/react';
import React,{useState} from 'react';
import {Image,View} from 'react-native';
import {Copy} from '../ui/design';
import {ProfileAvatar} from './ProfileAvatar';
import type {AppointmentPatientDisplay} from '@shared/types/schedulingReads';

export function AppointmentPatient({display,compact=false,children,prominent=false}:{display?:AppointmentPatientDisplay;compact?:boolean;children?:React.ReactNode;prominent?:boolean}){
 useLocale();
 const name=display?.patientDisplayName||tr('Patient'),image=display?.patientAvatar??null;
 const [failed,setFailed]=useState<string|null>(null);
 const size=prominent?64:compact?32:40;
 return <View style={{flex:1,flexDirection:'row',alignItems:'center',gap:8}}>
  {image&&failed!==image?<Image accessibilityLabel={tr("{0} profile picture",{"0":name})} source={{uri:image}} style={{width:size,height:size,borderRadius:size/2}} onError={()=>setFailed(image)}/>:<ProfileAvatar name={name} size={size}/>}
  {children?<View style={{flex:1,gap:5}}><Copy variant="label">{name}</Copy>{children}</View>:<Copy variant={prominent?'heading':'label'} style={{flex:1}}>{name}</Copy>}
 </View>;
}
