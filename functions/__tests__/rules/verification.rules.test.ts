import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { fixture, identity } from '../helpers/verificationFixture';
let env: RulesTestEnvironment;
let documents: Record<string, any>;
async function seed(path: string, data: Record<string, any>) {
  const converted = { ...data };
  for (const key of ['createdAt', 'updatedAt', 'submittedAt', 'reviewedAt', 'occurredAt', 'publishedAt', 'expiresAt'])
    if (converted[key] && typeof converted[key] === 'object') converted[key] = new Timestamp(converted[key].seconds, converted[key].nanoseconds);
  await env.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), path), converted); });
}
const client = (uid: string) => env.authenticatedContext(uid).firestore();
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Local demo emulator required.');
  env = await initializeTestEnvironment({ projectId: 'demo-calladoc-rules', firestore: { host: '127.0.0.1', port: 8085,
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
});
beforeEach(async () => {
  await env.clearFirestore(); const f = fixture(); await f.submit(); documents = f.docs;
  for (const [path, data] of Object.entries(documents)) await seed(path, data);
  await seed('users/patient', identity('patient', 'patient')); await seed('users/other', identity('other'));
});
afterAll(async () => { if (env) await env.cleanup(); });
async function approve(extra = {}) {
  const f = fixture(); await f.submit(); await f.review();
  for (const [path, data] of Object.entries(f.docs)) await seed(path, data);
  if (Object.keys(extra).length) await seed('doctorPublicProfiles/doctor', { ...f.docs['doctorPublicProfiles/doctor'], ...extra });
}
test.each(['doctor', 'admin'])('%s gets request and attached metadata', async uid => {
  await assertSucceeds(getDoc(doc(client(uid), 'verificationRequests/request-1')));
  await assertSucceeds(getDoc(doc(client(uid), 'doctorCredentials/license')));
});
test('five references fit the rule evaluation budget', async () => {
  const data = documents['verificationRequests/request-1'];
  await seed('verificationRequests/request-1', { ...data, credentials: Array.from({ length: 5 }, (_, i) => ({ credentialId: 'id' + i,
    category: i === 4 ? 'medical_license' : 'identity_document', generation: '123', checksum: 'a'.repeat(64) })) });
  for (const uid of ['doctor', 'admin']) await assertSucceeds(getDoc(doc(client(uid), 'verificationRequests/request-1')));
});

test.each(['approved', 'rejected'])('five-reference %s history remains readable', async state => {
  const data = documents['verificationRequests/request-1'];
  await seed('verificationRequests/request-1', { ...data, state, reviewerUid: 'admin', reviewedAt: data.submittedAt,
    ...(state === 'rejected' ? { rejectionReason: 'Evidence requires correction.' } : {}),
    credentials: Array.from({ length: 5 }, (_, i) => ({ credentialId: 'id' + i,
      category: i === 4 ? 'medical_license' : 'identity_document', generation: '123', checksum: 'a'.repeat(64) })) });
  for (const uid of ['doctor', 'admin']) await assertSucceeds(getDoc(doc(client(uid), 'verificationRequests/request-1')));
});
test.each(['patient', 'other'])('%s has no private request or credential access', async uid => {
  await assertFails(getDoc(doc(client(uid), 'verificationRequests/request-1')));
  await assertFails(getDoc(doc(client(uid), 'doctorCredentials/license')));
});
test.each([{}, identity('admin', 'admin'), identity('admin', 'administrator', { status: 'disabled' }), identity('wrong', 'administrator')])
  ('invalid administrator %# has no privileges despite claims', async data => {
    await seed('users/admin', data); const db = env.authenticatedContext('admin', { role: 'administrator' }).firestore();
    await assertFails(getDoc(doc(db, 'verificationRequests/request-1'))); await assertFails(getDoc(doc(db, 'doctorCredentials/license')));
  });
test.each(['prepared', 'ready'])('administrator cannot read %s evidence', async state => {
  await seed('doctorCredentials/license', { ...documents['doctorCredentials/license'], state, requestId: null,
    ...(state === 'prepared' ? { generation: null, checksum: null } : {}) });
  await assertFails(getDoc(doc(client('admin'), 'doctorCredentials/license')));
});
test.each(['doctor', 'other', 'patient', 'admin'])('active %s reads approved public projection', async uid => {
  await approve(); await assertSucceeds(getDoc(doc(client(uid), 'doctorPublicProfiles/doctor')));
});
test.each(['pending', 'rejected', 'disabled'])('target %s is not publicly readable', async state => {
  await approve(); await seed('users/doctor', identity('doctor', 'doctor', state === 'disabled' ? { verificationStatus: 'approved', status: 'disabled' } : { verificationStatus: state }));
  await assertFails(getDoc(doc(client('patient'), 'doctorPublicProfiles/doctor')));
});
test.each([{}, identity('patient', 'patient', { status: 'disabled' })])('invalid reader %# denied', async data => {
  await approve(); await seed('users/patient', data); await assertFails(getDoc(doc(client('patient'), 'doctorPublicProfiles/doctor')));
});
test.each([{ email: 'private' }, { phoneNumber: '123' }, { registrationNumber: 'private' }, { approvedRevision: 2 },
  { approvedRequestId: 'missing' }, { professionalName: 'Changed' }])('public mismatch/leak %# denied', async extra => {
  await approve(extra); await assertFails(getDoc(doc(client('patient'), 'doctorPublicProfiles/doctor')));
});
test('guest access denied', async () => {
  await approve(); const db = env.unauthenticatedContext().firestore();
  for (const path of ['verificationRequests/request-1', 'doctorPublicProfiles/doctor', 'doctorCredentials/license']) await assertFails(getDoc(doc(db, path)));
});
test.each([{ professional: {} }, { reviewerUid: 'spoof' }, { credentials: [] }, { unknown: true }, { profileRevision: 0 }])
  ('malformed request %# denied', async extra => {
    await seed('verificationRequests/request-1', { ...documents['verificationRequests/request-1'], ...extra });
    await assertFails(getDoc(doc(client('admin'), 'verificationRequests/request-1')));
  });
test.each(['verificationRequests', 'verificationAudit', 'doctorPublicProfiles'])('%s denies client mutation and listing', async name => {
  for (const uid of ['doctor', 'admin']) {
    const db = client(uid); await assertFails(setDoc(doc(db, name + '/new'), { doctorUid: 'doctor' }));
    await seed(name + '/existing', { doctorUid: 'doctor' });
    await assertFails(updateDoc(doc(db, name + '/existing'), { state: 'approved' }));
    await assertFails(deleteDoc(doc(db, name + '/existing'))); await assertFails(getDocs(collection(db, name)));
  }
});
test('audit remains backend-only', async () => {
  const path = Object.keys(documents).find(key => key.startsWith('verificationAudit/'))!;
  for (const uid of ['doctor', 'admin', 'patient']) await assertFails(getDoc(doc(client(uid), path)));
});
