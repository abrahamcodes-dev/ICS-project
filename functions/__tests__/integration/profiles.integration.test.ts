import { randomUUID, createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, serverTimestamp, terminate } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getStorage as adminStorage } from 'firebase-admin/storage';

const projectId = 'demo-calladoc-integration';
const endpoints = { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9105', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8105',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9205' };
// Execute before initializing ANY SDK. An absent/mismatched emulator must fail closed.
for (const [key, value] of Object.entries(endpoints)) if (process.env[key] !== value) throw new Error('Local emulator safety assertion failed: ' + key);
if (process.env.GCLOUD_PROJECT !== projectId || process.versions.node.split('.')[0] !== '22') throw new Error('Demo project and Node 22 required.');
const configuration = JSON.parse(readFileSync(resolve(__dirname, '../../firebase.integration-test.json'), 'utf8'));
for (const [name, port] of Object.entries({ auth: 9105, functions: 5105, firestore: 8105, storage: 9205 })) {
  if (configuration.emulators[name].host !== '127.0.0.1' || configuration.emulators[name].port !== port) throw new Error('Unsafe emulator configuration.');
}
const bucketName = projectId + '.appspot.com';
const trustedApp = initializeAdmin({ projectId, storageBucket: bucketName }, 'integration-inspection');
const db = adminFirestore(trustedApp), authAdmin = adminAuth(trustedApp), bucket = adminStorage(trustedApp).bucket();
const clients: FirebaseApp[] = [];
const professional = { professionalName: 'Synthetic Doctor', specialty: 'Synthetic Specialty',
  registrationNumber: 'TEST-ONLY-001', issuingAuthority: 'Synthetic Test Authority' };
const bytes = new TextEncoder().encode('%PDF-1.4\nSynthetic emulator fixture; not a real credential.\n%%EOF');
const declaration = { category: 'medical_license', contentType: 'application/pdf', sizeBytes: bytes.length };
const publicFields = ['uid', 'professionalName', 'specialty', 'approvedRevision', 'approvedRequestId', 'schemaVersion', 'publishedAt', 'updatedAt'].sort();

function client() {
  const app = initializeApp({ projectId, apiKey: 'demo-integration-key', authDomain: projectId + '.firebaseapp.com', storageBucket: bucketName }, randomUUID());
  clients.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9105', { disableWarnings: true });
  const firestore = getFirestore(app); connectFirestoreEmulator(firestore, '127.0.0.1', 8105);
  const storage = getStorage(app); connectStorageEmulator(storage, '127.0.0.1', 9205);
  const functions = getFunctions(app, 'us-central1'); connectFunctionsEmulator(functions, '127.0.0.1', 5105);
  return { app, auth, firestore, storage, functions, uid: '' };
}
type Client = ReturnType<typeof client>;
async function account(role?: 'patient' | 'doctor') {
  const c = client();
  const result = await createUserWithEmailAndPassword(c.auth, randomUUID() + '@example.test', randomUUID());
  c.uid = result.user.uid;
  if (role) await call(c, 'completeRegistration', { role, fullName: 'Synthetic Integration User' });
  return c;
}
async function administrator() {
  const c = await account(); const now = new Date().toISOString();
  // Trusted fixture only: never expose administrator provisioning as a callable.
  await db.doc('users/' + c.uid).create({ uid: c.uid, email: c.auth.currentUser!.email, fullName: 'Synthetic Administrator',
    role: 'administrator', status: 'active', schemaVersion: 1, createdAt: now, updatedAt: now });
  return c;
}
async function call(c: Client, name: string, data: unknown): Promise<any> { return (await httpsCallable(c.functions, name)(data)).data; }
async function read(path: string): Promise<any> { return (await db.doc(path).get()).data(); }
async function events(requestId: string) { return (await db.collection('verificationAudit').where('requestId', '==', requestId).get()).docs.map(d => d.data()); }
async function requestCount(uid: string) { return (await db.collection('verificationRequests').where('doctorUid', '==', uid).get()).size; }
async function ready(c: Client) {
  const slot = await call(c, 'prepareDoctorCredential', declaration);
  await uploadBytes(ref(c.storage, slot.storagePath), bytes, { contentType: declaration.contentType });
  const finalized = await call(c, 'finalizeDoctorCredential', { credentialId: slot.credentialId });
  expect(finalized.state).toBe('ready');
  expect(finalized.checksum).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(finalized.generation).toMatch(/^\d+$/);
  return finalized;
}
async function draft() {
  const doctor = await account('doctor');
  const saved = await call(doctor, 'saveDoctorProfileDraft', professional);
  expect(saved.revision).toBe(1);
  return doctor;
}
async function submitted() {
  const doctor = await draft(), credential = await ready(doctor);
  const submission = await call(doctor, 'submitDoctorVerification', { credentialIds: [credential.credentialId], expectedRevision: 1 });
  return { doctor, credential, submission };
}
async function decide(admin: Client, requestId: string, expectedRevision = 1, decision = 'approved', rejectionReason?: string) {
  return call(admin, 'reviewDoctorVerification', { requestId, expectedRevision, decision, ...(rejectionReason === undefined ? {} : { rejectionReason }) });
}
async function snapshot(doctor: Client, requestId: string) {
  return Promise.all(['users/' + doctor.uid, 'doctorProfiles/' + doctor.uid, 'verificationRequests/' + requestId,
    'doctorPublicProfiles/' + doctor.uid].map(read));
}
async function denied(work: Promise<unknown>, code: string) { await expect(work).rejects.toMatchObject({ code }); }

afterAll(async () => {
  for (const app of clients) { await terminate(getFirestore(app)); await deleteApp(app); }
  await db.terminate(); await deleteAdmin(trustedApp);
});

test('actual Auth registration through all six callable exports reaches first-time approval and minimal public projection', async () => {
  const doctor = await draft();
  expect(await read('users/' + doctor.uid)).toMatchObject({ uid: doctor.uid, role: 'doctor', status: 'active', verificationStatus: 'pending' });
  expect(await read('doctorPublicProfiles/' + doctor.uid)).toBeUndefined();
  const credential = await ready(doctor);
  const input = { credentialIds: [credential.credentialId], expectedRevision: 1 };
  const submission = await call(doctor, 'submitDoctorVerification', input);
  const immutable = await read('verificationRequests/' + submission.requestId);
  expect(immutable.professional).toEqual(professional);
  expect(immutable.reviewerUid).toBeNull();
  expect(await read('doctorProfiles/' + doctor.uid)).toMatchObject({ revision: 1, activeRequestId: submission.requestId });
  expect(await read('users/' + doctor.uid)).toMatchObject({ verificationStatus: 'pending' });
  expect(await read('doctorCredentials/' + credential.credentialId)).toMatchObject({ state: 'attached', requestId: submission.requestId });
  const admin = await administrator(); await decide(admin, submission.requestId);
  const [identity, profile, request, published] = await snapshot(doctor, submission.requestId);
  expect(identity.verificationStatus).toBe('approved');
  expect(profile).toMatchObject({ revision: 1, activeRequestId: null, approvedRequestId: submission.requestId });
  expect(request).toMatchObject({ state: 'approved', reviewerUid: admin.uid, professional: immutable.professional, credentials: immutable.credentials });
  expect(request.reviewedAt.toMillis()).toBeGreaterThanOrEqual(request.submittedAt.toMillis());
  expect(Object.keys(published).sort()).toEqual(publicFields);
  expect(published).toMatchObject({ professionalName: immutable.professional.professionalName, specialty: immutable.professional.specialty, approvedRevision: 1 });
  expect((await events(submission.requestId)).map(e => e.action).sort()).toEqual(['approved', 'submitted']);
  const patient = await account('patient'), otherDoctor = await account('doctor');
  for (const reader of [patient, otherDoctor, admin]) expect((await getDoc(doc(reader.firestore, 'doctorPublicProfiles', doctor.uid))).exists()).toBe(true);
  await denied(getDoc(doc(client().firestore, 'doctorPublicProfiles', doctor.uid)), 'permission-denied');
  await denied(getDoc(doc(patient.firestore, 'verificationAudit', (await events(submission.requestId))[0].eventId)), 'permission-denied');
});

test('rejection, newer draft, fresh evidence, resubmission and approval preserve immutable history and audit', async () => {
  const { doctor, credential, submission } = await submitted(), admin = await administrator();
  await decide(admin, submission.requestId, 1, 'rejected', 'Please provide corrected synthetic evidence.');
  expect(await read('users/' + doctor.uid)).toMatchObject({ verificationStatus: 'rejected' });
  expect(await read('doctorProfiles/' + doctor.uid)).toMatchObject({ activeRequestId: null });
  expect(await read('doctorPublicProfiles/' + doctor.uid)).toBeUndefined();
  const oldRequest = await read('verificationRequests/' + submission.requestId), oldEvidence = await read('doctorCredentials/' + credential.credentialId);
  const oldEvents = await events(submission.requestId);
  const revised = { ...professional, specialty: 'Revised Synthetic Specialty' };
  expect((await call(doctor, 'saveDoctorProfileDraft', revised)).revision).toBe(2);
  const fresh = await ready(doctor);
  const next = await call(doctor, 'submitDoctorVerification', { credentialIds: [fresh.credentialId], expectedRevision: 2 });
  expect(next.requestId).not.toBe(submission.requestId);
  expect(await read('verificationRequests/' + next.requestId)).toMatchObject({ previousRequestId: submission.requestId, profileRevision: 2, professional: revised });
  expect(await read('users/' + doctor.uid)).toMatchObject({ verificationStatus: 'pending' });
  await decide(admin, next.requestId, 2);
  expect(await read('users/' + doctor.uid)).toMatchObject({ verificationStatus: 'approved' });
  expect(await read('verificationRequests/' + next.requestId)).toMatchObject({ state: 'approved' });
  expect(await read('doctorPublicProfiles/' + doctor.uid)).toMatchObject({ specialty: revised.specialty, approvedRevision: 2, approvedRequestId: next.requestId });
  expect(await read('verificationRequests/' + submission.requestId)).toEqual(oldRequest);
  expect(await read('doctorCredentials/' + credential.credentialId)).toEqual(oldEvidence);
  expect(await events(submission.requestId)).toEqual(oldEvents);
  expect(oldEvents.map(e => e.action).sort()).toEqual(['rejected', 'submitted']);
  expect((await events(next.requestId)).map(e => e.action).sort()).toEqual(['approved', 'submitted']);
});

test('patient profile and optional health replacement remain owner-only even after doctor approval', async () => {
  const patient = await account('patient'), other = await account('patient'), pending = await account('doctor'), admin = await administrator();
  const { doctor, submission } = await submitted(); await decide(admin, submission.requestId);
  for (const collection of ['patientProfiles', 'patientHealthProfiles']) {
    const target = doc(patient.firestore, collection, patient.uid);
    const fields = collection === 'patientProfiles' ? { displayName: 'Synthetic Patient' } : { allergies: ['Synthetic test entry'], currentMedications: [] };
    await setDoc(target, { uid: patient.uid, schemaVersion: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...fields });
    expect((await getDoc(target)).data()).toMatchObject(fields);
    const createdAt = (await getDoc(target)).data()!.createdAt;
    await updateDoc(target, { ...fields, updatedAt: serverTimestamp() });
    await setDoc(target, { uid: patient.uid, schemaVersion: 1, createdAt, updatedAt: serverTimestamp() });
    expect(Object.keys((await getDoc(target)).data()!).sort()).toEqual(['uid', 'schemaVersion', 'createdAt', 'updatedAt'].sort());
    for (const reader of [other, pending, doctor, admin]) await denied(getDoc(doc(reader.firestore, collection, patient.uid)), 'permission-denied');
  }
  await denied(updateDoc(doc(patient.firestore, 'users', patient.uid), { role: 'administrator' }), 'permission-denied');
});

test('actual callable and Storage authorization rejects wrong roles, impersonation, claims and disabled identities', async () => {
  const doctor = await draft(), patient = await account('patient'), admin = await administrator(), fake = await account('patient');
  const prepared = await call(doctor, 'prepareDoctorCredential', declaration);
  for (const actor of [patient, admin]) {
    await denied(call(actor, 'saveDoctorProfileDraft', professional), 'functions/permission-denied');
    await denied(call(actor, 'prepareDoctorCredential', declaration), 'functions/permission-denied');
    await denied(call(actor, 'submitDoctorVerification', { credentialIds: [prepared.credentialId], expectedRevision: 1 }), 'functions/permission-denied');
    await denied(uploadBytes(ref(actor.storage, prepared.storagePath), bytes, { contentType: declaration.contentType }), 'storage/unauthorized');
  }
  await denied(call(admin, 'saveDoctorProfileDraft', { ...professional, uid: doctor.uid }), 'functions/invalid-argument');
  await authAdmin.setCustomUserClaims(fake.uid, { role: 'administrator', admin: true });
  await fake.auth.currentUser!.getIdToken(true);
  const target = await submitted();
  for (const actor of [doctor, patient, fake]) await denied(decide(actor, target.submission.requestId), 'functions/permission-denied');
  await db.doc('users/' + doctor.uid).update({ status: 'disabled' });
  await denied(call(doctor, 'saveDoctorProfileDraft', professional), 'functions/permission-denied');
  await denied(call(doctor, 'prepareDoctorCredential', declaration), 'functions/permission-denied');
  await denied(call(doctor, 'submitDoctorVerification', { credentialIds: [prepared.credentialId], expectedRevision: 1 }), 'functions/permission-denied');
  await denied(uploadBytes(ref(doctor.storage, prepared.storagePath), bytes, { contentType: declaration.contentType }), 'storage/unauthorized');
  await denied(call(client(), 'completeRegistration', { role: 'doctor', fullName: 'Synthetic User' }), 'functions/unauthenticated');
});

test('submitted and approved professional fields lock while approved private phone replacement preserves publication', async () => {
  const { doctor, submission } = await submitted(), admin = await administrator();
  const original = await read('verificationRequests/' + submission.requestId);
  await denied(call(doctor, 'saveDoctorProfileDraft', { ...professional, specialty: 'Changed' }), 'functions/failed-precondition');
  expect(await read('verificationRequests/' + submission.requestId)).toEqual(original);
  await decide(admin, submission.requestId);
  const published = await read('doctorPublicProfiles/' + doctor.uid);
  for (const key of Object.keys(professional)) await denied(call(doctor, 'saveDoctorProfileDraft', { [key]: 'Changed' }), 'functions/failed-precondition');
  await call(doctor, 'saveDoctorProfileDraft', { phoneNumber: '+1 202 555 0100' });
  expect(await read('doctorProfiles/' + doctor.uid)).toMatchObject({ phoneNumber: '+1 202 555 0100', revision: 1 });
  await call(doctor, 'saveDoctorProfileDraft', {});
  expect((await read('doctorProfiles/' + doctor.uid)).phoneNumber).toBeUndefined();
  expect((await read('doctorProfiles/' + doctor.uid)).revision).toBe(1);
  expect(await read('doctorPublicProfiles/' + doctor.uid)).toEqual(published);
});

test('attached evidence cannot be overwritten/deleted or read by unrelated doctor/patient', async () => {
  const { doctor, credential, submission } = await submitted(), other = await account('doctor'), patient = await account('patient'), admin = await administrator();
  const before = await read('verificationRequests/' + submission.requestId);
  await denied(uploadBytes(ref(doctor.storage, credential.storagePath), bytes, { contentType: declaration.contentType }), 'storage/unauthorized');
  await denied(deleteObject(ref(doctor.storage, credential.storagePath)), 'storage/unauthorized');
  for (const actor of [other, patient]) {
    await denied(getBytes(ref(actor.storage, credential.storagePath)), 'storage/unauthorized');
    await denied(uploadBytes(ref(actor.storage, credential.storagePath), bytes, { contentType: declaration.contentType }), 'storage/unauthorized');
  }
  expect((await getBytes(ref(admin.storage, credential.storagePath))).byteLength).toBe(bytes.length);
  expect((await getBytes(ref(doctor.storage, credential.storagePath))).byteLength).toBe(bytes.length);
  expect((await read('verificationRequests/' + submission.requestId)).credentials).toEqual(before.credentials);
});

test('callable retries do not increment revisions or duplicate requests, attachments or decision events', async () => {
  const doctor = await draft(), admin = await administrator();
  expect(await call(doctor, 'saveDoctorProfileDraft', professional)).toEqual({ revision: 1, changed: false });
  const credential = await ready(doctor);
  expect(await call(doctor, 'finalizeDoctorCredential', { credentialId: credential.credentialId })).toEqual(credential);
  const input = { credentialIds: [credential.credentialId], expectedRevision: 1 };
  const first = await call(doctor, 'submitDoctorVerification', input);
  // Simulate a lost response by sending the identical payload without a client operation ID.
  expect(await call(doctor, 'submitDoctorVerification', input)).toEqual(first);
  expect(await requestCount(doctor.uid)).toBe(1);
  const reviewed = await decide(admin, first.requestId);
  const state = await snapshot(doctor, first.requestId);
  expect(await decide(admin, first.requestId)).toEqual(reviewed);
  expect(await snapshot(doctor, first.requestId)).toEqual(state);
  expect(await events(first.requestId)).toHaveLength(2);
  expect((await read('doctorCredentials/' + credential.credentialId)).requestId).toBe(first.requestId);
});

test('simultaneous callable draft saves, submissions and conflicting reviews preserve transaction invariants', async () => {
  const doctor = await account('doctor'), admin = await administrator(), secondAdmin = await administrator();
  const saves = await Promise.all([call(doctor, 'saveDoctorProfileDraft', professional), call(doctor, 'saveDoctorProfileDraft', professional)]);
  expect(saves.map(s => s.revision)).toEqual([1, 1]);
  expect(saves.filter(s => s.changed)).toHaveLength(1);
  const credential = await ready(doctor), input = { credentialIds: [credential.credentialId], expectedRevision: 1 };
  const submissions = await Promise.all([call(doctor, 'submitDoctorVerification', input), call(doctor, 'submitDoctorVerification', input)]);
  expect(submissions[0]).toEqual(submissions[1]); expect(await requestCount(doctor.uid)).toBe(1);
  const requestId = submissions[0].requestId;
  const decisions = await Promise.allSettled([decide(admin, requestId), decide(secondAdmin, requestId, 1, 'rejected', 'Synthetic concurrent rejection')]);
  expect(decisions.filter(d => d.status === 'fulfilled')).toHaveLength(1);
  expect(decisions.filter(d => d.status === 'rejected')).toHaveLength(1);
  const request = await read('verificationRequests/' + requestId);
  expect(['approved', 'rejected']).toContain(request.state);
  expect((await read('users/' + doctor.uid)).verificationStatus).toBe(request.state);
  expect((await read('doctorProfiles/' + doctor.uid)).activeRequestId).toBeNull();
  expect((await events(requestId)).map(e => e.action).sort()).toEqual(['submitted', request.state].sort());
});

test('missing evidence and stale revision submission fail without attachment, active request or audit', async () => {
  const doctor = await draft(), credential = await ready(doctor);
  const beforeProfile = await read('doctorProfiles/' + doctor.uid), beforeEvidence = await read('doctorCredentials/' + credential.credentialId);
  await denied(call(doctor, 'submitDoctorVerification', { credentialIds: [credential.credentialId], expectedRevision: 2 }), 'functions/failed-precondition');
  await bucket.file(credential.storagePath).delete();
  await denied(call(doctor, 'submitDoctorVerification', { credentialIds: [credential.credentialId], expectedRevision: 1 }), 'functions/failed-precondition');
  expect(await read('doctorProfiles/' + doctor.uid)).toEqual(beforeProfile);
  expect(await read('doctorCredentials/' + credential.credentialId)).toEqual(beforeEvidence);
  expect(await requestCount(doctor.uid)).toBe(0);
  expect((await db.collection('verificationAudit').where('doctorUid', '==', doctor.uid).get()).empty).toBe(true);
});

test('invalid reason, stale review, disabled administrator and missing approval evidence leave no partial decision', async () => {
  const { doctor, credential, submission } = await submitted(), admin = await administrator();
  const before = await snapshot(doctor, submission.requestId), audit = await events(submission.requestId);
  await denied(decide(admin, submission.requestId, 1, 'rejected', '  '), 'functions/invalid-argument');
  await denied(decide(admin, submission.requestId, 2), 'functions/failed-precondition');
  await db.doc('users/' + admin.uid).update({ status: 'disabled' });
  await denied(decide(admin, submission.requestId), 'functions/permission-denied');
  await db.doc('users/' + admin.uid).update({ status: 'active' });
  await bucket.file(credential.storagePath).delete();
  await denied(decide(admin, submission.requestId), 'functions/failed-precondition');
  expect(await snapshot(doctor, submission.requestId)).toEqual(before);
  expect(await events(submission.requestId)).toEqual(audit);
});

test('declared index matches actual latest-request query and legacy callable URLs are unavailable', async () => {
  const indexes = JSON.parse(readFileSync(resolve(__dirname, '../../firestore.indexes.json'), 'utf8'));
  expect(indexes.indexes).toContainEqual({ collectionGroup: 'verificationRequests', queryScope: 'COLLECTION',
    fields: [{ fieldPath: 'doctorUid', order: 'ASCENDING' }, { fieldPath: 'profileRevision', order: 'DESCENDING' }] });
  await db.collection('verificationRequests').where('doctorUid', '==', 'synthetic-index-probe').orderBy('profileRevision', 'desc').limit(1).get();
  for (const name of ['onUserCreate', 'submitCredentials', 'reviewVerification', 'approveDoctor', 'rejectDoctor']) {
    const response = await fetch('http://127.0.0.1:5105/' + projectId + '/us-central1/' + name, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} }) });
    expect(response.status).toBe(404);
  }
});
