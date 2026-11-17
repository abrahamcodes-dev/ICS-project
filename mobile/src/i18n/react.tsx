import React, {useEffect, useState, useSyncExternalStore} from 'react';
import {Pressable, Text, View} from 'react-native';
import {getLanguage, initializeLanguage, setLanguage, subscribeLanguage} from './locale';

export function useLocale() { return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage); }
export function LanguageProvider({children}: {children: React.ReactNode}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    // Lazy import keeps pure translation/formatting usable without native storage.
    void import('@react-native-async-storage/async-storage').then(module => initializeLanguage(module.default))
      .catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  return ready ? <>{children}</> : null;
}
/** Language names stay in their own language, including before authentication. */
export function LanguageSelector() {
  const language = useLocale(), [failed, setFailed] = useState(false);
  return <View accessibilityLabel="English / Kiswahili" style={{gap:8, flexDirection:'row', flexWrap:'wrap', justifyContent:'center'}}>
    {(['en','sw'] as const).map(value => <Pressable key={value} accessibilityRole="button"
      accessibilityLabel={value === 'en' ? 'English' : 'Kiswahili'} accessibilityState={{selected:language === value}}
      onPress={() => { setFailed(false); void setLanguage(value).catch(() => setFailed(true)); }}
      style={{minHeight:48, padding:12, borderRadius:12, borderWidth:language === value ? 2 : 1, borderColor:'#43876c', backgroundColor:language === value ? '#d9f0e7' : '#ffffff'}}>
      <Text style={{fontSize:16,color:'#123e32',flexShrink:1}}>{value === 'en' ? 'English' : 'Kiswahili'}</Text>
    </Pressable>)}
    {failed && <Text accessibilityRole="alert">{language === 'sw' ? 'Lugha imebadilishwa, lakini haijahifadhiwa. Jaribu tena.' : 'Language changed but could not be saved. Try again.'}</Text>}
  </View>;
}
