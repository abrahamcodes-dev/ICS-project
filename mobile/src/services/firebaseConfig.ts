import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { Platform } from 'react-native';

// Values come from .env (see .env.example) — never commit real keys.
const flag = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS;
if (flag !== undefined && flag !== '' && flag !== 'true' && flag !== 'false') {
  throw new Error('Firebase emulator flag must be exactly true or false. Reload after correcting configuration.');
}
const emulatorMode = flag === 'true';
if (emulatorMode && !__DEV__) throw new Error('Firebase emulator mode is forbidden in production builds.');
if (emulatorMode && Platform.OS !== 'android') {
  throw new Error('Firebase emulator mode currently supports Android Studio emulators only (10.0.2.2).');
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
const marker = Symbol.for('calladoc.firebase.initialization.v1');
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
export const auth = getAuth(app);
if (emulatorMode && !previous) connectAuthEmulator(auth, 'http://10.0.2.2:9099');
export const db = getFirestore(app);
if (emulatorMode && !previous) connectFirestoreEmulator(db, '10.0.2.2', 8080);
export const functions = getFunctions(app, 'us-central1');
if (emulatorMode && !previous) connectFunctionsEmulator(functions, '10.0.2.2', 5001);
export const storage = getStorage(app);
if (emulatorMode && !previous) connectStorageEmulator(storage, '10.0.2.2', 9199);
(app as MarkedApp)[marker] = {mode, ready:true};
