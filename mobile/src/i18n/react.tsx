import React, {useContext, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {Alert, Pressable, Text, View} from 'react-native';
import {HeaderShownContext} from '@react-navigation/elements';
import {getLanguage, initializeLanguage, setLanguage, subscribeLanguage} from './locale';
import {syncNativeLanguage} from './nativeLocale';
import {tr} from './translate';

export function useLocale() { return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage); }
export function LanguageProvider({children}: {children: React.ReactNode}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    // Lazy import keeps pure translation/formatting usable without native storage.
    void import('@react-native-async-storage/async-storage').then(module => initializeLanguage(module.default, syncNativeLanguage))
      .catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  return ready ? <>{children}</> : null;
}
/** One destination-language button; all persistence/native synchronization stays
 * in setLanguage, including the existing one-use Doctor tab bookmark. */
export function LanguageSwitchButton() {
  const language=useLocale(),[busy,setBusy]=useState(false),locked=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function switchLanguage(){
    if(locked.current)return;
    locked.current=true;setBusy(true);
    try{await setLanguage(language==='en'?'sw':'en');}
    catch{if(alive.current)Alert.alert(tr('Language preference'),tr('Language changed but could not be saved. Try again.'));}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  }
  return <Pressable testID="language-switch" accessibilityRole="button"
    accessibilityLabel={language==='en'?tr('Switch to Kiswahili'):tr('Switch to English')}
    accessibilityLanguage={language==='en'?'en-KE':'sw-KE'} accessibilityState={{disabled:busy,busy}}
    disabled={busy} onPress={switchLanguage}
    style={({pressed})=>({minWidth:56,minHeight:48,paddingHorizontal:12,paddingVertical:10,borderRadius:14,
      alignItems:'center',justifyContent:'center',backgroundColor:'#1266C8',opacity:busy?.6:pressed?.8:1})}>
    <Text accessible={false} style={{fontSize:15,lineHeight:22,fontWeight:'700',color:'#ffffff',textAlign:'center'}}>{language==='en'?'KIS':'EN'}</Text>
  </Pressable>;
}
/** Headerless layouts only. Native stacks supply their own headerRight button. */
export function LanguageSelector(){
  const headerShown=useContext(HeaderShownContext);
  return headerShown?null:<View style={{alignSelf:'stretch',alignItems:'flex-end'}}><LanguageSwitchButton/></View>;
}
export function LanguageToolbar(){
  const headerShown=useContext(HeaderShownContext);
  return headerShown?null:<View testID="language-toolbar" style={{paddingHorizontal:24,paddingTop:8,paddingBottom:8}}><LanguageSelector/></View>;
}
