/** Device preference only: never stored on an identity or sent to Firebase. */
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
export async function initializeLanguage(adapter: LanguageStorage) {
  storage = adapter;
  const before = revision;
  const saved = await adapter.getItem(LANGUAGE_KEY);
  if (before === revision && (saved === 'en' || saved === 'sw')) publish(saved);
}
function publish(next: Language) {
  language = next; revision++;
  listeners.forEach(listener => listener());
}
export async function setLanguage(next: Language) {
  if (next !== 'en' && next !== 'sw') throw new Error('Unsupported language');
  publish(next);
  // Serialize writes so rapid switching cannot persist an older choice last.
  const write = writes.catch(() => {}).then(() => storage?.setItem(LANGUAGE_KEY, next));
  writes = write;
  await write;
}
export const localeTag = () => getLanguage() === 'sw' ? 'sw-KE' : 'en-KE';
