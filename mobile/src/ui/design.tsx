import {tr} from "../i18n/translate";
import {useLocale, LanguageToolbar} from "../i18n/react";
import {systemMessage} from '../i18n/translate';
import React, {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, Text, TextInput, View, type TextProps, type TextInputProps,
  type StyleProp, type ViewStyle} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

export const spacing = {tiny:4, small:8, compact:12, medium:16, large:24, section:32, spacious:48};
export const typography = {title:30, heading:22, body:16, label:14, caption:12};
export const radius = {input:14, button:18, card:24, pill:999};
export const shadows = {
  card: {shadowColor:'#081426', shadowOffset:{width:0,height:3}, shadowOpacity:0.06, shadowRadius:12, elevation:2},
};
export {palettes,usePalette} from './theme';
import {usePalette} from './theme';

export function Copy({children, title=false, variant, tone='default', style, ...props}:
  TextProps & {children:React.ReactNode; title?:boolean; variant?:'heading'|'body'|'label'|'caption'; tone?:'default'|'muted'}) {
  useLocale();
  const c=usePalette(), size=title ? typography.title : typography[variant ?? 'body'];
  return <Text {...props} style={[{color:tone==='muted'?c.muted:c.text, fontSize:size,
    lineHeight:Math.ceil(size*1.3), fontWeight:title||variant==='heading'?'700':variant==='label'?'600':'400'}, style]}
    accessibilityRole={title||variant==='heading'?'header':props.accessibilityRole}>{children}</Text>;
}

export type ScreenVariant = 'onboarding'|'form'|'dashboard'|'chat'|'immersive';
/** Existing callers retain centered scrolling. Chat/immersive own their scrolling
 * and can use footer for a keyboard-aware composer or call controls. */
export function Screen({children, variant='onboarding', footer}:
  {children:React.ReactNode; variant?:ScreenVariant; footer?:React.ReactNode}) {
  useLocale();
  const c=usePalette(), fixed=variant==='chat'||variant==='immersive', immersive=variant==='immersive';
  const body:ViewStyle={width:'100%', maxWidth:variant==='dashboard'?720:480,
    alignSelf:'center', gap:spacing.large};
  return <SafeAreaView style={{flex:1,backgroundColor:c.background}}>
    {!immersive&&<LanguageToolbar/>}
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      {fixed ? <View style={{flex:1,padding:immersive?0:spacing.medium}}>{children}</View> :
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          contentContainerStyle={{flexGrow:1,padding:spacing.large,justifyContent:variant==='onboarding'?'center':'flex-start'}}>
          <View style={body}>{children}</View>
        </ScrollView>}
      {footer && <View style={{padding:spacing.medium,gap:spacing.small,backgroundColor:c.tabBarBackground}}>{footer}</View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function Card({children, tone='surface', style}:
  {children:React.ReactNode; tone?:'surface'|'mint'; style?:StyleProp<ViewStyle>}) {
  useLocale();
  const c=usePalette(), opacity=useRef(new Animated.Value(1)).current;
  useEffect(()=>{
    let active=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced=>{
      if(!active||reduced)return;
      opacity.setValue(0.85); Animated.timing(opacity,{toValue:1,duration:180,useNativeDriver:true}).start();
    }).catch(()=>{});
    return()=>{active=false;opacity.stopAnimation();};
  },[opacity]);
  return <Animated.View style={[shadows.card,{shadowColor:c.shadow,opacity,padding:spacing.large,gap:spacing.medium,
    borderRadius:radius.card,backgroundColor:tone==='mint'?c.mint:c.surfaceElevated,borderWidth:1,borderColor:c.border},style]}>
    {children}
  </Animated.View>;
}

export function Action({title,onPress,disabled=false,secondary=false,danger=false,selected=false,loading=false}:
  {title:string;onPress():void;disabled?:boolean;secondary?:boolean;danger?:boolean;selected?:boolean;loading?:boolean}) {
  useLocale();
  title=systemMessage(title);
  const c=usePalette(), blocked=disabled||loading, filled=danger||!secondary;
  const color=blocked?c.onDisabled:filled?c.onPrimary:c.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={title}
    accessibilityState={{disabled:blocked,selected,busy:loading}} disabled={blocked}
    onPress={()=>{if(!blocked)onPress();}}
    style={({pressed})=>({minHeight:52,justifyContent:'center',alignItems:'center',flexDirection:'row',
      gap:spacing.small,padding:spacing.compact,borderRadius:radius.button,
      backgroundColor:blocked?c.disabled:danger?c.danger:secondary?(selected?c.mint:c.surface):pressed?c.primaryPressed:c.primary,
      borderWidth:selected?2:1,borderColor:blocked?c.disabled:danger?c.danger:secondary?c.inputBorder:c.primary,
      opacity:pressed&&!blocked?0.85:1})}>
    {loading && <ActivityIndicator color={color} accessible={false}/>}
    <Text style={{fontSize:typography.body,lineHeight:22,fontWeight:'600',color,flexShrink:1,textAlign:'center'}}>{title}</Text>
  </Pressable>;
}

export function Field({label,style,onFocus,onBlur,error,helperText,...props}:
  TextInputProps & {label:string;error?:string;helperText?:string}) {
  useLocale();
  label=systemMessage(label);
  if(props.placeholder) props={...props,placeholder:systemMessage(props.placeholder)};
  const c=usePalette(), [focused,setFocused]=useState(false), disabled=props.editable===false;
  return <View style={{gap:spacing.small}}>
    <Text style={{color:c.text,fontSize:typography.label,lineHeight:20,fontWeight:'600'}}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={c.textMuted} selectionColor={c.accent} keyboardAppearance={c.mode}
      accessibilityHint={error||helperText} {...props}
      accessibilityState={{...props.accessibilityState,disabled}}
      onFocus={event=>{setFocused(true);onFocus?.(event);}}
      onBlur={event=>{setFocused(false);onBlur?.(event);}}
      style={[{minHeight:52,borderRadius:radius.input,borderWidth:focused||error?2:1,
        borderColor:error?c.error:focused?c.accent:c.inputBorder,padding:14,
        color:disabled?c.onDisabled:c.text,backgroundColor:disabled?c.disabled:c.inputBackground,
        fontSize:typography.body,lineHeight:24,textAlignVertical:props.multiline?'top':'center'},style]}/>
    {error ? <Notice message={error}/> : helperText ? <Copy variant="label" tone="muted">{helperText}</Copy> : null}
  </View>;
}

export function Notice({message}: {message:string|null}) {
  useLocale();
  const c=usePalette();
  return message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
    style={{color:c.error,fontSize:typography.body,lineHeight:24}}>{systemMessage(message)}</Text> : null;
}
/** Text labels carry meaning; color is supplementary. Non-interactive by design. */
export function Status({label,tone='neutral'}:
  {label:string;tone?:'neutral'|'success'|'warning'|'error'}) {
  useLocale();
  const c=usePalette(), color=tone==='neutral'?c.text:tone==='error'?c.error:c[tone];
  return <View style={{alignSelf:'flex-start',borderRadius:radius.pill,paddingHorizontal:12,
    paddingVertical:6,backgroundColor:tone==='neutral'?c.surfaceSecondary:tone==='success'?c.successSurface:tone==='warning'?c.warningSurface:c.errorSurface}}>
    <Text style={{color,fontSize:typography.label,lineHeight:20,fontWeight:'600'}}>{systemMessage(label)}</Text>
  </View>;
}
export function Loading({label=tr("Loading your account…")}:{label?:string}) {
  useLocale();
  const c=usePalette();
  return <View accessibilityLiveRegion="polite" accessibilityState={{busy:true}} style={{gap:12}}>
    <ActivityIndicator color={c.accent} accessible={false}/><Copy>{label}</Copy>
  </View>;
}
/** Native geometry: stethoscope bowl, chestpiece and wireless arcs. */
export function Brand(){
  useLocale();const c=usePalette();return <View accessible accessibilityLabel={tr("CallADoc, care within reach")} style={{alignItems:'center',gap:12}}><View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{width:76,height:72}}><View style={{position:'absolute',left:8,top:8,width:40,height:40,borderWidth:5,borderTopWidth:0,borderColor:c.accent,borderBottomLeftRadius:22,borderBottomRightRadius:22}}/><View style={{position:'absolute',left:26,top:43,width:32,height:22,borderLeftWidth:5,borderBottomWidth:5,borderColor:c.accent,borderBottomLeftRadius:15}}/><View style={{position:'absolute',left:50,top:48,width:16,height:16,borderRadius:8,borderWidth:4,borderColor:c.accent}}/>{[18,28].map(size=><View key={size} style={{position:'absolute',right:0,top:0,width:size,height:size,borderTopWidth:3,borderRightWidth:3,borderColor:c.accent,borderTopRightRadius:size}}/>)}</View><Copy title>{tr("CallADoc")}</Copy><Copy>{tr("Care within reach.")}</Copy></View>;}
