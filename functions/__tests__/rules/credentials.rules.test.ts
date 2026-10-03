import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
let env: RulesTestEnvironment;
const identity = (extra = {}) => ({ uid: 'owner', email: 'doctor@example.test', fullName: 'Doctor', role: 'doctor', status: 'active',
  verificationStatus: 'pending', schemaVersion: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra });
const credential = (extra = {}) => ({ credentialId: 'slot', doctorUid: 'owner', storagePath: 'doctorCredentials/owner/slot/document',
  category: 'medical_license', contentType: 'application/pdf', sizeBytes: 1, state: 'prepared', generation: null, checksum: null, requestId: null,
  schemaVersion: 1, createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1), expiresAt: Timestamp.fromMillis(900001), ...extra });
const client = (uid = 'owner') => env.authenticatedContext(uid).firestore();
const ref = () => doc(client(), 'doctorCredentials/slot');
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), path), data); });
}
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Local demo emulator required.');
  env = await initializeTestEnvironment({ projectId: 'demo-calladoc-rules', firestore: { host: '127.0.0.1', port: 8085,
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
});
beforeEach(async () => { await env.clearFirestore(); await seed('users/owner', identity()); await seed('doctorCredentials/slot', credential()); });
afterAll(async () => { if (env) await env.cleanup(); });
test.each(['pending', 'rejected', 'approved'])('active %s owner reads private metadata', async verificationStatus => {
  await seed('users/owner', identity({ verificationStatus })); await assertSucceeds(getDoc(ref()));
});
test('ready metadata can be read', async () => {
  await seed('doctorCredentials/slot', credential({ state: 'ready', generation: '123', checksum: 'a'.repeat(64) }));
  await assertSucceeds(getDoc(ref()));
});
test('cross-doctor and guest reads denied', async () => {
  await seed('users/other', identity({ uid: 'other' }));
  await assertFails(getDoc(doc(client('other'), 'doctorCredentials/slot')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'doctorCredentials/slot')));
});
test.each(['patient', 'administrator', 'admin', 'unknown'])('%s receives no metadata privilege', async role => {
  const { verificationStatus, ...user } = identity({ role }); await seed('users/owner', user); await assertFails(getDoc(ref()));
});
test.each([null, {}, identity({ uid: 'wrong' }), identity({ status: 'disabled' }), identity({ schemaVersion: 2 }), identity({ verificationStatus: 'unknown' })])
  ('invalid identity %# denied', async user => {
    await env.withSecurityRulesDisabled(async context => { await deleteDoc(doc(context.firestore(), 'users/owner')); });
    if (user) await seed('users/owner', user); await assertFails(getDoc(ref()));
  });
test('all client metadata mutations and listing denied', async () => {
  await assertFails(setDoc(doc(client(), 'doctorCredentials/new'), credential({ credentialId: 'new' })));
  await assertFails(updateDoc(ref(), { state: 'ready' })); await assertFails(deleteDoc(ref()));
  await assertFails(getDocs(collection(client(), 'doctorCredentials')));
});
test.each([{ storagePath: 'wrong' }, { credentialId: 'wrong' }, { doctorUid: 'other' }, { state: 'ready' }, { unknown: true },
  { sizeBytes: 0 }, { sizeBytes: 5242881 }, { category: 'unknown' }, { contentType: 'text/plain' }, { createdAt: 'invalid' },
  { generation: 'unexpected' }, { requestId: 'injected' }])('malformed metadata %# cannot be read', async extra => {
    await seed('doctorCredentials/slot', credential(extra)); await assertFails(getDoc(ref()));
  });
