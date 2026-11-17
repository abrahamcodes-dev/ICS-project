import {systemMessage} from "../../i18n/translate";
import {useLocale} from '../../i18n/react';
import {PatientIcon,type PatientIconName} from '../../ui/PatientIcon';
import React from 'react';
import {ProfileAvatar} from '../../components/ProfileAvatar';
import {View,Pressable,Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {PatientStackParams} from '../../navigation/types';
import {usePalette,Copy} from '../../ui/design';
type Nav=Pick<NativeStackScreenProps<PatientStackParams,'Home'>['navigation'],'navigate'>;
export function PatientMenu({navigation,active}:{navigation:Nav;active?:'Home'|'Doctors'|'Appointments'|'Profile'}){
 useLocale(); const colors=usePalette();
 const icons:Record<string,PatientIconName>={Home:'home',Doctors:'stethoscope',Appointments:'calendar',Profile:'profile'};
 return <View style={{flexDirection:'row',flexWrap:'wrap',gap:4,borderTopWidth:1,borderColor:colors.border,paddingTop:8}}>{(['Home','Doctors','Appointments','Profile'] as const).map(name=><Pressable key={name} accessibilityRole="tab" accessibilityState={{selected:active===name}} accessibilityLabel={systemMessage(name)} onPress={()=>navigation.navigate(name)} style={({pressed})=>({flex:1,minWidth:64,minHeight:68,alignItems:'center',justifyContent:'center',gap:4,borderRadius:16,backgroundColor:pressed||active===name?colors.mint:colors.tabBarBackground})}><PatientIcon name={icons[name]} color={active===name?colors.tabActive:colors.tabInactive} size={28}/><Text style={{color:active===name?colors.tabActive:colors.tabInactive,fontWeight:active===name?'700':'400',fontSize:13,textAlign:'center'}}>{systemMessage(name)}</Text></Pressable>)}</View>;
}

export function PatientAvatar({name,uid}:{name:string;uid?:string}){return <ProfileAvatar name={name} uid={uid}/>;}
