import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, doc, documentId, getDoc, getDocs, limit, orderBy, query, startAfter, where,
  setDoc, updateDoc, deleteDoc, Timestamp, QueryDocumentSnapshot } from 'firebase/firestore';
import { Firestore, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { approvedDocuments, identity, now, start } from '../availabilityFixtures';

let env: RulesTestEnvironment, admin: Firestore;
const key = (n = 0) => createHash('sha256').update('read-fixture-' + n).digest('hex');
const time = (ms: number) => AdminTimestamp.fromMillis(ms);
function appointment(n = 0, status = 'scheduled', startAt = start): Record<string, any> {
  const updatedAt = status === 'scheduled' ? now : status === 'cancelled' ? now + 1000 : startAt + 1800000;
  return { appointmentId: key(n), patientId: 'patient', doctorId: 'doctor', availabilityId: 'a'.repeat(64),
    availabilityRevision: 1, startAt: time(startAt), endAt: time(startAt + 1800000),
    doctorDisplay: { professionalName: 'Doctor Name', specialty: 'Medicine' }, status,
    cancellation: status === 'cancelled' ? { cancelledBy: 'patient', cancelledAt: time(updatedAt), reason: 'Changed plans' } : null,
    outcome: ['completed', 'no_show'].includes(status) ? { recordedBy: 'doctor', recordedAt: time(updatedAt) } : null,
    schemaVersion: 1, createdAt: time(now), updatedAt: time(updatedAt) };
}
function encode(value: any): any {
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    if (Object.keys(value).sort().join(',') === 'nanoseconds,seconds') return new AdminTimestamp(value.seconds, value.nanoseconds);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  }
  return value;
}
const client = (uid: string) => uid === 'guest' ? env.unauthenticatedContext().firestore()
  : env.authenticatedContext(uid, { role: 'administrator' }).firestore();
const field = (uid: string) => uid === 'doctor' ? 'doctorId' : 'patientId';
const history = (uid: string, pageSize = 50, cursor?: QueryDocumentSnapshot) => query(collection(client(uid), 'appointments'),
  where(field(uid), '==', uid), orderBy('startAt', 'desc'), orderBy(documentId(), 'desc'),
  ...(cursor ? [startAfter(cursor)] : []), limit(pageSize));
const upcoming = (uid: string, pageSize = 50, cursor?: QueryDocumentSnapshot) => query(collection(client(uid), 'appointments'),
  where(field(uid), '==', uid), where('status', '==', 'scheduled'), where('startAt', '>=', Timestamp.fromMillis(start)),
  orderBy('startAt', 'asc'), orderBy(documentId(), 'asc'), ...(cursor ? [startAfter(cursor)] : []), limit(pageSize));
async function seedAppointments(values: Record<string, any>[]) {
  const batch = admin.batch();
  for (const value of values) batch.set(admin.doc('appointments/' + value.appointmentId), value);
  await batch.commit();
}
beforeAll(async () => {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085') throw new Error('Requires local demo emulator.');
  env = await initializeTestEnvironment({ projectId: 'demo-calladoc-rules', firestore: { host: '127.0.0.1', port: 8085,
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  admin = new Firestore({ projectId: 'demo-calladoc-rules', host: '127.0.0.1:8085', ssl: false });
});
beforeEach(async () => {
  await env.clearFirestore();
  const docs = approvedDocuments();
  for (const [uid, role] of [['patient2', 'patient'], ['doctor2', 'doctor'], ['administrator', 'administrator'], ['admin', 'admin']]) {
    docs['users/' + uid] = identity(uid, role);
  }
  const batch = admin.batch();
  for (const [path, value] of Object.entries(docs)) batch.set(admin.doc(path), encode(value));
  batch.set(admin.doc('appointments/' + key()), appointment());
  await batch.commit();
});
afterAll(async () => { if (env) await env.cleanup(); if (admin) await admin.terminate(); });

describe.each(['patient', 'doctor'])('%s participant', uid => {
  test.each(['scheduled', 'cancelled', 'completed', 'no_show'])('gets %s including terminal metadata', async status => {
    await seedAppointments([appointment(0, status)]);
    const result = await assertSucceeds(getDoc(doc(client(uid), 'appointments', key())));
    expect(result.data()?.status).toBe(status);
    expect(Object.keys(result.data()!).sort()).toEqual(Object.keys(appointment()).sort());
  });
  test('history includes every lifecycle status; upcoming uses status, time boundary and ascending order', async () => {
    const values = ['scheduled', 'cancelled', 'completed', 'no_show'].map((s, i) => appointment(i, s, start + i * 1800000));
    values.push(appointment(4, 'scheduled', start + 7200000), appointment(5, 'scheduled', start - 1800000));
    await seedAppointments(values);
    const all = await assertSucceeds(getDocs(history(uid)));
    expect(all.docs.map(d => d.id)).toEqual([key(4), key(3), key(2), key(1), key(0), key(5)]);
    const next = await assertSucceeds(getDocs(upcoming(uid)));
    expect(next.docs.map(d => d.id)).toEqual([key(0), key(4)]);
  });
  test('history and upcoming snapshot cursors preserve equal-time rows without skips or duplicates', async () => {
    await seedAppointments(Array.from({ length: 7 }, (_, i) => appointment(i)));
    for (const shape of [history, upcoming]) {
      const ids: string[] = []; let cursor: QueryDocumentSnapshot | undefined;
      for (let page = 0; page < 4; page++) {
        const result = await assertSucceeds(getDocs(shape(uid, 2, cursor)));
        ids.push(...result.docs.map(d => d.id)); cursor = result.docs[result.docs.length - 1];
      }
      const expected = Array.from({ length: 7 }, (_, i) => key(i)).sort();
      expect(ids).toEqual(shape === history ? expected.reverse() : expected);
      expect(new Set(ids).size).toBe(7);
      expect((await assertSucceeds(getDocs(shape(uid, 2, cursor)))).empty).toBe(true);
    }
  });
  test('full 50-document pages succeed without access-call/expression exhaustion', async () => {
    await seedAppointments(Array.from({ length: 50 }, (_, i) => appointment(i)));
    expect((await assertSucceeds(getDocs(history(uid)))).size).toBe(50);
    expect((await assertSucceeds(getDocs(upcoming(uid)))).size).toBe(50);
  });
  test('disabled caller loses get and both supported queries', async () => {
    await admin.doc('users/' + uid).update({ status: 'disabled' });
    await assertFails(getDoc(doc(client(uid), 'appointments', key())));
    await assertFails(getDocs(history(uid))); await assertFails(getDocs(upcoming(uid)));
  });
  test('disabled counterpart does not hide history or upcoming appointments', async () => {
    await admin.doc('users/' + (uid === 'patient' ? 'doctor' : 'patient')).update({ status: 'disabled' });
    const values = ['scheduled', 'cancelled', 'completed', 'no_show'].map((status, i) => appointment(i, status));
    await seedAppointments(values);
    for (const value of values) await assertSucceeds(getDoc(doc(client(uid), 'appointments', value.appointmentId)));
    expect((await assertSucceeds(getDocs(history(uid)))).size).toBe(4);
    expect((await assertSucceeds(getDocs(upcoming(uid)))).size).toBe(1);
  });
  test('doctor approval loss and removed projections do not hide existing history', async () => {
    await admin.doc('users/doctor').update({ verificationStatus: 'rejected' });
    await admin.doc('doctorPublicProfiles/doctor').delete();
    await admin.doc('verificationRequests/approved').delete();
    await seedAppointments([appointment(0, 'cancelled')]);
    await assertSucceeds(getDoc(doc(client(uid), 'appointments', key())));
    expect((await assertSucceeds(getDocs(history(uid)))).size).toBe(1);
  });
  test('missing owner, cross-owner, wrong role field, unbounded, oversized and collection-group lists fail', async () => {
    const db = client(uid), items = collection(db, 'appointments');
    const constraints = [
      query(items, limit(1)),
      query(items, where('status', '==', 'scheduled'), orderBy('startAt'), limit(1)),
      query(items, where(field(uid), '==', uid + '2'), limit(1)),
      query(items, where(uid === 'patient' ? 'doctorId' : 'patientId', '==', uid === 'patient' ? 'doctor' : 'patient'), limit(1)),
      query(items, where(field(uid), '==', uid)),
      history(uid, 51), upcoming(uid, 51),
      query(items, where(field(uid), 'in', [uid, uid + '2']), limit(2)),
      query(collectionGroup(db, 'appointments'), where(field(uid), '==', uid), limit(1)),
    ];
    for (const request of constraints) await assertFails(getDocs(request));
  });
  test('appointment participation grants no direct appointment writes or reservation/availability access', async () => {
    const db = client(uid), ref = doc(db, 'appointments', key());
    await assertSucceeds(getDoc(ref));
    await assertFails(setDoc(doc(db, 'appointments', key(99)), { patientId: uid }));
    await assertFails(updateDoc(ref, { status: 'cancelled' })); await assertFails(deleteDoc(ref));
    for (const name of ['bookingLocks', 'doctorAvailability', 'availabilitySlots']) {
      await admin.doc(name + '/existing').set({ patientId: 'patient', doctorId: 'doctor' });
      const hidden = doc(db, name, 'existing');
      await assertFails(getDoc(hidden)); await assertFails(getDocs(query(collection(db, name), limit(1))));
      await assertFails(setDoc(doc(db, name, 'new'), { doctorId: uid }));
      await assertFails(updateDoc(hidden, { doctorId: uid })); await assertFails(deleteDoc(hidden));
    }
  });
});

test.each(['patient2', 'doctor2', 'administrator', 'admin', 'guest', 'claim-only'])('%s cannot guess or enumerate participant appointments', async uid => {
  await assertFails(getDoc(doc(client(uid), 'appointments', key())));
  for (const owner of ['patientId', 'doctorId']) {
    const own = getDocs(query(collection(client(uid), 'appointments'), where(owner, '==', uid), limit(1)));
    if ((uid === 'patient2' && owner === 'patientId') || (uid === 'doctor2' && owner === 'doctorId')) {
      // A legitimate participant may ask for their own empty history, never another user's history.
      expect((await assertSucceeds(own)).empty).toBe(true);
    } else await assertFails(own);
    await assertFails(getDocs(query(collection(client(uid), 'appointments'), where(owner, '==', owner === 'patientId' ? 'patient' : 'doctor'), limit(1))));
  }
});

test.each([
  { schemaVersion: 2 }, { status: 'unknown' }, { patientId: 1 }, { doctorId: null }, { doctorId: 'patient' },
  { doctorId: 'bad/id' }, { doctorId: 'bad\\id' }, { doctorId: 'bad\u0000id' },
  { startAt: new Date(start).toISOString() }, { endAt: time(start) }, { endAt: time(start + 3600000) },
  { startAt: time(start + 1), endAt: time(start + 1800001) }, { appointmentId: key(42) },
  { availabilityId: 'wrong' }, { availabilityRevision: 0 }, { createdAt: time(start) }, { updatedAt: time(now - 1) },
  { cancellation: { cancelledBy: 'patient' } }, { doctorDisplay: { professionalName: 'Doctor', specialty: 'Medicine', patientId: 'patient' } },
  { paymentStatus: 'paid' }, { health: 'private' }, { outcome: { recordedBy: 'doctor' } },
])('malformed appointment get fails: %#', async patch => {
  await seedAppointments([{ ...appointment(), ...patch, appointmentId: key() }]);
  // Keep the document ID fixed when testing its stored binding.
  if ('appointmentId' in patch) await admin.doc('appointments/' + key()).update(patch);
  await assertFails(getDoc(doc(client('patient'), 'appointments', key())));
});
test.each(['patientId', 'doctorId', 'status', 'startAt', 'endAt', 'schemaVersion', 'doctorDisplay', 'cancellation', 'outcome'])('missing %s fails individual get', async name => {
  const value = appointment(); delete value[name]; await admin.doc('appointments/' + key()).set(value);
  await assertFails(getDoc(doc(client('patient'), 'appointments', key())));
});
test.each([{ uid: 'other' }, { role: 'admin' }, { status: 'unknown' }, { schemaVersion: 2 },
  { fullName: '' }, { createdAt: '2026-02-30T00:00:00.000Z' }])('malformed canonical identity %# fails reads', async patch => {
  await admin.doc('users/patient').update(patch);
  await assertFails(getDoc(doc(client('patient'), 'appointments', key()))); await assertFails(getDocs(history('patient')));
});
test('presentation fields cannot redirect ownership', async () => {
  await admin.doc('appointments/' + key()).update({ doctorDisplay: { professionalName: 'patient2', specialty: 'doctor2' } });
  await assertFails(getDoc(doc(client('patient2'), 'appointments', key())));
  await assertFails(getDoc(doc(client('doctor2'), 'appointments', key())));
  await assertSucceeds(getDoc(doc(client('patient'), 'appointments', key())));
});

test.each([
  ['cancelled', { cancellation: { cancelledBy: 'stranger', cancelledAt: time(now + 1000), reason: null } }],
  ['cancelled', { cancellation: { cancelledBy: 'patient', cancelledAt: time(start), reason: null }, updatedAt: time(start) }],
  ['cancelled', { cancellation: { cancelledBy: 'patient', cancelledAt: time(now + 1000), reason: 'x'.repeat(501) } }],
  ['completed', { outcome: { recordedBy: 'patient', recordedAt: time(start + 1800000) } }],
  ['no_show', { outcome: { recordedBy: 'doctor', recordedAt: time(start) }, updatedAt: time(start) }],
  ['completed', { outcome: { recordedBy: 'doctor', recordedAt: time(start + 1800000), diagnosis: 'private' } }],
] as [string, Record<string, unknown>][])('invalid %s terminal metadata %# fails get', async (status, patch) => {
  await seedAppointments([{ ...appointment(0, status), ...patch }]);
  await assertFails(getDoc(doc(client('patient'), 'appointments', key())));
  await assertFails(getDoc(doc(client('doctor'), 'appointments', key())));
});

test('appointment relationship does not expand private collection access or consultation authority', async () => {
  const base = { uid: 'patient', schemaVersion: 1, createdAt: time(now), updatedAt: time(now) };
  await admin.doc('patientProfiles/patient').set({ ...base, displayName: 'Patient' });
  await admin.doc('patientHealthProfiles/patient').set({ ...base, allergies: ['Pollen'] });
  await admin.doc('doctorCredentials/private-credential').set({ credentialId: 'private-credential', doctorUid: 'doctor',
    storagePath: 'doctorCredentials/doctor/private-credential/document', category: 'medical_license', contentType: 'application/pdf',
    sizeBytes: 1, state: 'attached', generation: '1', checksum: 'a'.repeat(64), requestId: 'approved', schemaVersion: 1,
    createdAt: time(now), updatedAt: time(now), expiresAt: time(start) });
  for (const name of ['verificationAudit', 'administratorProvisioningAudit', 'consultations', 'messages', 'rooms']) {
    await admin.doc(name + '/private').set({ patientId: 'patient', doctorId: 'doctor', appointmentId: key() });
  }
  for (const uid of ['patient', 'doctor']) {
    const db = client(uid);
    await assertSucceeds(getDoc(doc(db, 'appointments', key())));
    await assertSucceeds(getDoc(doc(db, 'users', uid)));
    await assertFails(getDoc(doc(db, 'users', uid === 'patient' ? 'doctor' : 'patient')));
    for (const name of ['verificationAudit', 'administratorProvisioningAudit', 'consultations', 'messages', 'rooms']) {
      await assertFails(getDoc(doc(db, name, 'private')));
      await assertFails(getDocs(query(collection(db, name), limit(1))));
    }
    for (const name of ['users', 'patientProfiles', 'patientHealthProfiles', 'doctorProfiles', 'doctorPublicProfiles', 'doctorCredentials', 'verificationRequests']) {
      await assertFails(getDocs(query(collection(db, name), limit(1))));
    }
  }
  for (const name of ['patientProfiles', 'patientHealthProfiles']) {
    await assertSucceeds(getDoc(doc(client('patient'), name, 'patient')));
    await assertFails(getDoc(doc(client('doctor'), name, 'patient')));
  }
  for (const [name, id] of [['doctorProfiles', 'doctor'], ['doctorCredentials', 'private-credential'], ['verificationRequests', 'approved']]) {
    await assertSucceeds(getDoc(doc(client('doctor'), name, id)));
    await assertFails(getDoc(doc(client('patient'), name, id)));
  }
  const publicProfile = await assertSucceeds(getDoc(doc(client('patient'), 'doctorPublicProfiles', 'doctor')));
  expect(Object.keys(publicProfile.data()!).sort()).toEqual(['uid', 'professionalName', 'specialty', 'approvedRevision',
    'approvedRequestId', 'schemaVersion', 'publishedAt', 'updatedAt'].sort());
  await assertFails(updateDoc(doc(client('patient'), 'doctorPublicProfiles', 'doctor'), { phoneNumber: 'private' }));
});
