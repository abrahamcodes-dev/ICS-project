import React from 'react';
import {Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Copy, spacing, usePalette} from '../../ui/design';
import type {AvatarImage} from '../../services/avatarService';

export function RegistrationLayout({children,busy,photo,onChoosePhoto,onRemovePhoto,onBack,onSignIn}: {
 children:React.ReactNode;busy:boolean;photo:AvatarImage|null;onChoosePhoto():void;onRemovePhoto():void;onBack?:()=>void;onSignIn?:()=>void;
}) {
 const p=usePalette();
 return <SafeAreaView style={{flex:1,backgroundColor:p.surface}}>
  <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
   <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{flexGrow:1,padding:spacing.large,paddingTop:spacing.small}}>
    <View style={{width:'100%',maxWidth:440,alignSelf:'center',gap:spacing.medium}}>
     {onBack&&<Pressable accessibilityRole="button" accessibilityLabel="Back to role selection" disabled={busy} accessibilityState={{disabled:busy}} onPress={onBack} style={{width:48,height:48,justifyContent:'center'}}><Copy accessible={false} style={{fontSize:28}}>{'\u2190'}</Copy></Pressable>}
     <View style={{gap:6}}><Copy title style={{fontSize:26,lineHeight:34}}>Create your account</Copy><Copy tone="muted">Your care starts here.</Copy></View>
     <View style={{alignItems:'center',gap:4,paddingVertical:8}}>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose optional profile picture" accessibilityHint="Opens your photo library" disabled={busy} accessibilityState={{disabled:busy}} onPress={onChoosePhoto} style={({pressed})=>({width:96,height:96,borderRadius:48,backgroundColor:p.mint,opacity:busy?.5:pressed?.75:1})}>
       {photo?<Image source={{uri:photo.uri}} accessibilityLabel="Selected profile picture" style={{width:96,height:96,borderRadius:48}}/>:<View accessible={false} style={{alignItems:'center',paddingTop:19,overflow:'hidden',height:96,borderRadius:48}}><View style={{width:29,height:29,borderRadius:15,backgroundColor:p.accent,opacity:.5}}/><View style={{width:64,height:48,borderTopLeftRadius:35,borderTopRightRadius:35,backgroundColor:p.accent,opacity:.5,marginTop:5}}/></View>}
       <View pointerEvents="none" accessible={false} style={{position:'absolute',bottom:0,right:0,width:30,height:30,borderRadius:15,backgroundColor:p.primary,borderWidth:3,borderColor:p.surface,alignItems:'center',justifyContent:'center'}}><View style={{width:16,height:12,borderRadius:3,borderWidth:1.5,borderColor:p.onPrimary,alignItems:'center',justifyContent:'center'}}><View style={{position:'absolute',top:-4,width:7,height:3,backgroundColor:p.onPrimary}}/><View style={{width:6,height:6,borderWidth:1.5,borderRadius:4,borderColor:p.onPrimary}}/></View></View>
      </Pressable>
      {photo?<Pressable accessibilityRole="button" accessibilityLabel="Remove selected picture" disabled={busy} onPress={onRemovePhoto} style={{minHeight:44,justifyContent:'center',paddingHorizontal:16}}><Copy variant="caption" tone="muted">Remove picture</Copy></Pressable>:<Copy variant="caption" tone="muted">Add a photo · Optional</Copy>}
     </View>
     {children}
     {onSignIn&&<View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'center',paddingBottom:8}}><Copy tone="muted">Already have an account? </Copy><Pressable accessibilityRole="link" accessibilityLabel="Sign in" disabled={busy} accessibilityState={{disabled:busy}} onPress={onSignIn} style={{minHeight:48,justifyContent:'center',paddingHorizontal:6}}><Copy style={{color:p.accent,fontWeight:'600'}}>Sign in</Copy></Pressable></View>}
    </View>
   </ScrollView>
  </KeyboardAvoidingView>
 </SafeAreaView>;
}

export function RegistrationPassword({children,label,visible,onToggle,disabled}:{children:React.ReactNode;label:string;visible:boolean;onToggle():void;disabled:boolean}) {
 const p=usePalette();
 return <View>{children}<Pressable accessibilityRole="button" accessibilityLabel={`${visible?'Hide':'Show'} ${label.toLowerCase()}`} accessibilityState={{disabled}} disabled={disabled} onPress={onToggle} style={{position:'absolute',right:4,bottom:2,width:48,height:48,alignItems:'center',justifyContent:'center'}}>
  <View accessible={false} style={{width:21,height:14,borderRadius:12,borderWidth:1.5,borderColor:p.muted,alignItems:'center',justifyContent:'center'}}><View style={{width:6,height:6,borderRadius:3,backgroundColor:p.muted}}/>{!visible&&<View style={{position:'absolute',width:25,height:2,backgroundColor:p.muted,transform:[{rotate:'45deg'}]}}/>}</View>
 </Pressable></View>;
}
