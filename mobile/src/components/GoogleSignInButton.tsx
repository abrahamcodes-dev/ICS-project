import {tr} from "../i18n/translate";
import {useLocale} from "../i18n/react";
import React from 'react';
import {ActivityIndicator,Image,Pressable} from 'react-native';
import {Copy,usePalette} from '../ui/design';

export function GoogleSignInButton({onPress,disabled=false,loading=false}:{onPress():void;disabled?:boolean;loading?:boolean}){
  useLocale();
 const p=usePalette(),blocked=disabled||loading;
 return <Pressable accessibilityRole="button" accessibilityLabel={tr("Continue with Google")} accessibilityState={{disabled:blocked,busy:loading}}
  disabled={blocked} onPress={onPress} style={({pressed})=>({minHeight:52,borderRadius:18,borderWidth:1,borderColor:p.inputBorder,
   backgroundColor:p.surface,padding:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12,opacity:blocked?.5:pressed?.8:1})}>
  {loading?<ActivityIndicator color={p.accent}/>:<Image source={require('../../assets/google-g.png')} accessible={false} resizeMode="contain" style={{width:20,height:20}}/>}
  <Copy style={{fontWeight:'600'}}>{tr("Continue with Google")}</Copy>
 </Pressable>;
}
