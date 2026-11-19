import {tr} from "../../i18n/translate";
import {useLocale, LanguageToolbar} from "../../i18n/react";
import React from 'react';
import {KeyboardAvoidingView, Platform, Pressable, ScrollView, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Copy, spacing, usePalette} from '../../ui/design';

export function LoginLayout({children,busy,onBack,onSignUp,onAssistant,footer}:{
 children:React.ReactNode;busy:boolean;onBack?:()=>void;onSignUp?:()=>void;onAssistant?:()=>void;footer?:React.ReactNode;
}) {
  useLocale();
 const p=usePalette();
 return <SafeAreaView style={{flex:1,backgroundColor:p.background}}>
  <LanguageToolbar/>
  <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
   <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{flexGrow:1,padding:spacing.large,paddingTop:spacing.small}}>
    <View style={{width:'100%',maxWidth:440,alignSelf:'center',gap:spacing.large}}>
     {onBack&&<Pressable accessibilityRole="button" accessibilityLabel={tr("Back")} accessibilityState={{disabled:busy}} disabled={busy} onPress={onBack} style={{width:48,height:48,justifyContent:'center'}}><Copy accessible={false} style={{fontSize:28}}>{'\u2190'}</Copy></Pressable>}
     <View style={{gap:8,paddingBottom:8}}><Copy title style={{fontSize:30,lineHeight:38}}>{tr("Login to your account")}</Copy><Copy tone="muted">{tr("Your care continues here.")}</Copy></View>
     {children}
     {onAssistant&&<>
      <View style={{flexDirection:'row',alignItems:'center',gap:16}}><View style={{flex:1,height:1,backgroundColor:p.border}}/><Copy tone="muted">{tr("or")}</Copy><View style={{flex:1,height:1,backgroundColor:p.border}}/></View>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Continue with health assistant")} disabled={busy} accessibilityState={{disabled:busy}} onPress={onAssistant} style={({pressed})=>({minHeight:56,borderRadius:18,borderWidth:1,borderColor:p.inputBorder,padding:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12,backgroundColor:p.surface,opacity:busy?.5:pressed?.75:1})}>
       <View accessible={false} style={{width:23,height:21,borderRadius:7,borderWidth:2,borderColor:p.text,flexDirection:'row',justifyContent:'space-evenly',alignItems:'center'}}><View style={{position:'absolute',width:2,height:5,top:-6,backgroundColor:p.text}}/>{[0,1].map(i=><View key={i} style={{width:3,height:3,borderRadius:2,backgroundColor:p.text}}/>)}</View><Copy style={{fontWeight:'600',flexShrink:1,textAlign:'center'}}>{tr("Continue with health assistant")}</Copy>
      </Pressable>
     </>}
     {onSignUp&&<View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'center',paddingBottom:16}}><Copy tone="muted">{tr("Don't have an account?")}{' '}</Copy><Pressable accessibilityRole="link" accessibilityLabel={tr("Sign up")} disabled={busy} accessibilityState={{disabled:busy}} onPress={onSignUp} style={{minHeight:48,justifyContent:'center',paddingHorizontal:6}}><Copy style={{color:p.accent,fontWeight:'600'}}>{tr("Sign up")}</Copy></Pressable></View>}
     {footer}
    </View>
   </ScrollView>
  </KeyboardAvoidingView>
 </SafeAreaView>;
}

export function LoginFieldIcon({kind,children}:{kind:'mail'|'lock';children:React.ReactNode}) {
  useLocale();
 const p=usePalette();
 return <View>{children}<View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{position:'absolute',left:16,bottom:17,width:20,height:20,alignItems:'center',justifyContent:'center'}}>
  {kind==='mail'?<View style={{width:20,height:15,borderWidth:1.5,borderColor:p.muted,borderRadius:3}}><View style={{position:'absolute',width:11,height:11,borderBottomWidth:1.5,borderRightWidth:1.5,borderColor:p.muted,transform:[{rotate:'45deg'}],top:-6,left:3}}/></View>:<View style={{width:16,height:14,borderWidth:1.5,borderRadius:3,borderColor:p.muted,marginTop:6,alignItems:'center',justifyContent:'center'}}><View style={{position:'absolute',width:10,height:9,borderWidth:1.5,borderBottomWidth:0,borderTopLeftRadius:6,borderTopRightRadius:6,borderColor:p.muted,top:-9}}/><View style={{width:3,height:5,borderRadius:2,backgroundColor:p.muted}}/></View>}
 </View></View>;
}
