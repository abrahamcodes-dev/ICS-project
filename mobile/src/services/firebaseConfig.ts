import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Values come from .env (see .env.example) — never commit real keys.
const flag = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS;
if (flag !== undefined && flag !== '' && flag !== 'true' && flag !== 'false') {
  throw new Error('Firebase emulator flag must be exactly true or false. Reload after correcting configuration.');
}
const emulatorMode = flag === 'true';
// 127.0.0.1 works on physical Android devices and emulators
// when ADB reverse forwarding is configured.
const emulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || '127.0.0.1';
if (emulatorMode && !__DEV__) throw new Error('Firebase emulator mode is forbidden in production builds.');
if (emulatorMode && Platform.OS !== 'android') {
  throw new Error('Firebase emulator mode currently supports Android only.');
}
// Deliberately independent of the live .env values. This demo project has no live resources.
const demoConfig = {
  apiKey: 'demo-calladoc-api-key', authDomain: 'demo-calladoc.firebaseapp.com',
  projectId: 'demo-calladoc', storageBucket: 'demo-calladoc.appspot.com',
  messagingSenderId: '000000000000', appId: '1:000000000000:web:demo-calladoc',
};
const firebaseConfig = emulatorMode ? demoConfig : {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// A mode/config change requires a full app reload, never a silent switch of an existing SDK instance.
const existing = getApps().find(candidate => candidate.name === '[DEFAULT]');
if (existing && Object.entries(firebaseConfig).some(([key,value]) => existing.options[key as keyof typeof firebaseConfig] !== value)) {
  throw new Error('Firebase app configuration mismatch. Fully reload the app; refusing to reuse another project or mode.');
}
if(!emulatorMode && (flag!=='false'||!firebaseConfig.projectId
  ||!/^[a-z][a-z0-9-]*-academic-demo$/.test(firebaseConfig.projectId)||firebaseConfig.projectId.startsWith('demo-')))
  throw new Error('Hosted testing requires explicit emulator=false and a separate academic-demo project.');
const marker = Symbol.for('calladoc.firebase.initialization.v2');
type InitState = {mode: 'emulator' | 'live'; ready: boolean};
type MarkedApp = ReturnType<typeof getApp> & {[marker]?: InitState};
const mode = emulatorMode ? 'emulator' : 'live';
const previous = (existing as MarkedApp | undefined)?.[marker];
if (existing && ((previous && (previous.mode !== mode || !previous.ready)) || (emulatorMode && !previous))) {
  throw new Error('Firebase initialization state is inconsistent. Fully reload before making requests.');
}
export const app = existing ?? initializeApp(firebaseConfig);
if (emulatorMode && app.options.projectId !== 'demo-calladoc') throw new Error('Firebase emulator project must be demo-calladoc.');
(app as MarkedApp)[marker] = {mode, ready:false};
// Reuse only initialization marked complete by this module. Initialization errors
// propagate rather than retrying getAuth(), which would select memory persistence.
export const auth = previous || Platform.OS === 'web'
  ? getAuth(app)
  : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
if (emulatorMode && !previous) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`);
}
export const db = getFirestore(app);
if (emulatorMode && !previous) {
  connectFirestoreEmulator(db, emulatorHost, 8080);
}
export const functions = getFunctions(app, 'us-central1');
if (emulatorMode && !previous) {
  connectFunctionsEmulator(functions, emulatorHost, 5001);
}
export const storage = getStorage(app);
if (emulatorMode && !previous) {
  connectStorageEmulator(storage, emulatorHost, 9199);
}
// Mark ready only after every initialization/connection succeeded. Otherwise a
// module reload rejects a healthy persistent Auth instance as partially initialized.
(app as MarkedApp)[marker] = {mode, ready:true};
