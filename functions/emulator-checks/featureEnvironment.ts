// Import before any SDK initialization. No interactive or live project is allowed.
const expected: Record<string, string> = {
  GCLOUD_PROJECT: 'demo-calladoc-features-tests',
  GOOGLE_CLOUD_PROJECT: 'demo-calladoc-features-tests',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9108',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8108',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9208',
  CHECKPOINT13_EMULATOR: 'demo-calladoc-features-tests',
  CHECKPOINT14_EMULATOR: 'demo-calladoc-features-tests',
  CHECKPOINT15_EMULATOR: 'demo-calladoc-features-tests',
};
if (process.versions.node.split('.')[0] !== '22' || Object.entries(expected).some(([k,v]) => process.env[k] !== v)
  || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN)
  throw Error('Feature checks require the dedicated disposable local emulator runner.');
export {};
