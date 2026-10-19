import {onAuthStateChanged} from 'firebase/auth';
import {doc, getDoc} from 'firebase/firestore';
import {httpsCallable} from 'firebase/functions';
import {getBytes, ref} from 'firebase/storage';
import BlobUtil from 'react-native-blob-util';
import {auth, db, functions, storage} from './firebaseConfig';
import {loadOwnIdentity} from './identityService';
import {categories, draftInput, safeDocumentId, validateFile} from './doctorVerification';
import type {DoctorCredentialRecord, VerificationRequest, VerificationReviewInput} from '@shared/types/verification';
import type {VerificationQueueItem, VerificationQueuePage} from '@shared/types/verificationQueue';

export type PrivateCredential = {uri: string; contentType: DoctorCredentialRecord['contentType']};
const MAX_BYTES = 5 * 1024 * 1024;
let fileSequence = 0;
export function validateQueueItem(row: VerificationQueueItem) {
  safeDocumentId(row.requestId); safeDocumentId(row.doctorUid);
  if (!Number.isSafeInteger(row.profileRevision) || row.profileRevision < 1) throw new Error('Invalid revision.');
  draftInput(row.professional, true);
  if (!row.submittedAt || !Number.isSafeInteger(row.submittedAt.seconds) || !Number.isInteger(row.submittedAt.nanoseconds)
    || row.submittedAt.nanoseconds < 0 || row.submittedAt.nanoseconds > 999999999) throw new Error('Invalid timestamp.');
  if (!Array.isArray(row.credentials) || row.credentials.length < 1 || row.credentials.length > 5
    || new Set(row.credentials.map(c => c.credentialId)).size !== row.credentials.length) throw new Error('Invalid credentials.');
  row.credentials.forEach(c => {
    safeDocumentId(c.credentialId);
    if (!categories.includes(c.category) || typeof c.generation !== 'string' || typeof c.checksum !== 'string'
      || !/^[0-9]{1,30}$/.test(c.generation) || !/^[a-f0-9]{64}$/.test(c.checksum)) throw new Error('Invalid binding.');
  });
}
export function adminVerificationError(error: unknown) {
  const code = (error as {code?: string})?.code ?? '';
  if (/permission-denied|unauthenticated|unauthorized/.test(code)) return 'Administrator access was denied. Refresh your account or sign in again.';
  if (/failed-precondition/.test(code)) return 'This request or its evidence has changed. Refresh the queue before deciding.';
  return 'Unable to complete this operation. Check your connection and retry. A decision may already have succeeded; refresh to confirm.';
}
export function createAdminVerificationSession(uid: string) {
  let disposed = false, generation = 0, filePath: string | null = null, deciding = false;
  let stopAuth = () => {};
  const check = () => { if (disposed || auth.currentUser?.uid !== uid) throw new Error('Session ended.'); };
  const unlink = async (path: string | null) => {
    if (!path) return;
    try { if (await BlobUtil.fs.exists(path)) await BlobUtil.fs.unlink(path); } catch { /* Best effort; no sensitive logging. */ }
  };
  async function closeCredential() {
    ++generation;
    const previous = filePath; filePath = null;
    await unlink(previous);
  }
  function dispose() { disposed = true; stopAuth(); void closeCredential(); }
  stopAuth = onAuthStateChanged(auth, user => { if (user?.uid !== uid) dispose(); });
  async function eligible() {
    check(); const identity = await loadOwnIdentity(uid); check();
    if (identity?.uid !== uid || identity.role !== 'administrator' || identity.status !== 'active') throw new Error('Administrator required.');
  }
  async function read<T>(collection: string, id: string): Promise<T> {
    check(); const snapshot = await getDoc(doc(db, collection, safeDocumentId(id))); check();
    if (!snapshot.exists()) throw new Error('Document unavailable.');
    return snapshot.data() as T;
  }
  return {
    dispose, closeCredential,
    async queue(after?: string): Promise<VerificationQueuePage> {
      await eligible(); if (after !== undefined) safeDocumentId(after);
      const response = await httpsCallable<unknown, VerificationQueuePage>(functions, 'listPendingDoctorVerifications')({limit: 10, ...(after ? {after} : {})});
      check(); const page = response.data;
      if (!Array.isArray(page.items) || page.items.length > 10) throw new Error('Invalid queue.');
      page.items.forEach(validateQueueItem);
      if (page.nextCursor !== null) {
        safeDocumentId(page.nextCursor);
        if (!page.items.length || page.nextCursor !== page.items[page.items.length - 1].requestId || page.nextCursor === after) throw new Error('Invalid cursor.');
      }
      return page;
    },
    async review(item: VerificationQueueItem, decision: VerificationReviewInput) {
      check(); if (deciding) throw new Error('Decision already in progress.');
      deciding = true;
      try {
        validateQueueItem(item);
        if (decision.decision === 'rejected' && (!decision.rejectionReason.trim() || decision.rejectionReason.trim().length > 1000
          || /[\u0000-\u001f\u007f]/.test(decision.rejectionReason))) throw new Error('Provide a valid rejection reason.');
        await eligible();
        const input = {requestId: item.requestId, expectedRevision: item.profileRevision,
          ...decision, ...(decision.decision === 'rejected' ? {rejectionReason: decision.rejectionReason.trim()} : {})};
        const result = await httpsCallable<unknown, {requestId: string; state: string; profileRevision: number}>(functions, 'reviewDoctorVerification')(input); check();
        if (result.data.requestId !== item.requestId || result.data.profileRevision !== item.profileRevision || result.data.state !== decision.decision)
          throw new Error('Invalid decision response. Refresh to confirm.');
        return result.data;
      } finally { deciding = false; }
    },
    async openCredential(item: VerificationQueueItem, credentialId: string): Promise<PrivateCredential> {
      // New selection invalidates any pending download before its file can become visible.
      const cleanup = closeCredential(); const version = generation; await cleanup;
      let ownedPath: string | null = null;
      const current = () => { check(); if (version !== generation) throw new Error('Selection ended.'); };
      try {
        await eligible(); current(); validateQueueItem(item); safeDocumentId(credentialId);
        const selected = item.credentials.find(c => c.credentialId === credentialId);
        if (!selected) throw new Error('Unrelated credential.');
        const request = await read<VerificationRequest>('verificationRequests', item.requestId); current();
        validateQueueItem(request);
        if (request.requestId !== item.requestId || request.doctorUid !== item.doctorUid || request.profileRevision !== item.profileRevision
          || request.state !== 'submitted' || request.schemaVersion !== 1) throw new Error('Request changed.');
        const bound = request.credentials.find(c => c.credentialId === credentialId);
        if (!bound || bound.category !== selected.category || bound.generation !== selected.generation || bound.checksum !== selected.checksum) throw new Error('Evidence changed.');
        const record = await read<DoctorCredentialRecord>('doctorCredentials', credentialId); current();
        validateFile(record.contentType, record.sizeBytes);
        const path = `doctorCredentials/${item.doctorUid}/${credentialId}/document`;
        if (record.credentialId !== credentialId || record.doctorUid !== item.doctorUid || record.requestId !== item.requestId
          || record.schemaVersion !== 1 || record.state !== 'attached' || record.storagePath !== path
          || record.generation !== bound.generation || record.checksum !== bound.checksum || record.category !== bound.category) throw new Error('Invalid credential binding.');
        // Firebase adds authentication and honors the existing emulator configuration and Storage Rules.
        const bytes = await getBytes(ref(storage, path), MAX_BYTES); current();
        if (bytes.byteLength !== record.sizeBytes) throw new Error('Credential size changed.');
        const extension = record.contentType === 'application/pdf' ? 'pdf' : record.contentType === 'image/png' ? 'png' : 'jpg';
        ownedPath = `${BlobUtil.fs.dirs.CacheDir}/calladoc-review-${Date.now()}-${++fileSequence}.${extension}`;
        await BlobUtil.fs.writeFile(ownedPath, Array.from(new Uint8Array(bytes)), 'ascii'); current();
        filePath = ownedPath;
        return {uri: `file://${ownedPath}`, contentType: record.contentType};
      } catch (error) { await unlink(ownedPath); throw error; }
    },
  };
}
