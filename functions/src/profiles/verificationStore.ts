import { randomUUID } from 'crypto';
import { Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore';
import type { Bucket } from '@google-cloud/storage';
import type { DoctorCredentialRecord, VerificationRequest } from '../../../shared/types/verification';
import type { CollectionReference } from 'firebase-admin/firestore';
import type { VerificationDependencies } from './verificationHandlers';
import { createCredentialStore } from './credentialStore';
import { fail } from './domainValidation';

const timeFields = ['createdAt', 'updatedAt', 'submittedAt', 'reviewedAt', 'invalidatedAt', 'expiresAt', 'publishedAt', 'occurredAt'];
function decode<T>(data: DocumentData | undefined): T | null {
  if (!data) return null;
  for (const key of timeFields) if (key in data && data[key] !== null && !(data[key] instanceof Timestamp)) fail('stored-timestamp');
  return data as T;
}
function encode(value: object): DocumentData {
  const data: DocumentData = { ...value };
  for (const key of timeFields) if (data[key] && typeof data[key] !== 'string')
    data[key] = new Timestamp(data[key].seconds, data[key].nanoseconds);
  return data;
}
export function createVerificationStore(db: Firestore, bucket: Bucket): VerificationDependencies {
  const evidence = createCredentialStore(db, db.collection('doctorCredentials') as CollectionReference<DoctorCredentialRecord>, bucket);
  return { now: () => Timestamp.now(), newId: () => randomUUID(), inspect: evidence.inspect, assertUnchanged: evidence.assertUnchanged,
    transact: action => db.runTransaction(async tx => {
      const ref = (name: string, id: string) => db.collection(name).doc(id);
      async function read<T>(name: string, id: string): Promise<T | null> { return decode<T>((await tx.get(ref(name, id))).data()); }
      return action({
        identity: async uid => (await tx.get(ref('users', uid))).data() ?? null,
        profile: uid => read('doctorProfiles', uid), credential: id => read('doctorCredentials', id),
        request: id => read('verificationRequests', id), audit: id => read('verificationAudit', id),
        latest: async uid => {
          const query = db.collection('verificationRequests').where('doctorUid', '==', uid).orderBy('profileRevision', 'desc').limit(1);
          const latest = (await tx.get(query)).docs[0];
          if (!latest) return null;
          const data = decode<VerificationRequest>(latest.data())!;
          if (data.requestId !== latest.id) fail('request-id-mismatch'); return data;
        },
        createRequest: data => { tx.create(ref('verificationRequests', data.requestId), encode(data)); },
        saveRequest: data => { tx.set(ref('verificationRequests', data.requestId), encode(data)); },
        saveProfile: data => { tx.set(ref('doctorProfiles', data.uid), encode(data)); },
        saveCredential: data => { tx.set(ref('doctorCredentials', data.credentialId), encode(data)); },
        saveIdentity: data => { tx.set(ref('users', data.uid), data); },
        publish: (uid, data) => { if (data) tx.set(ref('doctorPublicProfiles', uid), encode(data)); else tx.delete(ref('doctorPublicProfiles', uid)); },
        createAudit: data => { tx.create(ref('verificationAudit', data.eventId), encode(data)); },
      });
    }),
  };
}
