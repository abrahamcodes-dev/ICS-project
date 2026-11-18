import {Platform} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
import type {Language} from './locale';

/** Optional on old APKs/iOS/web. Never read native locale back into the JS preference. */
export async function syncNativeLanguage(language: Language): Promise<boolean> {
  if (language !== 'en' && language !== 'sw') throw new Error('Unsupported language');
  if (Platform.OS !== 'android') return false;
  const module = requireOptionalNativeModule<{setLanguage(value: Language): Promise<boolean>}>('CallADocLocale');
  if (!module) throw new Error('Native locale module unavailable');
  return (await module.setLanguage(language)) === true;
}
