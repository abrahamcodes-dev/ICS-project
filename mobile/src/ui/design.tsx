import React,{useEffect,useRef} from 'react';
import {AccessibilityInfo,Animated,ActivityIndicator,KeyboardAvoidingView,Platform,Pressable,ScrollView,Text,TextInput,View,useColorScheme,type TextInputProps} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
export const spacing={small:8,medium:16,large:24,section:32};
export const typography={title:30,heading:22,body:16,label:14};
export const palettes={
 light:{background:'#F5FBF7',surface:'#FFFFFF',text:'#172B35',muted:'#526761',primary:'#087F5B',accent:'#22C55E',border:'#CBDDD3',error:'#A4262C',onPrimary:'#FFFFFF'},
 dark:{background:'#142C28',surface:'#203D36',text:'#F5FBF7',muted:'#BFCEC5',primary:'#087F5B',accent:'#22C55E',border:'#647D72',error:'#FFB4AB',onPrimary:'#FFFFFF'}
};
export function usePalette(){return palettes[useColorScheme()==='dark'?'dark':'light'];}
export function Copy({children,title=false}: {children:React.ReactNode;title?:boolean}){const c=usePalette();return <Text style={{color:c.text,fontSize:title?typography.title:typography.body,lineHeight:title?38:24,fontWeight:title?'700':'400'}} accessibilityRole={title?'header':undefined}>{children}</Text>;}
export function Screen({children}: {children:React.ReactNode}){const c=usePalette();return <SafeAreaView style={{flex:1,backgroundColor:c.background}}><KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1,padding:24,justifyContent:'center'}}><View style={{width:'100%',maxWidth:480,alignSelf:'center',gap:24}}>{children}</View></ScrollView></KeyboardAvoidingView></SafeAreaView>;}
export function Card({children}: {children:React.ReactNode}){
 const c=usePalette(),opacity=useRef(new Animated.Value(1)).current;
 useEffect(()=>{let active=true;void AccessibilityInfo.isReduceMotionEnabled().then(reduced=>{
  if(!active||reduced)return;opacity.setValue(0.85);Animated.timing(opacity,{toValue:1,duration:180,useNativeDriver:true}).start();
 }).catch(()=>{});return()=>{active=false;opacity.stopAnimation();};},[opacity]);
 return <Animated.View style={{opacity,padding:spacing.large,gap:spacing.medium,borderRadius:24,backgroundColor:c.surface,borderWidth:1,borderColor:c.border}}>{children}</Animated.View>;
}
export function Action({title,onPress,disabled=false,secondary=false}: {title:string;onPress():void;disabled?:boolean;secondary?:boolean}){const c=usePalette();return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>({minHeight:50,justifyContent:'center',alignItems:'center',padding:12,borderRadius:14,backgroundColor:secondary?c.surface:c.primary,borderWidth:1,borderColor:c.primary,opacity:disabled?0.55:pressed?0.75:1,transform:[{scale:pressed?0.98:1}]})}><Text style={{fontSize:16,fontWeight:'600',color:secondary?c.text:c.onPrimary}}>{title}</Text></Pressable>;}
export function Field({label,...props}:TextInputProps & {label:string}){const c=usePalette();return <View style={{gap:8}}><Text style={{color:c.text,fontSize:14,fontWeight:'600'}}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={c.muted} {...props} style={{minHeight:52,borderRadius:12,borderWidth:1,borderColor:c.border,padding:14,color:c.text,backgroundColor:c.background,fontSize:16}}/></View>;}
export function Notice({message}: {message:string|null}){const c=usePalette();return message?<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{color:c.error,lineHeight:22}}>{message}</Text>:null;}
export function Loading({label='Loading your account…'}:{label?:string}){const c=usePalette();return <View accessibilityLiveRegion="polite" style={{gap:12}}><ActivityIndicator color={c.accent}/><Copy>{label}</Copy></View>;}
/** Native geometry: stethoscope bowl, chestpiece and wireless arcs. */
export function Brand(){const c=usePalette();return <View accessible accessibilityLabel="CallADoc, care within reach" style={{alignItems:'center',gap:12}}><View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{width:76,height:72}}><View style={{position:'absolute',left:8,top:8,width:40,height:40,borderWidth:5,borderTopWidth:0,borderColor:c.accent,borderBottomLeftRadius:22,borderBottomRightRadius:22}}/><View style={{position:'absolute',left:26,top:43,width:32,height:22,borderLeftWidth:5,borderBottomWidth:5,borderColor:c.accent,borderBottomLeftRadius:15}}/><View style={{position:'absolute',left:50,top:48,width:16,height:16,borderRadius:8,borderWidth:4,borderColor:c.accent}}/>{[18,28].map(size=><View key={size} style={{position:'absolute',right:0,top:0,width:size,height:size,borderTopWidth:3,borderRightWidth:3,borderColor:c.accent,borderTopRightRadius:size}}/>)}</View><Copy title>CallADoc</Copy><Copy>Care within reach.</Copy></View>;}
