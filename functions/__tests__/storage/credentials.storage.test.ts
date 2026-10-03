import { readFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { ref, uploadBytes, getBytes, updateMetadata, deleteObject, listAll } from "firebase/storage";
import { Firestore, CollectionReference, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { getDoc } from 'firebase/firestore';
import { createVerificationHandlers } from '../../src/profiles/verificationHandlers';
import { createVerificationStore } from '../../src/profiles/verificationStore';
import { Storage } from "@google-cloud/storage";
import type { DoctorCredentialRecord } from "../../../shared/types/verification";
import { createCredentialHandlers } from "../../src/profiles/credentialHandlers";
import { createCredentialStore } from "../../src/profiles/credentialStore";

const projectId = 'demo-calladoc-credentials', bucketName = projectId + '.appspot.com';
const objectPath = 'doctorCredentials/owner/slot-id/document';
let env: RulesTestEnvironment, db: Firestore;
let bucket: ReturnType<Storage['bucket']>;
const identity = (extra = {}) => ({ uid: 'owner', email: 'doctor@example.test', fullName: 'Doctor', role: 'doctor', status: 'active',
  verificationStatus: 'pending', schemaVersion: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra });
function slot(extra = {}) {
  const now = Timestamp.now();
  return { credentialId: 'slot-id', doctorUid: 'owner', storagePath: objectPath, state: 'prepared', category: 'medical_license',
    contentType: 'application/pdf', sizeBytes: 1, generation: null, checksum: null, requestId: null, schemaVersion: 1,
    createdAt: now, updatedAt: now, expiresAt: Timestamp.fromMillis(now.toMillis() + 900000), ...extra };
}
const client = (uid = 'owner', claims = {}) => env.authenticatedContext(uid, claims).storage('gs://' + bucketName);
const upload = (path = objectPath, size = 1, contentType = 'application/pdf', uid = 'owner') =>
  uploadBytes(ref(client(uid), path), new Uint8Array(size).fill(65), { contentType });
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), path), data); });
}
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8095'
    || process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9195') throw new Error('Requires local demo Firestore + Storage emulators.');
  env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8095,
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') }, storage: { host: '127.0.0.1', port: 9195,
    rules: readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8') } });
  db = new Firestore({ projectId, host: '127.0.0.1:8095', ssl: false });
  bucket = new Storage({ projectId, apiEndpoint: 'http://127.0.0.1:9195', useAuthWithCustomEndpoint: false }).bucket(bucketName);
});
async function clearDemoBucket() {
  // rules-unit-testing clearStorage only lists root items; our objects are nested.
  const [files] = await bucket.getFiles();
  await Promise.all(files.map(file => file.delete()));
}
beforeEach(async () => { await env.clearFirestore(); await clearDemoBucket(); await seed('users/owner', identity()); await seed('doctorCredentials/slot-id', slot()); });
afterAll(async () => { if (env) await env.cleanup(); if (db) await db.terminate(); });

test.each(['application/pdf', 'image/jpeg', 'image/png'])('%s upload allowed', async contentType => {
  await seed('doctorCredentials/slot-id', slot({ contentType })); await assertSucceeds(upload(objectPath, 1, contentType));
});
test('rejected doctor can use prepared slot', async () => {
  await seed('users/owner', identity({ verificationStatus: 'rejected' })); await assertSucceeds(upload());
});
test.each(['patient', 'administrator', 'admin', 'unknown'])('%s cannot upload/read, even with doctor claim', async role => {
  await upload(); const { verificationStatus, ...user } = identity({ role }); await seed('users/owner', user);
  const store = client('owner', { role: 'doctor' });
  await assertFails(getBytes(ref(store, objectPath)));
  await clearDemoBucket();
  await assertFails(uploadBytes(ref(store, objectPath), new Uint8Array(1), { contentType: 'application/pdf' }));
});
test.each([null, {}, identity({ uid: 'wrong' }), identity({ status: 'disabled' }), identity({ schemaVersion: 2 }),
  identity({ fullName: '\u00a0Doctor' }), identity({ createdAt: '2026-02-30T00:00:00.000Z' }), identity({ verificationStatus: 'unknown' })])
  ('missing/malformed/disabled identity %# denied despite claim', async user => {
    await env.withSecurityRulesDisabled(async context => { await deleteDoc(doc(context.firestore(), 'users/owner')); });
    if (user) await seed('users/owner', user);
    await assertFails(uploadBytes(ref(client('owner', { role: 'doctor' }), objectPath), new Uint8Array(1), { contentType: 'application/pdf' }));
  });
test('approved doctor cannot upload ordinary evidence', async () => {
  await seed('users/owner', identity({ verificationStatus: 'approved' })); await assertFails(upload());
});
test('cross-doctor create/read denied', async () => {
  await seed('users/other', identity({ uid: 'other' })); await assertFails(upload(objectPath, 1, 'application/pdf', 'other'));
  await upload(); await assertFails(getBytes(ref(client('other'), objectPath)));
});
test.each(['doctorCredentials/owner/wrong/document', 'doctorCredentials/owner/slot-id/filename.pdf', 'doctorCredentials/owner/slot-id/document/extra',
  'doctorCredentials/other/slot-id/document', 'other/owner/slot-id/document'])('wrong path %s denied', async path => { await assertFails(upload(path)); });
test('missing metadata denied', async () => {
  await env.withSecurityRulesDisabled(async context => { await deleteDoc(doc(context.firestore(), 'doctorCredentials/slot-id')); });
  await assertFails(upload());
});
test.each([{ doctorUid: 'other' }, { storagePath: 'wrong' }, { credentialId: 'wrong' }, { state: 'ready' }, { state: 'attached' },
  { state: 'invalid' }, { expiresAt: Timestamp.fromMillis(1) }, { unknown: true }, { category: 'other' }, { generation: '123' },
  { contentType: 'text/plain' }, { sizeBytes: 0 }, { schemaVersion: 2 }])('invalid slot %# denied', async extra => {
  await seed('doctorCredentials/slot-id', slot(extra)); await assertFails(upload());
});
test.each(['text/plain', 'image/gif', 'image/jpeg'])('unsupported or mismatching MIME %s denied', async type => { await assertFails(upload(objectPath, 1, type)); });
test('zero and mismatching sizes denied', async () => { await assertFails(upload(objectPath, 0)); await assertFails(upload(objectPath, 2)); });
test('exact 1 byte minimum and 5 MiB maximum accepted; over-limit denied', async () => {
  await assertSucceeds(upload()); await clearDemoBucket();
  await seed('doctorCredentials/slot-id', slot({ sizeBytes: 5242880 })); await assertSucceeds(upload(objectPath, 5242880));
  await clearDemoBucket(); await assertFails(upload(objectPath, 5242881));
});
test('overwrite, delete, metadata modification and listing denied; owner read allowed', async () => {
  await upload(); const object = ref(client(), objectPath);
  await assertSucceeds(getBytes(object)); await assertFails(upload()); await assertFails(deleteObject(object));
  await assertFails(updateMetadata(object, { customMetadata: { workflow: 'ready' } }));
  await assertFails(listAll(ref(client(), 'doctorCredentials/owner')));
});
test('client metadata injection denied on create', async () => {
  await assertFails(uploadBytes(ref(client(), objectPath), new Uint8Array(1), { contentType: 'application/pdf', customMetadata: { generation: 'spoof' } }));
});
test('guest read/upload denied', async () => {
  const object = ref(env.unauthenticatedContext().storage('gs://' + bucketName), objectPath);
  await assertFails(uploadBytes(object, new Uint8Array(1), { contentType: 'application/pdf' }));
  await upload(); await assertFails(getBytes(object));
});
function handlers() {
  return createCredentialHandlers(createCredentialStore(db, db.collection('doctorCredentials') as CollectionReference<DoctorCredentialRecord>, bucket));
}
test('real prepare -> SDK upload -> finalize -> concurrent retry uses SHA-256 of bytes', async () => {
  const service = handlers(), bytes = new Uint8Array([65, 66, 67]);
  const prepared = await service.prepare({ auth: { uid: 'owner' }, data: { category: 'medical_license', contentType: 'application/pdf', sizeBytes: bytes.length } });
  expect(prepared.credentialId).toMatch(/^[a-f0-9-]{36}$/);
  await assertSucceeds(uploadBytes(ref(client(), prepared.storagePath), bytes, { contentType: 'application/pdf' }));
  const request = { auth: { uid: 'owner' }, data: { credentialId: prepared.credentialId } };
  const [first, second] = await Promise.all([service.finalize(request), service.finalize(request)]);
  expect(first).toEqual(second); expect(first.state).toBe('ready');
  expect(first.checksum).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(await service.finalize(request)).toEqual(first);
  await assertSucceeds(getBytes(ref(client(), prepared.storagePath)));
});
test('missing stored binary leaves prepared metadata intact', async () => {
  await expect(handlers().finalize({ auth: { uid: 'owner' }, data: { credentialId: 'slot-id' } })).rejects.toMatchObject({ code: 'failed-precondition' });
  expect((await db.doc('doctorCredentials/slot-id').get()).data()?.state).toBe('prepared');
});
test('privileged object replacement is detected on ready retry and owner read', async () => {
  await upload(); const service = handlers(), request = { auth: { uid: 'owner' }, data: { credentialId: 'slot-id' } };
  const ready = await service.finalize(request);
  await bucket.file(objectPath).save(Buffer.from('B'), { resumable: false, contentType: 'application/pdf' });
  await expect(service.finalize(request)).rejects.toMatchObject({ code: 'failed-precondition' });
  expect((await db.doc('doctorCredentials/slot-id').get()).data()?.checksum).toBe(ready.checksum);
  await assertFails(getBytes(ref(client(), objectPath)));
});

function administrator(extra = {}) {
  const { verificationStatus, ...data } = identity({ uid: 'admin', role: 'administrator', ...extra }); return data;
}
async function readyEvidence() {
  const service = handlers();
  const prepared = await service.prepare({ auth: { uid: 'owner' }, data: { category: 'medical_license', contentType: 'application/pdf', sizeBytes: 3 } });
  await uploadBytes(ref(client(), prepared.storagePath), new Uint8Array([65, 66, 67]), { contentType: 'application/pdf' });
  await service.finalize({ auth: { uid: 'owner' }, data: { credentialId: prepared.credentialId } }); return prepared;
}
async function workflowSetup() {
  const time = Timestamp.now();
  await seed('doctorProfiles/owner', { uid: 'owner', professionalName: 'Doctor', specialty: 'Medicine', registrationNumber: 'REG', issuingAuthority: 'Board',
    phoneNumber: '123', revision: 1, activeRequestId: null, approvedRequestId: null, schemaVersion: 1, createdAt: time, updatedAt: time });
  await seed('users/admin', administrator());
  const evidence = await readyEvidence();
  const workflow = createVerificationHandlers(createVerificationStore(db, bucket));
  const submitInput = { auth: { uid: 'owner' }, data: { credentialIds: [evidence.credentialId], expectedRevision: 1 } };
  return { evidence, workflow, submitInput };
}
test('real concurrent submissions and competing reviews produce one request and one decision', async () => {
  const { workflow, submitInput, evidence } = await workflowSetup();
  const [first, second] = await Promise.all([workflow.submit(submitInput), workflow.submit(submitInput)]);
  expect(first).toEqual(second); expect(await workflow.submit(submitInput)).toEqual(first);
  expect((await db.collection('verificationRequests').get()).size).toBe(1);
  await seed('users/second', administrator({ uid: 'second' }));
  const decision = { requestId: first.requestId, expectedRevision: 1, decision: 'approved' };
  const reviews = await Promise.allSettled(['admin', 'second'].map(uid => workflow.review({ auth: { uid }, data: decision })));
  expect(reviews.filter(value => value.status === 'fulfilled')).toHaveLength(1);
  const winner = reviews[0].status === 'fulfilled' ? 'admin' : 'second';
  await expect(workflow.review({ auth: { uid: winner }, data: decision })).resolves.toMatchObject({ state: 'approved' });
  const events = await db.collection('verificationAudit').get(); expect(events.size).toBe(2);
  const publicProfile = (await db.doc('doctorPublicProfiles/owner').get()).data()!;
  expect(Object.keys(publicProfile).sort()).toEqual(['uid', 'professionalName', 'specialty', 'approvedRevision', 'approvedRequestId', 'schemaVersion', 'publishedAt', 'updatedAt'].sort());
  expect(publicProfile.publishedAt).toBeInstanceOf(AdminTimestamp);
  expect((await db.doc('verificationRequests/' + first.requestId).get()).data()).toMatchObject({ reviewerUid: winner, state: 'approved' });
  await assertSucceeds(getBytes(ref(client('admin'), evidence.storagePath)));
  await assertSucceeds(getBytes(ref(client(), evidence.storagePath)));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('admin').firestore(), 'doctorCredentials/' + evidence.credentialId)));
});
test.each(['disabled', 'claim-only', 'patient', 'other-doctor'])('%s cannot read attached evidence', async kind => {
  const { workflow, submitInput, evidence } = await workflowSetup(); await workflow.submit(submitInput);
  if (kind === 'disabled') await seed('users/admin', administrator({ status: 'disabled' }));
  if (kind === 'claim-only') await db.doc('users/admin').delete();
  if (kind === 'patient') await seed('users/admin', administrator({ role: 'patient' }));
  if (kind === 'other-doctor') await seed('users/admin', identity({ uid: 'admin' }));
  await assertFails(getBytes(ref(client('admin', { role: 'administrator' }), evidence.storagePath)));
});
test('administrator cannot read ready evidence before attachment', async () => {
  const { evidence } = await workflowSetup(); await assertFails(getBytes(ref(client('admin'), evidence.storagePath)));
});
test('missing binary blocks approval; rejection permits newer revision and new evidence resubmission', async () => {
  const { workflow, submitInput, evidence } = await workflowSetup(); const submitted = await workflow.submit(submitInput);
  await bucket.file(evidence.storagePath).delete();
  const data = { requestId: submitted.requestId, expectedRevision: 1, decision: 'approved' };
  await expect(workflow.review({ auth: { uid: 'admin' }, data })).rejects.toMatchObject({ code: 'failed-precondition' });
  expect((await db.collection('verificationAudit').get()).size).toBe(1);
  await workflow.review({ auth: { uid: 'admin' }, data: { ...data, decision: 'rejected', rejectionReason: 'Evidence missing' } });
  expect((await db.doc('doctorPublicProfiles/owner').get()).exists).toBe(false);
  await db.doc('doctorProfiles/owner').update({ revision: 2, specialty: 'Surgery', updatedAt: AdminTimestamp.now() });
  const replacement = await readyEvidence();
  const next = await workflow.submit({ auth: { uid: 'owner' }, data: { credentialIds: [replacement.credentialId], expectedRevision: 2 } });
  expect((await db.doc('verificationRequests/' + next.requestId).get()).data()).toMatchObject({ previousRequestId: submitted.requestId, state: 'submitted', profileRevision: 2 });
  expect((await db.doc('verificationRequests/' + submitted.requestId).get()).data()?.state).toBe('rejected');
});
test('real workflow transaction exception rolls back staged identity and public writes', async () => {
  const store = createVerificationStore(db, bucket);
  await expect(store.transact(async tx => {
    const original = await tx.identity('owner') as any;
    tx.saveIdentity({ ...original, verificationStatus: 'approved' });
    tx.publish('owner', { uid: 'owner', professionalName: 'Doctor', specialty: 'Medicine', approvedRevision: 1,
      approvedRequestId: 'never-committed', schemaVersion: 1, publishedAt: AdminTimestamp.now(), updatedAt: AdminTimestamp.now() });
    throw new Error('abort test');
  })).rejects.toThrow('abort test');
  expect((await db.doc('users/owner').get()).data()?.verificationStatus).toBe('pending');
  expect((await db.doc('doctorPublicProfiles/owner').get()).exists).toBe(false);
});
