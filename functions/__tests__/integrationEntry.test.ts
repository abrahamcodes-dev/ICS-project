import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';
const source = readFileSync(resolve(__dirname, '../scripts/integrationEntry.cjs'), 'utf8');
const valid = { FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'demo-calladoc-integration', GOOGLE_CLOUD_QUOTA_PROJECT: 'demo-calladoc-integration',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8105', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9105', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9205',
  FIREBASE_CONFIG: JSON.stringify({ projectId: 'demo-calladoc-integration' }) };
test.each(Object.keys(valid))('missing/misdirected %s rejects before loading any backend', key => {
  for (const value of [undefined, 'production']) {
    const load = jest.fn(); expect(() => runInNewContext(source, { process: { versions: { node: '22.23.3' }, env: { ...valid, [key]: value } }, require: load, module: {} })).toThrow();
    expect(load).not.toHaveBeenCalled();
  }
});
test.each(['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN'])('%s present rejects before SDK import', key => {
  const load = jest.fn(); expect(() => runInNewContext(source, { process: { versions: { node: '22.23.3' }, env: { ...valid, [key]: 'synthetic' } }, require: load, module: {} })).toThrow();
  expect(load).not.toHaveBeenCalled();
});
test('guarded demo entry loads only the production entry without additional exports', () => {
  const load = jest.fn(() => ({})); runInNewContext(source, { process: { versions: { node: '22.23.3' }, env: valid }, require: load, module: {} });
  expect(load.mock.calls).toEqual([['../index.js']]);
  const config = JSON.parse(readFileSync(resolve(__dirname, '../firebase.integration-test.json'), 'utf8'));
  expect(config.functions.source).toBe('lib/c6-emulator'); expect(config.functions.predeploy).toEqual(["node -e \"throw new Error('Integration Functions must never be deployed')\""]);
  expect(JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')).main).toBe('lib/index.js');
});
