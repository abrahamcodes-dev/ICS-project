import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { db, storage } from '../shared/firestoreRefs';
import { validIdentity } from '../auth/registrationPolicy';
import { validateApprovedDoctorBinding } from '../scheduling/approvalBinding';
import { validateAvatarJpeg, avatarInput } from './avatarPolicy';
import { validateAppointment } from '../scheduling/validation';
import type { AppointmentPatientDisplay } from '../../../shared/types/schedulingReads';
const stateRef = (uid: string) => db.doc(`users/${uid}/avatar/state`);
const path = (uid: string, id: string) => `avatars/${uid}/${id}/image.jpg`;
type State = {
    revision: number;
    current: string | null;
    generation: string | null;
    pending: string | null;
    expiresAt: number;
    retired: string[];
};
const empty = (): State => ({ revision: 0, current: null, generation: null, pending: null, expiresAt: 0, retired: [] });
function state(value: any): State {
    if (value === undefined)
        return empty();
    const id = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
    if (!value || Object.keys(value).sort().join(',') !== 'current,expiresAt,generation,pending,retired,revision'
        || !Number.isSafeInteger(value.revision) || value.revision < 0
        || !(value.current === null || id(value.current)) || !(value.pending === null || id(value.pending))
        || !(value.current === null ? value.generation === null : typeof value.generation === 'string' && /^\d+$/.test(value.generation))
        || !Number.isSafeInteger(value.expiresAt) || value.expiresAt < 0
        || !Array.isArray(value.retired) || value.retired.length > 30 || !value.retired.every(id)
        || value.retired.includes(value.current) || value.retired.includes(value.pending))
        throw new HttpsError('failed-precondition', 'Invalid avatar state.');
    return value;
}
// Approval policies consume domain timestamps; Firestore persists native Timestamps.
function approvalDocument(value: any) {
    if (!value || typeof value !== 'object')
        throw new HttpsError('permission-denied', 'Doctor unavailable.');
    const result = { ...value };
    for (const key of ['createdAt', 'updatedAt', 'publishedAt', 'submittedAt', 'reviewedAt', 'invalidatedAt']) {
        if (key in result && result[key] !== null) {
            if (!(result[key] instanceof Timestamp))
                throw new HttpsError('permission-denied', 'Doctor unavailable.');
            result[key] = { seconds: result[key].seconds, nanoseconds: result[key].nanoseconds };
        }
    }
    return result;
}
function authorize(value: unknown, uid: string) { if (!validIdentity(value) || value.uid !== uid || value.status !== 'active' || !['patient', 'doctor'].includes(value.role))
    throw new HttpsError('permission-denied', 'Active patient or doctor required.'); return value; }
async function cleanup(uid: string) {
    const before = state((await stateRef(uid).get()).data());
    const removed: string[] = [];
    for (const id of before.retired) {
        try {
            await storage.bucket().file(path(uid, id)).delete({ ignoreNotFound: true });
            removed.push(id);
        }
        catch { /* Retain failed deletions for the next operation. */ }
    }
    if (removed.length)
        await db.runTransaction(async (tx) => { const ref = stateRef(uid), s = state((await tx.get(ref)).data()); tx.set(ref, { ...s, retired: s.retired.filter(id => !removed.includes(id)) }); });
}
/** No client controls bindings, final object references, or public access. */
export const changeProfileAvatar = onCall(async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new HttpsError('unauthenticated', 'Sign in required.');
    const input = avatarInput(request.data);
    authorize((await db.doc(`users/${uid}`).get()).data(), uid);
    await cleanup(uid);
    let generation: string | null = null;
    if (input.action === 'finalize') {
        const s = state((await stateRef(uid).get()).data());
        if (s.current === input.uploadId)
            return { revision: s.revision, pending: null };
        if (s.pending !== input.uploadId || s.expiresAt <= Date.now())
            throw new HttpsError('failed-precondition', 'Upload expired or replaced.');
        const file = storage.bucket().file(path(uid, input.uploadId!));
        const [metadata] = await file.getMetadata();
        if (metadata.contentType !== 'image/jpeg' || !Number.isSafeInteger(Number(metadata.size)) || Number(metadata.size) < 1 || Number(metadata.size) > 262144 || !/^\d+$/.test(String(metadata.generation)) || Object.keys(metadata.metadata ?? {}).some(key => key !== 'firebaseStorageDownloadTokens'))
            throw new HttpsError('invalid-argument', 'Invalid image metadata.');
        if (metadata.metadata?.firebaseStorageDownloadTokens)
            await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
        generation = String(metadata.generation);
        const [bytes] = await storage.bucket().file(path(uid, input.uploadId!), { generation }).download();
        validateAvatarJpeg(bytes);
    }
    const result = await db.runTransaction(async (tx) => {
        const identity = authorize((await tx.get(db.doc(`users/${uid}`))).data(), uid), ref = stateRef(uid), s = state((await tx.get(ref)).data());
        if (input.action === 'finalize' && s.current === input.uploadId)
            return { revision: s.revision, pending: null };
        if (s.revision !== input.expectedRevision)
            throw new HttpsError('aborted', 'Profile picture changed. Reload before retrying.');
        if (s.retired.length >= 20)
            throw new HttpsError('unavailable', 'Pending cleanup. Retry later.');
        const retire = (id: string | null) => { if (id && !s.retired.includes(id))
            s.retired.push(id); };
        if (input.action === 'prepare') {
            retire(s.pending);
            s.pending = randomUUID();
            s.expiresAt = Date.now() + 15 * 60000;
        }
        else if (input.action === 'finalize') {
            if (s.pending !== input.uploadId || s.expiresAt <= Date.now())
                throw new HttpsError('failed-precondition', 'Upload expired or replaced.');
            retire(s.current);
            s.current = s.pending;
            s.generation = generation;
            s.pending = null;
            s.revision++;
        }
        else {
            retire(s.current);
            retire(s.pending);
            s.current = null;
            s.generation = null;
            s.pending = null;
            s.revision++;
        }
        tx.set(ref, s);
        // Minimal projection, separate from the immutable professional approval snapshot.
        if (identity.role === 'doctor')
            tx.set(db.doc(`doctorPublicProfiles/${uid}/avatar/current`), { avatarId: s.current, generation: s.generation, revision: s.revision });
        return { revision: s.revision, pending: s.pending, storagePath: s.pending ? path(uid, s.pending) : null };
    });
    await cleanup(uid);
    return result;
});
export const getProfileAvatar = onCall(async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new HttpsError('unauthenticated', 'Sign in required.');
    const appointmentId = request.data?.appointmentId;
    const appointmentRead = appointmentId !== undefined;
    if (appointmentRead && (typeof appointmentId !== 'string' || !/^[a-f0-9]{64}$/.test(appointmentId) || Object.keys(request.data).length !== 1))
        throw new HttpsError('invalid-argument', 'Invalid appointment.');
    let target = request.data?.uid;
    if (!appointmentRead && (typeof target !== 'string' || !target || target.length > 128 || target === '.' || target === '..' || /[\/\\]/.test(target) || Object.keys(request.data).length !== 1))
        throw new HttpsError('invalid-argument', 'Invalid profile.');
    let patientDisplayName: string | null = null;
    const readSnapshot = () => db.runTransaction(async (tx) => {
        const caller = authorize((await tx.get(db.doc(`users/${uid}`))).data(), uid);
        if (appointmentRead) {
            if (caller.role !== 'doctor' || caller.verificationStatus !== 'approved')
                throw new HttpsError('permission-denied', 'Assigned approved doctor required.');
            const raw = (await tx.get(db.doc(`appointments/${appointmentId}`))).data();
            try {
                const a = approvalDocument(raw);
                for (const field of ['startAt','endAt']) {
                    if (!(a[field] instanceof Timestamp)) throw new Error('Invalid timestamp');
                    a[field] = {seconds:a[field].seconds,nanoseconds:a[field].nanoseconds};
                }
                if (a.cancellation) a.cancellation = {...a.cancellation,cancelledAt:approvalDocument({createdAt:a.cancellation.cancelledAt}).createdAt};
                if (a.outcome) a.outcome = {...a.outcome,recordedAt:approvalDocument({createdAt:a.outcome.recordedAt}).createdAt};
                const appointment = validateAppointment(a);
                if (appointment.appointmentId !== appointmentId || appointment.doctorId !== uid) throw new Error('Not assigned');
                target = appointment.patientId;
            } catch { throw new HttpsError('permission-denied', 'Appointment unavailable.'); }
            const patient = authorize((await tx.get(db.doc(`users/${target}`))).data(), target);
            if (patient.role !== 'patient') throw new HttpsError('permission-denied', 'Patient unavailable.');
            patientDisplayName = patient.fullName;
        }
        if (appointmentRead || target !== uid) {
            const doctorUid = appointmentRead ? uid : target;
            const doctor = authorize((await tx.get(db.doc(`users/${doctorUid}`))).data(), doctorUid);
            if (doctor.role !== 'doctor' || doctor.verificationStatus !== 'approved')
                throw new HttpsError('permission-denied', 'Approved doctor required.');
            const profile = (await tx.get(db.doc(`doctorProfiles/${doctorUid}`))).data() as any;
            const projection = (await tx.get(db.doc(`doctorPublicProfiles/${doctorUid}`))).data();
            if (!profile?.approvedRequestId)
                throw new HttpsError('permission-denied', 'Doctor unavailable.');
            const source = (await tx.get(db.doc(`verificationRequests/${profile.approvedRequestId}`))).data() as any;
            try {
                validateApprovedDoctorBinding(doctorUid, approvalDocument(profile), approvalDocument(projection), approvalDocument(source));
            }
            catch {
                throw new HttpsError('permission-denied', 'Doctor unavailable.');
            }
        }
        return state((await tx.get(stateRef(target))).data());
    });
    const snapshot = await readSnapshot();
    const snapshotTarget = target;
    let image: string | null = null;
    if (snapshot.current && snapshot.generation) {
        try {
            const [bytes] = await storage.bucket().file(path(target, snapshot.current), { generation: snapshot.generation }).download();
            validateAvatarJpeg(bytes);
            image = `data:image/jpeg;base64,${bytes.toString('base64')}`;
        }
        catch (error) {
            // A removed object must not prevent its owner from replacing/removing the stale reference.
            if (!appointmentRead && (error as {
                code?: number;
            }).code !== 404)
                throw error;
        }
    }
    if (appointmentRead) {
        const current = await readSnapshot();
        if (target !== snapshotTarget || current.current !== snapshot.current || current.generation !== snapshot.generation) image = null;
        const result: AppointmentPatientDisplay = {appointmentId,patientDisplayName,patientAvatar:image};
        return result;
    }
    return { revision: snapshot.revision, image, pending: target === uid ? snapshot.pending : null };
});
