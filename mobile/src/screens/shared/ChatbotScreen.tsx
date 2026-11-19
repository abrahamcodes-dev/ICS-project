import {SW_DISCLAIMER, SW_EMERGENCY, SW_ASSISTANT_NOTICE, SW_WELCOME} from '../../services/kiswahiliHealth';
import {systemMessage} from "../../i18n/translate";
import {tr} from "../../i18n/translate";
import {useLocale,LanguageToolbar} from "../../i18n/react";
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import { useIsFocused, useNavigation, type NavigationProp } from '@react-navigation/native';
import { useAuth } from '../../hooks/useAuth';
import { Action, Copy, Notice, Screen, usePalette } from '../../ui/design';
import { createHealthChatSession, CHATBOT_DISCLAIMER, CHATBOT_LIMIT, CHATBOT_WELCOME, EMERGENCY_GUIDANCE, type HealthReply } from '../../services/chatbotService';
import { MEDICAL_DISCLAIMER } from '../../constants/disclaimers';

const MAX_TURNS = 20;
// Floating hardware-keyboard toolbars do not reliably report resize insets.
// Keep the composer clear while focused; safety text belongs in scrollable content.
const ANDROID_TOOLBAR_CLEARANCE = 72;
export const suggestedQuestions=[tr("What could be causing a headache?"),tr("Tips for better sleep"),tr("When should I see a doctor?"),tr("How to manage stress"),tr("Tips for healthy eating")];
/** Keep one complete accessibility utterance while visually separating the
 * unchanged disclaimer. Body and guidance use the same readable text size. */
export function AssistantMessage({message,prefix='',announcement='none',urgent=false}:{message:string;prefix?:string;announcement?:'none'|'polite'|'assertive';urgent?:boolean}) {
  useLocale();
  const colors=usePalette(),hasDisclaimer=message.endsWith(SW_DISCLAIMER)||message.endsWith(MEDICAL_DISCLAIMER);
  const disclaimer=message.endsWith(SW_DISCLAIMER)?SW_DISCLAIMER:MEDICAL_DISCLAIMER;
  const body=hasDisclaimer?message.slice(0,-disclaimer.length).trimEnd():message;
  return <View accessible accessibilityLabel={`${prefix}${systemMessage(message)}`} accessibilityLiveRegion={announcement} accessibilityRole={urgent?'alert':undefined}>
    <Copy accessible={false} selectable style={{fontSize:16,lineHeight:22}}>{prefix}{body}</Copy>
    {hasDisclaimer&&<View testID="assistant-medical-guidance" style={{marginTop:14,paddingTop:12,borderTopWidth:1,borderColor:colors.border,gap:6}}>
      <Copy accessible={false} style={{fontSize:14,lineHeight:20,fontWeight:'600',color:colors.muted}}>{tr("Medical guidance")}</Copy>
      <Copy accessible={false} selectable style={{fontSize:16,lineHeight:22,color:colors.muted}}>{disclaimer}</Copy>
    </View>}
  </View>;
}
export function HealthConversation({ onCare, onBack, patient }: { onCare(): void; onBack(): void; patient: boolean }) {
  const language=useLocale();
  const colors=usePalette(),scroll=useRef<ScrollView>(null),composer=useRef<TextInput>(null);
  const [inputFocused,setInputFocused]=useState(false);
  const [showInfo,setShowInfo]=useState(false);
  const [session] = useState(createHealthChatSession);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<{ question: string; reply: HealthReply; language: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active' || AppState.currentState == null);
  function dismissKeyboard() { Keyboard.dismiss(); composer.current?.blur(); setInputFocused(false); }
  function reset() { session.reset(); dismissKeyboard(); setShowInfo(false); setInput(''); setTurns([]); setError(null); }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state !== 'active') reset();
    });
    return () => { subscription.remove(); session.reset(); };
  }, [session]);
  function send(question=input) {
    if (!foreground || turns.length >= MAX_TURNS) return;
    try {
      const reply = session.ask(question);
      setTurns(previous => [...previous, { question: question.trim(), reply, language }].slice(-MAX_TURNS));
      setInput(''); setError(null);
    } catch { setError(tr("Enter a question of 1-{0} characters.", {"0": CHATBOT_LIMIT})); }
  }
  const disabled=!foreground||!input.trim()||input.length>CHATBOT_LIMIT||turns.length>=MAX_TURNS;
  return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
   <LanguageToolbar/>
   <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
    <View style={{paddingHorizontal:20,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12}}>
     <Pressable accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} style={({pressed})=>({width:44,height:44,borderRadius:22,backgroundColor:colors.mint,alignItems:'center',justifyContent:'center',opacity:pressed?.7:1})}><Copy accessible={false} style={{fontSize:26,color:colors.accent}}>{'\u2190'}</Copy></Pressable>
     <View style={{flex:1,alignItems:'center',gap:4}}><View style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',alignItems:'center',gap:8}}><Copy accessibilityRole="header" style={{fontSize:22,lineHeight:29,fontWeight:'700'}}>{tr("Health assistant")}</Copy><View style={{backgroundColor:colors.primary,borderRadius:18,paddingHorizontal:12,paddingVertical:4}}><Copy style={{color:colors.onPrimary,fontWeight:'600'}}>{tr("Free")}</Copy></View></View><Copy tone="muted" style={{fontSize:14}}>{tr("Rule-based information assistant")}</Copy></View>
    </View>
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onContentSizeChange={()=>{if(turns.length)scroll.current?.scrollToEnd({animated:true});}} contentContainerStyle={{padding:20,gap:14,flexGrow:1}}>
     <Copy accessible selectable tone="muted" style={{fontSize:13,lineHeight:18}}>{language==='sw'?SW_ASSISTANT_NOTICE:CHATBOT_DISCLAIMER}</Copy>
     <Copy accessible selectable tone="muted" style={{fontSize:13,lineHeight:18}}>{tr("English only. Keywords can miss emergencies. This is not a triage service. For urgent concerns, seek immediate professional help.")}</Copy>
     <View style={{flexDirection:'row',gap:10,alignItems:'flex-start',marginTop:16}}><Image source={require('../../../assets/health-assistant-robot.png')} accessible={false} importantForAccessibility="no" resizeMode="contain" style={{width:58,height:76}}/><View style={{flex:1,backgroundColor:colors.mint,padding:16,borderRadius:20,borderTopLeftRadius:4}}><AssistantMessage message={language==='sw'?SW_WELCOME+'\n\n'+SW_DISCLAIMER:CHATBOT_WELCOME}/></View></View>
     {!turns.length&&suggestedQuestions.map(original=>{const question=systemMessage(original);return <Pressable key={question} accessibilityRole="button" accessibilityLabel={question} disabled={!foreground} onPress={()=>send(question)} style={({pressed})=>({alignSelf:'flex-end',maxWidth:'94%',minHeight:44,justifyContent:'center',paddingHorizontal:16,paddingVertical:10,borderRadius:24,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,opacity:pressed?.7:1})}><Copy>{question}</Copy></Pressable>})}
     {foreground&&turns.map((turn,index)=><React.Fragment key={index}><View accessible accessibilityLabel={tr("You: {0}", {"0": turn.question})} style={{alignSelf:'flex-end',maxWidth:'90%',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:20,borderBottomRightRadius:4,padding:14}}><Copy accessible={false} variant="caption" tone="muted">{tr("You")}</Copy><Copy accessible={false} selectable>{turn.question}</Copy></View><View style={{alignSelf:'flex-start',maxWidth:'94%',backgroundColor:colors.mint,borderRadius:20,borderTopLeftRadius:4,padding:16,borderWidth:turn.reply.emergency?2:0,borderColor:colors.error}}><AssistantMessage message={turn.language===language?turn.reply.response:turn.reply.localized?.[language]??turn.reply.response} prefix={turn.reply.emergency?tr("Urgent guidance: "):tr("Assistant: ")} announcement={index===turns.length-1?(turn.reply.emergency?'assertive':'polite'):'none'} urgent={turn.reply.emergency&&index===turns.length-1}/></View></React.Fragment>)}
     {turns.length>=MAX_TURNS&&<Copy>{tr("Conversation limit reached. Reset to start again.")}</Copy>}
     <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[{title:tr("Reset conversation"),action:reset},{title:patient?tr("Find a doctor"):tr("Sign in for consultations"),action:onCare},{title:showInfo?tr("Hide assistant information"):tr("About this assistant"),action:()=>setShowInfo(v=>!v)}].map(item=><Pressable key={systemMessage(item.title)} accessibilityRole="button" accessibilityLabel={systemMessage(item.title)} onPress={item.action} style={{minHeight:44,justifyContent:'center',paddingHorizontal:8}}><Copy style={{color:colors.accent,fontSize:13,textDecorationLine:'underline'}}>{systemMessage(item.title)}</Copy></Pressable>)}</View>
     {showInfo&&<View style={{gap:8}}><Copy>{tr("English only. Conversation clears when you leave or background the app.")}</Copy><Copy>{language==='sw'?SW_EMERGENCY:EMERGENCY_GUIDANCE}</Copy><Copy>{tr("Consultations are for non-emergency care. This assistant does not contact a doctor or book a visit.")}</Copy></View>}
    </ScrollView>
    <View testID="health-chat-composer" style={{paddingHorizontal:16,paddingTop:8,paddingBottom:12+(Platform.OS==='android'&&inputFocused?ANDROID_TOOLBAR_CLEARANCE:0),gap:10,backgroundColor:colors.background}}><Notice message={error}/>
     <View style={{flexDirection:'row',alignItems:'center',gap:8,padding:8,paddingLeft:18,borderRadius:32,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border}}><TextInput ref={composer} accessibilityLabel={tr("General health question")} accessibilityHint={tr("Ask a general health question without identifying details. Use Send question or the keyboard Send key.")} placeholder={tr("Type your question...")} placeholderTextColor={colors.muted} keyboardAppearance={colors.mode} value={input} onChangeText={setInput} onFocus={()=>setInputFocused(true)} onBlur={()=>setInputFocused(false)} multiline returnKeyType="send" submitBehavior="submit" onSubmitEditing={()=>{if(!disabled)send();}} maxLength={CHATBOT_LIMIT} editable={foreground&&turns.length<MAX_TURNS} style={{flex:1,minHeight:44,maxHeight:120,fontSize:16,color:colors.text,paddingVertical:10}}/>{inputFocused&&<Pressable accessibilityRole="button" accessibilityLabel={tr("Dismiss keyboard")} onPress={dismissKeyboard} style={{width:44,height:48,alignItems:'center',justifyContent:'center'}}><Copy accessible={false} style={{color:colors.accent,fontSize:22}}>{'\u2304'}</Copy></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel={tr("Send question")} accessibilityState={{disabled}} disabled={disabled} onPress={()=>send()} style={({pressed})=>({width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:disabled?colors.disabled:colors.primary,opacity:pressed?.7:1})}><Copy accessible={false} style={{color:disabled?colors.onDisabled:colors.onPrimary,fontSize:25}}>{'\u27a4'}</Copy></Pressable></View>
    </View>
   </KeyboardAvoidingView>
  </SafeAreaView>;
}

export default function ChatbotScreen() {
  useLocale();
  const { status, firebaseUid, user } = useAuth(), focused = useIsFocused();
  const navigation = useNavigation<NavigationProp<{ Doctors: undefined; Login: undefined }>>();
  const patient = status === 'ready' && user?.role === 'patient' && user.status === 'active';
  if (!focused) return null;
  if (status !== 'signedOut' && !patient) return <Screen><Copy>{tr("Health information is available to guests and active patients.")}</Copy><Action title={tr("Back")} onPress={() => navigation.goBack()}/></Screen>;
  return <HealthConversation key={`${status}:${firebaseUid ?? 'guest'}`} patient={patient}
    onCare={() => navigation.navigate(patient ? 'Doctors' : 'Login')} onBack={() => navigation.goBack()}/>;
}
