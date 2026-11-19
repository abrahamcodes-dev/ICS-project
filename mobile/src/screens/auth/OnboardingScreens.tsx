import {systemMessage} from "../../i18n/translate";
import {tr} from "../../i18n/translate";
import {useLocale,LanguageToolbar} from "../../i18n/react";
import React from 'react';
import {Image,ScrollView,useWindowDimensions,Pressable, View} from 'react-native';
import {SafeAreaView,useSafeAreaInsets} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {GuestStackParams} from '../../navigation/GuestNavigator';
import {Action, Brand, Card, Copy, Screen, Status, usePalette} from '../../ui/design';

/** Original geometric artwork, with no patient imagery or external asset requests. */
function Artwork({kind}:{kind:'care'|'patient'|'doctor'|'assistant'|'success'}) {
  useLocale();
 const p=usePalette();
 return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{alignItems:'center',justifyContent:'center',alignSelf:'center',width:kind==='care'?200:88,height:kind==='care'?200:88,borderRadius:100,backgroundColor:p.mint,marginVertical:12}}>
  {kind==='assistant'?<View style={{width:68,height:48,borderRadius:20,backgroundColor:p.forest,flexDirection:'row',alignItems:'center',justifyContent:'space-evenly'}}><View style={{width:12,height:16,borderRadius:8,backgroundColor:p.surface}}/><View style={{width:12,height:16,borderRadius:8,backgroundColor:p.surface}}/></View>
  :kind==='success'?<Copy style={{fontSize:48,color:p.accent}}>✓</Copy>
  :<><View style={{width:kind==='care'?54:24,height:kind==='care'?54:24,borderRadius:30,backgroundColor:p.accent}}/><View style={{width:kind==='care'?110:48,height:kind==='care'?66:30,borderTopLeftRadius:50,borderTopRightRadius:50,backgroundColor:p.primary,marginTop:8,alignItems:'center',justifyContent:'center'}}>{kind!=='patient'&&<Copy style={{color:p.onPrimary,fontSize:24,fontWeight:'700'}}>+</Copy>}</View></>}
 </View>;
}
function Choice({title,description,kind,onPress}:{title:string;description:string;kind:'patient'|'doctor';onPress:()=>void}) {
  useLocale();
 const p=usePalette();
 return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${description}`} onPress={onPress} style={({pressed})=>({opacity:pressed?0.75:1})}>
  <Card><View style={{flexDirection:'row',alignItems:'center',gap:16}}><Artwork kind={kind}/><View style={{flex:1,gap:6}}><Copy variant="label">{title}</Copy><Copy tone="muted">{description}</Copy></View><Copy style={{color:p.accent,fontSize:24}}>›</Copy></View></Card>
 </Pressable>;
}
export function WelcomeScreen({navigation}:NativeStackScreenProps<GuestStackParams,'Welcome'>) {
  useLocale();
 const p=usePalette(),{height,width}=useWindowDimensions(),insets=useSafeAreaInsets();
 const contentWidth=Math.min(width,520),usableHeight=height-insets.top-insets.bottom;
 return <SafeAreaView style={{flex:1,backgroundColor:p.background}}>
  <LanguageToolbar/>
  <ScrollView bounces={false} contentContainerStyle={{flexGrow:1}}>
   <View style={{width:'100%',maxWidth:520,alignSelf:'center',flexGrow:1,overflow:'hidden'}}>
    <View style={{paddingTop:24,paddingHorizontal:24,alignItems:'center',gap:8,zIndex:1}}>
     <Copy accessibilityLabel={tr("CallADoc")} style={{fontSize:36,lineHeight:44,fontWeight:'700',textAlign:'center',color:p.text}}><Copy style={{fontSize:36,lineHeight:44,fontWeight:'700',color:p.accent}}>{tr("CallA")}</Copy>{tr("Doc")}</Copy>
     <Copy style={{textAlign:'center',maxWidth:260,lineHeight:23}}>{tr("Quality healthcare")}{'\n'}{tr("anytime, anywhere")}</Copy>
    </View>
    <View style={{flex:1,minHeight:Math.max(240,Math.min(contentWidth*.95,usableHeight*.48)),marginTop:12,paddingHorizontal:16,paddingBottom:20,justifyContent:'center'}}>
     <Image testID="welcome-healthcare" source={require('../../../assets/welcome-healthcare.png')} resizeMode="contain" accessible={false} style={{width:'100%',aspectRatio:1245/1263,maxHeight:500,alignSelf:'center'}}/>
    </View>
    <View style={{backgroundColor:p.surface,borderTopLeftRadius:32,borderTopRightRadius:32,paddingHorizontal:24,paddingTop:24,paddingBottom:20,gap:20,marginTop:-16,zIndex:2}}>
     <Copy tone="muted" style={{textAlign:'center',alignSelf:'center',maxWidth:330,lineHeight:23}}>{tr("Talk to a doctor, get trusted advice, and manage your health all in one place.")}</Copy>
     <Pressable accessibilityRole="button" accessibilityLabel={tr("Get Started")} onPress={()=>navigation.navigate('AccountAccess')} style={({pressed})=>({minHeight:52,paddingVertical:14,paddingHorizontal:24,borderRadius:28,backgroundColor:p.primary,opacity:pressed?.85:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:14,flexWrap:'wrap'})}>
      <Copy style={{color:p.onPrimary,fontWeight:'600',textAlign:'center'}}>{tr("Get Started")}</Copy><Copy accessible={false} style={{color:p.onPrimary,fontSize:20}}>{'\u2192'}</Copy>
     </Pressable>
    </View>
   </View>
  </ScrollView>
 </SafeAreaView>;
}
export function AccountAccessScreen({navigation}:NativeStackScreenProps<GuestStackParams,'AccountAccess'>) {
  useLocale();
 const p=usePalette(),{width,fontScale}=useWindowDimensions();
 const stacked=width<360||fontScale>1.25;
 return <SafeAreaView style={{flex:1,backgroundColor:p.background}}>
 <LanguageToolbar/>
 <ScrollView contentContainerStyle={{flexGrow:1,paddingHorizontal:24,paddingTop:8,paddingBottom:16}}>
 <View style={{width:'100%',maxWidth:480,alignSelf:'center',gap:14}}>
  <Pressable accessibilityRole="button" accessibilityLabel={tr("Back to welcome")} onPress={()=>navigation.navigate('Welcome')} style={({pressed})=>({width:44,height:44,borderRadius:22,backgroundColor:p.mint,alignItems:'center',justifyContent:'center',opacity:pressed?0.7:1})}><Copy accessible={false} style={{fontSize:26}}>{'\u2190'}</Copy></Pressable>
  <View style={{gap:4}}><Copy style={{fontSize:20,lineHeight:26,fontWeight:'700'}}>{tr("Welcome to")}</Copy>
   <Copy accessibilityLabel={tr("CallADoc")} style={{fontSize:44,lineHeight:52,fontWeight:'700'}}><Copy style={{fontSize:44,lineHeight:52,fontWeight:'700',color:p.accent}}>{tr("CallA")}</Copy>{tr("Doc")}</Copy>
   <Copy tone="muted">{tr("How would you like to proceed?")}</Copy>
  </View>
  {([{title:tr("Create an account"),description:tr("Book appointments, consult doctors and manage your health."),route:'RoleSelection'},{title:tr("Sign in"),description:tr("Already have an account? Welcome back."),route:'Login'}] as const).map(item=><Pressable key={item.route} accessibilityRole="button" accessibilityLabel={item.title+'. '+item.description} onPress={()=>navigation.navigate(item.route)} style={({pressed})=>({backgroundColor:p.surface,borderColor:p.border,borderWidth:1,borderRadius:22,paddingHorizontal:20,paddingVertical:18,minHeight:94,flexDirection:'row',alignItems:'center',gap:14,shadowColor:p.forest,shadowOpacity:.04,shadowOffset:{width:0,height:2},shadowRadius:6,elevation:1,opacity:pressed?.75:1})}>
   <View style={{flex:1,gap:5}}><Copy style={{fontSize:20,lineHeight:26,fontWeight:'700'}}>{systemMessage(item.title)}</Copy><Copy tone="muted" style={{fontSize:15,lineHeight:21}}>{systemMessage(item.description)}</Copy></View><Copy accessible={false} style={{fontSize:30,color:p.accent}}>{'\u203a'}</Copy>
  </Pressable>)}
  <View style={{flexDirection:'row',alignItems:'center',gap:14}}><View style={{height:1,flex:1,backgroundColor:p.border}}/><Copy tone="muted">{tr("or")}</Copy><View style={{height:1,flex:1,backgroundColor:p.border}}/></View>
  <View style={{borderWidth:1,borderColor:p.border,borderRadius:24,backgroundColor:p.mint,padding:18,gap:10,overflow:'hidden'}}>
   <View style={{flexDirection:'row',alignItems:'flex-start',gap:8}}><Copy style={{flex:1,fontSize:19,lineHeight:25,fontWeight:'700'}}>{tr("Try our AI Health Assistant")}</Copy><View style={{paddingHorizontal:12,paddingVertical:4,borderRadius:20,backgroundColor:p.surface}}><Copy style={{color:p.accent,fontWeight:'600'}}>{tr("Free")}</Copy></View></View>
   <View style={{flexDirection:stacked?'column':'row',alignItems:'center',gap:4}}>
    <View style={{flex:stacked?undefined:1,width:stacked?'100%':undefined,gap:14,zIndex:1}}><Copy tone="muted" style={{fontSize:14,lineHeight:20}}>{tr("General health information from a rule-based assistant. No account required.")}</Copy>
     <Pressable accessibilityRole="button" accessibilityLabel={tr("Chat now")} onPress={()=>navigation.navigate('Chatbot')} style={({pressed})=>({minHeight:48,paddingHorizontal:14,paddingVertical:12,borderRadius:26,backgroundColor:p.primary,flexDirection:'row',gap:10,alignItems:'center',justifyContent:'center',opacity:pressed?.75:1})}><Copy style={{color:p.onPrimary,fontWeight:'600'}}>{tr("Chat now")}</Copy><Copy accessible={false} style={{color:p.onPrimary}}>{'\u2192'}</Copy></Pressable>
    </View>
    <View pointerEvents="none" accessible={false} style={{width:stacked?180:140,height:170,justifyContent:'center'}}><Image testID="health-assistant-robot" source={require('../../../assets/health-assistant-robot.png')} accessible={false} resizeMode="contain" style={{width:'100%',height:'100%'}}/></View>
   </View>
   <Copy variant="caption" tone="muted">{tr("General information only. Not a diagnosis or emergency service.")}</Copy>
  </View>
  <View style={{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:10,paddingVertical:4}}><View accessible={false} style={{width:19,height:23,borderWidth:2,borderColor:p.accent,borderBottomLeftRadius:10,borderBottomRightRadius:10,alignItems:'center'}}><Copy style={{color:p.accent,fontSize:12,lineHeight:17}}>{'\u2713'}</Copy></View><Copy style={{color:p.accent,fontSize:13}}>{tr("Free to use. No account required.")}</Copy></View>
 </View></ScrollView></SafeAreaView>;
}

export function RoleSelectionScreen({navigation}:NativeStackScreenProps<GuestStackParams,'RoleSelection'>) {
  useLocale();
 const p=usePalette(),{width,fontScale}=useWindowDimensions();
 const baseIllustrationWidth=Math.round(Math.min(120,Math.max(72,(Math.min(width-40,560)-48)*0.32)));
 // Grow the actual contain area, not the PNG or card. Reserve text space at larger font scales.
 const illustrationWidth=Math.round(Math.max(72,(baseIllustrationWidth-16)*1.6/Math.max(1,fontScale)));
 const roles=[{role:'patient',title:tr("Patient"),description:tr("Book appointments, consult doctors and manage your health."),image:require('../../../assets/calladoc_patient_pink.png'),aspectRatio:1030/771},{role:'doctor',title:tr("Doctor"),description:tr("Manage your availability and consultations after verification and approval."),image:require('../../../assets/calladoc_doctor_pink.png'),aspectRatio:1354/1162}] as const;
 return <SafeAreaView style={{flex:1,backgroundColor:p.background}}><LanguageToolbar/><ScrollView contentContainerStyle={{flexGrow:1,padding:20,paddingTop:12}}>
  <View style={{width:'100%',maxWidth:560,alignSelf:'center',gap:18}}>
   <Pressable accessibilityRole="button" accessibilityLabel={tr("Back to account access")} onPress={()=>navigation.navigate('AccountAccess')} style={({pressed})=>({width:44,height:44,borderRadius:22,backgroundColor:p.mint,alignItems:'center',justifyContent:'center',opacity:pressed?0.7:1,marginBottom:8})}><Copy accessible={false} style={{fontSize:26,color:p.accent}}>{'\u2190'}</Copy></Pressable>
   {roles.map(item=><Pressable key={item.role} accessibilityRole="button" accessibilityLabel={item.title+'. '+item.description} onPress={()=>navigation.navigate('Register',{role:item.role})} style={({pressed})=>({flexDirection:'row',alignItems:'center',minHeight:174,borderRadius:26,backgroundColor:p.surface,overflow:'hidden',paddingRight:14,gap:10,shadowColor:p.forest,shadowOffset:{width:0,height:3},shadowOpacity:.06,shadowRadius:10,elevation:2,opacity:pressed?.8:1})}>
    <View testID={item.role+'-illustration-container'} pointerEvents="none" style={{width:illustrationWidth,height:150,flexShrink:0,padding:0,justifyContent:'center'}}>
     <Image testID={item.role+'-illustration'} source={item.image} accessible={false} resizeMode="contain" style={{width:'100%',height:'100%'}}/>
    </View>
    <View style={{flex:1,minWidth:0,paddingVertical:18,gap:8}}><Copy style={{fontSize:23,lineHeight:30,fontWeight:'700'}}>{systemMessage(item.title)}</Copy><Copy tone="muted" style={{fontSize:15,lineHeight:22}}>{systemMessage(item.description)}</Copy></View>
    <Copy accessible={false} style={{fontSize:30,color:p.accent}}>{'\u203a'}</Copy>
   </Pressable>)}
  </View>
 </ScrollView></SafeAreaView>;
}

export function SetupSuccess({doctor,onContinue}:{doctor:boolean;onContinue:()=>void}) {
  useLocale();
 return <Screen><Artwork kind="success"/><Copy title>{tr("You're all set!")}</Copy><Copy style={{textAlign:'center'}}>{tr("Your account details have been confirmed.")}</Copy>{doctor&&<Copy tone="muted">{tr("Complete doctor verification before accessing clinical features.")}</Copy>}<Action title={doctor?tr("Continue to verification"):tr("Go to Dashboard")} onPress={onContinue}/></Screen>;
}
