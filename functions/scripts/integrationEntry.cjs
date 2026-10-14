'use strict';
// Copied by integrationGate into ignored lib/c6-emulator. Guard before any SDK import.
const expected = {
  FUNCTIONS_EMULATOR: 'true',
  GCLOUD_PROJECT: 'demo-calladoc-integration',
  GOOGLE_CLOUD_QUOTA_PROJECT: 'demo-calladoc-integration',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8105',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9105',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9205',
};
const mismatches = Object.entries(expected).filter(([key, value]) => process.env[key] !== value).map(([key]) => key);
if (process.versions.node.split('.')[0] !== '22'
  || mismatches.length
  || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN
  || (process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT !== expected.GCLOUD_PROJECT)
  || JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId !== expected.GCLOUD_PROJECT) {
  throw new Error('Integration entry requires the fixed local demo emulators; check: ' + mismatches.join(', '));
}
module.exports = require('../index.js');
