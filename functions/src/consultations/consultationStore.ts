import { Timestamp, type Firestore, type DocumentData, type Transaction } from 'firebase-admin/firestore';
import type { DomainTimestamp, DoctorProfile } from '../../../shared/types/profiles';
import type { VerificationRequest } from '../../../shared/types/verification';
import { fail } from '../profiles/domainValidation';
import { validateAppointment } from '../scheduling/validation';
import { validateConsultation } from './domain';
import type { ConsultationDependencies, ConsultationTransaction } from './openHandler';
function decode(value: unknown): DomainTimestamp {
  if (!(value instanceof Timestamp)) return fail('stored-timestamp');
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
const encode = (value: DomainTimestamp) => new Timestamp(value.seconds, value.nanoseconds);
function audit(data: DocumentData) {
  const out = { ...data };
  for (const field of ['createdAt', 'updatedAt', 'submittedAt', 'reviewedAt', 'publishedAt', 'invalidatedAt'])
    if (field in out && out[field] !== null) out[field] = decode(out[field]);
  return out;
}
/** Inject a Firestore instance; this module never initializes Firebase. */
export function createConsultationStore(db: Firestore): ConsultationDependencies {
  return {
    now: () => decode(Timestamp.now()),
    transact: action => db.runTransaction(tx => action(consultationTransaction(db, tx))),
  };
}
/** Shared transaction adapter; opening and sending use identical authoritative readers. */
export function consultationTransaction(db: Firestore, tx: Transaction): ConsultationTransaction {
      const ref = (collection: string, id: string) => db.collection(collection).doc(id);
      const read = async (collection: string, id: string) => (await tx.get(ref(collection, id))).data() ?? null;
      async function readAudit<T>(collection: string, id: string): Promise<T | null> {
        const data = await read(collection, id); return data ? audit(data) as T : null;
      }
      return {
        identity: uid => read('users', uid),
        profile: uid => readAudit<DoctorProfile>('doctorProfiles', uid),
        publicProfile: uid => readAudit('doctorPublicProfiles', uid),
        verification: id => readAudit<VerificationRequest>('verificationRequests', id),
        appointment: async id => {
          const data = await read('appointments', id); if (!data) return null;
          const decoded = { ...audit(data), startAt: decode(data.startAt), endAt: decode(data.endAt) } as DocumentData;
          if (data.cancellation) decoded.cancellation = { ...data.cancellation, cancelledAt: decode(data.cancellation.cancelledAt) };
          if (data.outcome) decoded.outcome = { ...data.outcome, recordedAt: decode(data.outcome.recordedAt) };
          const value = validateAppointment(decoded);
          if (value.appointmentId !== id) fail('appointment-document-binding');
          return value;
        },
        consultation: async id => {
          const data = await read('consultations', id); if (!data) return null;
          const value = validateConsultation({ ...data, appointmentStartAt: decode(data.appointmentStartAt),
            appointmentEndAt: decode(data.appointmentEndAt), createdAt: decode(data.createdAt),
            closedAt: data.closedAt === null ? null : decode(data.closedAt) });
          if (value.consultationId !== id) fail('consultation-document-binding');
          return value;
        },
        create: value => {
          const c = validateConsultation(value); if (c.state !== 'active') fail('creation-state');
          tx.create(ref('consultations', c.consultationId), { ...c, appointmentStartAt: encode(c.appointmentStartAt),
            appointmentEndAt: encode(c.appointmentEndAt), createdAt: encode(c.createdAt), closedAt: null });
        },
        close: value => {
          const c = validateConsultation(value); if (c.state !== 'closed') fail('closure-state');
          // Update only lifecycle fields, preserving immutable snapshots byte-for-byte.
          tx.update(ref('consultations', c.consultationId), { state: 'closed', closedAt: encode(c.closedAt) });
        },
      };
}
