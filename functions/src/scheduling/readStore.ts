import { FieldPath, Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { SchedulingReadRunner } from './readHandlers';
import type { DoctorProfile } from '../../../shared/types/profiles';
import type { VerificationRequest } from '../../../shared/types/verification';
import { validateAvailability } from './validation';
import { fail } from '../profiles/domainValidation';

function audit(data: Record<string, any>) {
  const result = { ...data };
  for (const key of ['createdAt', 'updatedAt', 'publishedAt', 'submittedAt', 'reviewedAt', 'invalidatedAt']) {
    if (key in result && result[key] !== null) result[key] = time(result[key]);
  }
  return result;
}
function time(value: unknown) {
  if (!(value instanceof Timestamp)) return fail('stored-timestamp');
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
export function createSchedulingReadStore(db: Firestore): SchedulingReadRunner {
  return action => db.runTransaction(async tx => {
    async function read(collection: string, id: string) {
      return (await tx.get(db.collection(collection).doc(id))).data() ?? null;
    }
    async function document<T>(collection: string, id: string): Promise<T | null> {
      const value = await read(collection, id); return value ? audit(value) as T : null;
    }
    return action({
      identity: uid => read('users', uid),
      profile: uid => document<DoctorProfile>('doctorProfiles', uid),
      publicProfile: uid => document('doctorPublicProfiles', uid),
      verification: id => document<VerificationRequest>('verificationRequests', id),
      availability: async id => {
        const value = await read('doctorAvailability', id);
        if (!value) return null;
        if (!Array.isArray(value.windows)) return fail('stored-windows');
        return validateAvailability({ ...audit(value), windows: value.windows.map(w => {
          if (!w || typeof w !== 'object') return fail('stored-window');
          return { ...w, startAt: time(w.startAt), endAt: time(w.endAt) };
        }) });
      },
      directory: async (limit, after) => {
        let query = db.collection('doctorPublicProfiles').orderBy(FieldPath.documentId()).limit(limit);
        if (after !== undefined) query = query.startAfter(after);
        return (await tx.get(query)).docs.map(doc => doc.id);
      },
    });
  }, { readOnly: true });
}
