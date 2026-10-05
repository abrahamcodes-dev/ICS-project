import { randomUUID, createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getFirestore, connectFirestoreEmulator, terminate } from 'firebase/firestore';
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getFirestore as adminFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth as adminAuth } from 'firebase-admin/auth';

export const projectId = 'demo-calladoc-integration';
// Guard before constructing any SDK instance. No production fallback or clock hook.
for (const [name, value] of Object.entries({ FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9105',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8105', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9205', GCLOUD_PROJECT: projectId })) {
  if (process.env[name] !== value) throw new Error('Scheduling integration requires local demo emulators: ' + name);
}
if (process.versions.node.split('.')[0] !== '22') throw new Error('Scheduling integration requires Node 22.');
const config = JSON.parse(readFileSync(resolve(__dirname, '../../firebase.integration-test.json'), 'utf8'));
for (const [name, port] of Object.entries({ auth: 9105, functions: 5105, firestore: 8105, storage: 9205 })) {
  if (config.emulators[name]?.host !== '127.0.0.1' || config.emulators[name]?.port !== port) throw new Error('Unsafe integration endpoint.');
}
const trusted = initializeAdmin({ projectId }, 'scheduling-inspection');
export const db = adminFirestore(trusted);
const authAdmin = adminAuth(trusted), apps: FirebaseApp[] = [];
export const halfHour = 1800000;
export const hash = (...parts: (string | number)[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const stamp = (ms: number) => Timestamp.fromMillis(ms);
export const professional = { professionalName: 'Synthetic Scheduling Doctor', specialty: 'Synthetic Medicine',
  registrationNumber: 'SYNTHETIC-ONLY', issuingAuthority: 'Synthetic Authority' };

function client() {
  const app = initializeApp({ projectId, apiKey: 'demo-scheduling-key', authDomain: projectId + '.firebaseapp.com' }, randomUUID());
  apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9105', { disableWarnings: true });
  const firestore = getFirestore(app); connectFirestoreEmulator(firestore, '127.0.0.1', 8105);
  const functions = getFunctions(app, 'us-central1'); connectFunctionsEmulator(functions, '127.0.0.1', 5105);
  return { app, auth, firestore, functions, uid: '' };
}
export type Client = ReturnType<typeof client>;
export const actors: Record<string, Client> = {};
const roles: Record<string, string> = { patientA: 'patient', patientB: 'patient', doctorA: 'doctor', doctorB: 'doctor',
  disabledPatient: 'patient', disabledDoctor: 'doctor', pendingDoctor: 'doctor', rejectedDoctor: 'doctor', administrator: 'administrator' };
export async function initializeFixtures() {
  for (const name of [...Object.keys(roles), 'claimOnly']) {
    const c = client();
    c.uid = (await createUserWithEmailAndPassword(c.auth, randomUUID() + '@example.test', randomUUID())).user.uid;
    actors[name] = c;
  }
  actors.guest = client();
  await authAdmin.setCustomUserClaims(actors.claimOnly.uid, { role: 'administrator', admin: true });
  // Resolve token acquisition before race tests so both calls can start together.
  await Promise.all(Object.values(actors).filter(c => c.uid).map(c => c.auth.currentUser!.getIdToken(true)));
}
export async function cleanupFixtures() {
  for (const app of apps) { await terminate(getFirestore(app)); await deleteApp(app); }
  await db.terminate(); await deleteAdmin(trusted);
}
export async function resetFixtures() {
  const cleared = await fetch('http://127.0.0.1:8105/emulator/v1/projects/' + projectId + '/databases/(default)/documents', { method: 'DELETE' });
  if (!cleared.ok) throw new Error('Local fixture reset failed.');
  const batch = db.batch(), iso = new Date(Date.now() - 86400000).toISOString(), time = stamp(Date.now() - 86400000);
  for (const [name, role] of Object.entries(roles)) {
    const c = actors[name];
    batch.set(db.doc('users/' + c.uid), { uid: c.uid, email: c.auth.currentUser!.email, fullName: 'Synthetic ' + name,
      role, status: name.startsWith('disabled') ? 'disabled' : 'active', schemaVersion: 1, createdAt: iso, updatedAt: iso,
      ...(role === 'doctor' ? { verificationStatus: name === 'pendingDoctor' ? 'pending' : name === 'rejectedDoctor' ? 'rejected' : 'approved' } : {}) });
    if (role !== 'doctor') continue;
    const requestId = 'synthetic-approved-' + c.uid;
    batch.set(db.doc('doctorProfiles/' + c.uid), { uid: c.uid, ...professional, revision: 1, activeRequestId: null,
      approvedRequestId: requestId, schemaVersion: 1, createdAt: time, updatedAt: time });
    batch.set(db.doc('doctorPublicProfiles/' + c.uid), { uid: c.uid, professionalName: professional.professionalName,
      specialty: professional.specialty, approvedRevision: 1, approvedRequestId: requestId, schemaVersion: 1, publishedAt: time, updatedAt: time });
    batch.set(db.doc('verificationRequests/' + requestId), { requestId, doctorUid: c.uid, profileRevision: 1, professional,
      credentials: [{ credentialId: 'synthetic-credential-' + c.uid, category: 'medical_license', generation: '1', checksum: 'a'.repeat(64) }],
      previousRequestId: null, state: 'approved', reviewedAt: time, reviewerUid: actors.administrator.uid, submittedAt: time,
      schemaVersion: 1, createdAt: time, updatedAt: time });
  }
  await batch.commit();
}
export const tomorrowStart = () => Date.parse(dayOf(Date.now() + 86400000) + 'T10:00:00Z');
export async function call(c: Client, name: string, data: unknown): Promise<any> {
  return (await httpsCallable(c.functions, name, { timeout: 90000 })(data)).data;
}
export const availabilityInput = (start: number, expectedRevision = 0) => ({ utcDate: dayOf(start), timeZone: 'Africa/Nairobi',
  windows: [{ startAt: start, endAt: start + 2 * halfHour }], expectedRevision });
export const publish = (c: Client, start: number, expectedRevision = 0) => call(c, 'replaceDoctorAvailabilityDay', availabilityInput(start, expectedRevision));
export const intent = (doctor: Client, start: number) => ({ doctorId: doctor.uid, startAt: start, bookingRequestId: randomUUID() });
export const book = (patient: Client, data: ReturnType<typeof intent>) => call(patient, 'bookAppointment', data);
export const cancel = (c: Client, appointmentId: string, reason: string | null = null) => call(c, 'cancelAppointment', { appointmentId, reason });
export const outcome = (c: Client, appointmentId: string, decision = 'completed') => call(c, 'recordAppointmentOutcome', { appointmentId, outcome: decision });
export const discover = (c: Client, doctor: Client, start: number) => call(c, 'getAvailableAppointmentTimes', { doctorId: doctor.uid, fromDate: dayOf(start), days: 1 });
export const read = async (path: string): Promise<any> => (await db.doc(path).get()).data();
export async function denied(work: Promise<unknown>, code = 'functions/permission-denied') {
  await expect(work).rejects.toMatchObject({ code });
}
export async function state() {
  const result: Record<string, unknown> = {};
  for (const name of ['appointments', 'bookingLocks', 'doctorAvailability']) {
    result[name] = (await db.collection(name).get()).docs.map(d => ({ id: d.id, data: d.data() })).sort((a, b) => a.id.localeCompare(b.id));
  }
  return result;
}
export const locksFor = (value: any) => (['doctor', 'patient'] as const).map(resourceType => ({
  id: hash(resourceType, value[resourceType + 'Id'], value.startAt.toMillis()),
  data: { resourceType, resourceId: value[resourceType + 'Id'], appointmentId: value.appointmentId, startAt: value.startAt,
    endAt: value.endAt, schemaVersion: 1, createdAt: value.createdAt },
}));
export async function assertIntegrity() {
  const appointments = (await db.collection('appointments').get()).docs, locks = (await db.collection('bookingLocks').get()).docs;
  const expectedLocks = new Set<string>();
  for (const snapshot of appointments) {
    const value = snapshot.data();
    expect(value.appointmentId).toBe(snapshot.id);
    expect(Object.keys(value).sort()).toEqual(['appointmentId', 'patientId', 'doctorId', 'availabilityId', 'availabilityRevision',
      'startAt', 'endAt', 'doctorDisplay', 'status', 'cancellation', 'outcome', 'schemaVersion', 'createdAt', 'updatedAt'].sort());
    for (const field of ['startAt', 'endAt', 'createdAt', 'updatedAt']) expect(value[field]).toBeInstanceOf(Timestamp);
    expect(value.endAt.toMillis() - value.startAt.toMillis()).toBe(halfHour);
    expect(value.startAt.toMillis() % halfHour).toBe(0);
    if (value.status !== 'scheduled') {
      expect(locks.some(lock => lock.data().appointmentId === snapshot.id)).toBe(false);
      continue;
    }
    const available = await read('doctorAvailability/' + value.availabilityId);
    expect(available.doctorId).toBe(value.doctorId);
    expect(available.revision).toBeGreaterThanOrEqual(value.availabilityRevision);
    expect(available.windows.some((w: any) => w.startAt.toMillis() <= value.startAt.toMillis() && w.endAt.toMillis() >= value.endAt.toMillis())).toBe(true);
    for (const lock of locksFor(value)) {
      expect(expectedLocks.has(lock.id)).toBe(false); expectedLocks.add(lock.id);
      expect(await read('bookingLocks/' + lock.id)).toEqual(lock.data);
    }
  }
  expect(locks.map(d => d.id).sort()).toEqual([...expectedLocks].sort());
}
/** Historical fixtures avoid waiting 30 minutes or altering the deployed server clock. */
export async function historical(patient: Client, doctor: Client) {
  const start = Math.floor(Date.now() / halfHour) * halfHour - 2 * halfHour, createdAt = stamp(start - halfHour);
  const input = intent(doctor, start), appointmentId = hash(patient.uid, input.bookingRequestId), availabilityId = hash(doctor.uid, dayOf(start));
  const value = { appointmentId, patientId: patient.uid, doctorId: doctor.uid, availabilityId, availabilityRevision: 1,
    startAt: stamp(start), endAt: stamp(start + halfHour), doctorDisplay: { professionalName: professional.professionalName, specialty: professional.specialty },
    status: 'scheduled', cancellation: null, outcome: null, schemaVersion: 1, createdAt, updatedAt: createdAt };
  const batch = db.batch();
  batch.set(db.doc('doctorAvailability/' + availabilityId), { doctorId: doctor.uid, utcDate: dayOf(start), timeZone: 'Africa/Nairobi',
    windows: [{ startAt: value.startAt, endAt: value.endAt }], revision: 1, schemaVersion: 1, createdAt, updatedAt: createdAt });
  batch.set(db.doc('appointments/' + appointmentId), value);
  for (const lock of locksFor(value)) batch.set(db.doc('bookingLocks/' + lock.id), lock.data);
  await batch.commit();
  return { appointmentId, start, input };
}
/** Both network operations start before either settles; server transaction interleaving is nondeterministic. */
export async function race(actions: (() => Promise<any>)[]) {
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const starts: number[] = [], ends: number[] = [];
  const pending = actions.map(async action => {
    await barrier; starts.push(performance.now());
    try { return await action(); } finally { ends.push(performance.now()); }
  });
  release();
  const results = await Promise.allSettled(pending);
  expect(starts).toHaveLength(actions.length); expect(Math.max(...starts)).toBeLessThan(Math.min(...ends));
  return results;
}
