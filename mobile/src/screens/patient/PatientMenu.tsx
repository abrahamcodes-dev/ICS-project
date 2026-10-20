import React from 'react';
import {View,Pressable,Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {PatientStackParams} from '../../navigation/types';
import {usePalette} from '../../ui/design';
type Nav=Pick<NativeStackScreenProps<PatientStackParams,'Home'>['navigation'],'navigate'>;
export function PatientMenu({navigation}:{navigation:Nav}){
 const colors=usePalette();
 const icons={Home:'⌂',Doctors:'✚',Appointments:'▦',Profile:'○'};
 return <View style={{flexDirection:'row',flexWrap:'wrap',gap:4,borderTopWidth:1,borderColor:colors.border,paddingTop:12}}>{(['Home','Doctors','Appointments','Profile'] as const).map(name=><Pressable key={name} accessibilityRole="button" accessibilityLabel={name} onPress={()=>navigation.navigate(name)} style={({pressed})=>({flex:1,minWidth:64,minHeight:64,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:pressed?colors.surface:colors.background})}><Text accessible={false} style={{color:colors.accent,fontSize:24}}>{icons[name]}</Text><Text style={{color:colors.text,fontSize:12,textAlign:'center'}}>{name}</Text></Pressable>)}</View>;
}
