/** Ephemeral UI-only handoff across a locale-triggered React surface remount.
 * Never persisted. A bookmark is not an identity, permission or route grant.
 */
export type DoctorTab = 'Home' | 'Schedule' | 'Consultations' | 'Profile';
export type LocaleIdentity = {
  status: string; firebaseUid: string | null;
  user: {role: string; status: string; verificationStatus?: string} | null;
};
const MAX_AGE_MS = 30_000;
let generation = 0;
let source: {owner: symbol; uid: string; tab: DoctorTab} | undefined;
let bookmark: {owner: symbol; uid: string; tab: DoctorTab; generation: number; at: number; confirmed: boolean} | undefined;
let linksReady = false;
let linkCheck = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
export const subscribeLocaleRestoration = (listener: () => void) => {
  listeners.add(listener); return () => { listeners.delete(listener); };
};
export function discardLocaleRestoration() { bookmark = undefined; generation++; }
export function eligibleDoctor(identity: LocaleIdentity): boolean {
  return identity.status === 'ready' && !!identity.firebaseUid && identity.user?.role === 'doctor'
    && identity.user.status === 'active' && identity.user.verificationStatus === 'approved';
}
export function validateLocaleIdentity(identity: LocaleIdentity) {
  // The expected remount revalidates auth asynchronously; loading is not sign-out.
  if (identity.status === 'initializing' || identity.status === 'loadingIdentity') {
    if (identity.firebaseUid && bookmark && identity.firebaseUid !== bookmark.uid) discardLocaleRestoration();
    return;
  }
  if (!eligibleDoctor(identity) || (bookmark && identity.firebaseUid !== bookmark.uid)) discardLocaleRestoration();
  if (!eligibleDoctor(identity) || (source && identity.firebaseUid !== source.uid)) source = undefined;
}
export function registerDoctorTab(owner: symbol, identity: LocaleIdentity, tab: DoctorTab, focused: boolean) {
  validateLocaleIdentity(identity);
  if (focused && eligibleDoctor(identity)) source = {owner, uid: identity.firebaseUid!, tab};
  return () => { if (source?.owner === owner) source = undefined; };
}
/** Called for every explicit selection, even if it eventually fails or is a no-op. */
export function beginLocaleSelection() {
  discardLocaleRestoration(); return generation;
}
export function prepareLocaleRestoration(selectedGeneration: number) {
  if (selectedGeneration !== generation || !source || !linksReady) return;
  bookmark = {...source, generation, at: Date.now(), confirmed: false};
}
export function finishLocaleRestoration(selectedGeneration: number, changed: boolean) {
  if (bookmark?.generation !== selectedGeneration || selectedGeneration !== generation) return;
  if (!changed) discardLocaleRestoration();
  else { bookmark.confirmed = true; notify(); }
}
export function consumeDoctorTab(owner: symbol, identity: LocaleIdentity): DoctorTab | undefined {
  validateLocaleIdentity(identity);
  const saved = bookmark;
  if (!saved) return;
  if (Date.now() - saved.at >= MAX_AGE_MS || Date.now() < saved.at) { discardLocaleRestoration(); return; }
  if (!linksReady || !saved.confirmed || saved.owner === owner || !eligibleDoctor(identity)) return;
  bookmark = undefined;
  return saved.tab;
}
/** Root remount waits for URL inspection. Any initial/incoming link takes precedence. */
export function beginLocaleLinkCheck() { linksReady = false; return ++linkCheck; }
export function finishLocaleLinkCheck(check: number, url: string | null) {
  if (check !== linkCheck) return;
  if (url) discardLocaleRestoration();
  linksReady = true; notify();
}
