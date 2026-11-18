/** Device preference only: never stored on an identity or sent to Firebase. */
import {beginLocaleSelection, prepareLocaleRestoration, finishLocaleRestoration} from '../navigation/localeRestoration';
export type Language = 'en' | 'sw';
export const LANGUAGE_KEY = 'calladoc.language.v1';
let language: Language = 'en';
let revision = 0;
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export const subscribeLanguage = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export interface LanguageStorage {getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>}
let storage: LanguageStorage | undefined;
let writes: Promise<void> = Promise.resolve();
let synchronize: ((language: Language) => Promise<void | boolean>) | undefined;
let initialized = false;
let nativeLanguage: Language | undefined;
let nativeWrites: Promise<void> = Promise.resolve();
function syncNative(selection?: number) {
  const next = language;
  const work = nativeWrites.then(async () => {
    if (!initialized || next !== language || next === nativeLanguage || !synchronize) return;
    try {
      if (selection !== undefined) prepareLocaleRestoration(selection);
      const changed = await synchronize(next);
      if (selection !== undefined) finishLocaleRestoration(selection, changed === true);
      nativeLanguage = next;
    } catch {
      if (selection !== undefined) finishLocaleRestoration(selection, false);
      // Translation/authentication remain usable; a later selection/startup can retry.
      console.warn('Native language synchronization unavailable.');
    }
  });
  nativeWrites = work;
  return work;
}
export async function initializeLanguage(adapter: LanguageStorage, nativeSync?: (language: Language) => Promise<void | boolean>) {
  storage = adapter;
  initialized = false;
  synchronize = nativeSync;
  nativeLanguage = undefined;
  const before = revision;
  const saved = await adapter.getItem(LANGUAGE_KEY);
  if (before === revision && (saved === 'en' || saved === 'sw')) publish(saved);
  initialized = true;
  // Never await Activity recreation on the authentication startup path.
  void syncNative();
}
function publish(next: Language) {
  language = next; revision++;
  listeners.forEach(listener => listener());
}
export async function setLanguage(next: Language) {
  if (next !== 'en' && next !== 'sw') throw new Error('Unsupported language');
  const selection = beginLocaleSelection();
  publish(next);
  // Serialize writes so rapid switching cannot persist an older choice last.
  const write = writes.catch(() => {}).then(() => storage?.setItem(LANGUAGE_KEY, next));
  writes = write;
  await write;
  // Persist before native configuration changes, which may recreate the Activity.
  if (initialized) await syncNative(selection);
}
export const localeTag = () => getLanguage() === 'sw' ? 'sw-KE' : 'en-KE';
