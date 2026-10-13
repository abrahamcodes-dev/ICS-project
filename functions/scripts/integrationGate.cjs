// Local-only entry point. No Firebase login, deployment, or production fallback.
const { readFileSync, readdirSync, mkdirSync, writeFileSync, copyFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const root = resolve(__dirname, '..');
const config = JSON.parse(readFileSync(resolve(root, 'firebase.integration-test.json'), 'utf8'));
if (readdirSync(root).some(name => /^\.env($|\.)/.test(name) && name !== '.env.example'))
  throw new Error('Integration gate refuses Functions environment files; use the demo-only configuration.');
const ports = { auth: 9105, functions: 5105, firestore: 8105, storage: 9205, hub: 4425, logging: 4525 };
if (process.versions.node.split('.')[0] !== '22') throw new Error('Integration gate requires Node 22.');
for (const [name, port] of Object.entries(ports)) {
  if (config.emulators[name]?.host !== '127.0.0.1' || config.emulators[name]?.port !== port)
    throw new Error('Integration gate requires the fixed local emulator configuration.');
}
if (config.functions.source !== 'lib/c6-emulator' || config.functions.runtime !== 'nodejs22'
  || JSON.stringify(config.functions.predeploy) !== JSON.stringify(["node -e \"throw new Error('Integration Functions must never be deployed')\""])
  || config.firestore.rules !== 'firestore.rules' || config.firestore.indexes !== 'firestore.indexes.json'
  || config.storage.rules !== 'storage.rules') throw new Error('Unexpected integration sources.');
const env = { ...process.env, DEBUG: '', GCLOUD_PROJECT: 'demo-calladoc-integration',
  GOOGLE_CLOUD_PROJECT: 'demo-calladoc-integration' };
delete env.GOOGLE_APPLICATION_CREDENTIALS;
delete env.FIREBASE_CONFIG;
delete env.FIREBASE_TOKEN;
for (const key of Object.keys(env)) if (key.endsWith('_EMULATOR_HOST')) delete env[key];
function run(script, args) {
  const child = spawnSync(process.execPath, [resolve(root, script), ...args], { cwd: root, env, stdio: 'inherit' });
  if (child.error) throw child.error;
  if (child.status !== 0) process.exit(child.status ?? 1);
}
const allowedTestFiles = new Set([
  'profiles.integration.test.ts',
  'scheduling.integration.test.ts',
  'consultations.integration.test.ts',
  'consultationCalls.integration.test.ts',
]);

const requestedFiles = process.argv.slice(2);

if (requestedFiles.some(file => !allowedTestFiles.has(file))) {
  throw new Error('Integration gate accepts only approved integration test filenames.');
}

const jestCommand = [
  'node',
  'node_modules/jest/bin/jest.js',
  '--config',
  'jest.integration.config.js',
  '--runInBand',
  ...(requestedFiles.length ? ['--runTestsByPath', ...requestedFiles.map(
    file => `__tests__/integration/${file}`,
  )] : []),
].join(' ');
run('node_modules/typescript/bin/tsc', []);
// Generated only by this local gate; neither tsc nor the production entry imports it.
const runtime = resolve(root, 'lib/c6-emulator');
mkdirSync(runtime, { recursive: true });
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
writeFileSync(resolve(runtime, 'package.json'), JSON.stringify({ name: 'calladoc-emulator-only', private: true,
  main: 'index.cjs', engines: { node: '22' }, dependencies: pkg.dependencies }, null, 2));
copyFileSync(resolve(root, 'scripts/integrationEntry.cjs'), resolve(runtime, 'index.cjs'));
run('node_modules/firebase-tools/lib/bin/firebase.js', [
  'emulators:exec',
  '--only',
  'auth,functions,firestore,storage',
  '--project',
  'demo-calladoc-integration',
  '--config',
  'firebase.integration-test.json',
  jestCommand,
]);
