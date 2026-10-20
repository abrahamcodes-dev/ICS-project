import { Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebaseConfig';
let registration: { uid: string; token: string } | null = null;
let pending: Promise<string> | null = null;
/** Tokens never enter logs, navigation or identity documents. Native setup may be unavailable. */
export function registerForPushNotifications(): Promise<string> {
  if (pending) return pending;
  const uid = auth.currentUser?.uid;
  if (!uid) return Promise.reject(new Error('Sign in first.'));
  pending = (async () => {
    if (Platform.OS !== 'android') return 'Push registration is currently Android-only. The inbox remains available.';
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    await Notifications.setNotificationChannelAsync('calladoc', { name: 'CallADoc updates', importance: Notifications.AndroidImportance.DEFAULT });
    const permission = await Notifications.requestPermissionsAsync();
    if (permission.status !== 'granted') { await revokeNotificationDevice(); return 'Push permission denied. Use the in-app inbox.'; }
    const token = await Notifications.getDevicePushTokenAsync();
    if (token.type !== 'android' || typeof token.data !== 'string') throw new Error('Native FCM unavailable.');
    if (auth.currentUser?.uid !== uid) throw new Error('Session changed.');
    if (registration && registration.token !== token.data) await revokeNotificationDevice();
    registration = { uid, token: token.data };
    const result = await httpsCallable(functions, 'setNotificationDevice')({ token: token.data, enabled: true });
    if ((result.data as any)?.registered !== true || (result.data as any)?.deliveryEnabled !== false) throw new Error('Registration not confirmed.');
    if (auth.currentUser?.uid !== uid) { registration = null; throw new Error('Session changed.'); }
    return 'Device registered. Remote delivery is disabled; use the in-app inbox.';
  })().catch(() => 'Push registration unavailable or unconfirmed. The in-app inbox still works.').finally(() => { pending = null; });
  return pending;
}
/** Called before signing out, while the owner can still authorize revocation. */
export async function revokeNotificationDevice() {
  if (!registration) return;
  const current = registration;
  if (auth.currentUser?.uid !== current.uid) { registration = null; return; }
  const result = await httpsCallable(functions, 'setNotificationDevice')({ token: current.token, enabled: false });
  if ((result.data as any)?.registered !== false) throw new Error('Revocation not confirmed.');
  if (registration === current) registration = null;
}
export async function prepareNotificationLogout() {
  if (pending) await pending;
  await revokeNotificationDevice();
}
