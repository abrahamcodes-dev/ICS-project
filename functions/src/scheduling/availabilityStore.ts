import { Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore';
import type { DomainTimestamp, DoctorProfile } from '../../../shared/types/profiles';
import type { VerificationRequest } from '../../../shared/types/verification';
import type { DoctorAvailability } from '../../../shared/types/scheduling';
import type { AvailabilityDependencies } from './availabilityHandlers';
import { fail } from '../profiles/domainValidation';
import { validateAppointment, validateAvailability, validateBookingLock } from './validation';

function decodeTime(value: unknown): DomainTimestamp {
  if (!(value instanceof Timestamp)) return fail('stored-timestamp');
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
const encodeTime = (value: DomainTimestamp) => new Timestamp(value.seconds, value.nanoseconds);
const auditFields = ['createdAt', 'updatedAt', 'submittedAt', 'reviewedAt', 'publishedAt', 'invalidatedAt'];
function decodeAudit(data: DocumentData): DocumentData {
  const result = { ...data };
  for (const field of auditFields) if (field in result && result[field] !== null) result[field] = decodeTime(result[field]);
  return result;
}
function decodeInterval(data: DocumentData): DocumentData {
  return { ...decodeAudit(data), startAt: decodeTime(data.startAt), endAt: decodeTime(data.endAt) };
}
function encodeScheduled(data: { startAt: DomainTimestamp; endAt: DomainTimestamp; createdAt: DomainTimestamp }): DocumentData {
  return { ...data, startAt: encodeTime(data.startAt), endAt: encodeTime(data.endAt), createdAt: encodeTime(data.createdAt) };
}
/** No SDK initialization; emulator tests inject a demo Firestore instance. */
export function createAvailabilityStore(db: Firestore): AvailabilityDependencies {
  return {
    now: () => decodeTime(Timestamp.now()),
    transact: action => db.runTransaction(async tx => {
      const ref = (collection: string, id: string) => db.collection(collection).doc(id);
      async function read(collection: string, id: string) { return (await tx.get(ref(collection, id))).data() ?? null; }
      async function audit<T>(collection: string, id: string): Promise<T | null> {
        const data = await read(collection, id); return data ? decodeAudit(data) as T : null;
      }
      return action({
        identity: uid => read('users', uid),
        profile: uid => audit<DoctorProfile>('doctorProfiles', uid),
        publicProfile: uid => audit('doctorPublicProfiles', uid),
        verification: id => audit<VerificationRequest>('verificationRequests', id),
        appointment: async id => {
          const data = await read('appointments', id);
          if (!data) return null;
          const decoded = decodeInterval(data);
          if (data.cancellation) decoded.cancellation = { ...data.cancellation, cancelledAt: decodeTime(data.cancellation.cancelledAt) };
          if (data.outcome) decoded.outcome = { ...data.outcome, recordedAt: decodeTime(data.outcome.recordedAt) };
          const appointment = validateAppointment(decoded);
          if (appointment.appointmentId !== id) fail('appointment-document-binding');
          return appointment;
        },
        lock: async id => {
          const data = await read('bookingLocks', id);
          return data ? validateBookingLock(decodeInterval(data)) : null;
        },
        createAppointment: value => {
          const data = validateAppointment(value);
          if (data.status !== 'scheduled') fail('creation-must-be-scheduled');
          tx.create(ref('appointments', data.appointmentId), { ...encodeScheduled(data), updatedAt: encodeTime(data.updatedAt) });
        },
        createLock: (id, value) => { tx.create(ref('bookingLocks', id), encodeScheduled(validateBookingLock(value))); },
        saveTerminalAppointment: value => {
          const data = validateAppointment(value);
          if (data.status === 'scheduled') fail('terminal-state-required');
          tx.update(ref('appointments', data.appointmentId), { ...encodeScheduled(data), updatedAt: encodeTime(data.updatedAt),
            cancellation: data.cancellation ? { ...data.cancellation, cancelledAt: encodeTime(data.cancellation.cancelledAt) } : null,
            outcome: data.outcome ? { ...data.outcome, recordedAt: encodeTime(data.outcome.recordedAt) } : null });
        },
        deleteLock: id => { tx.delete(ref('bookingLocks', id)); },
        availability: async id => {
          const data = await read('doctorAvailability', id);
          if (!data) return null;
          if (!Array.isArray(data.windows)) return fail('stored-windows');
          return validateAvailability({ ...decodeAudit(data), windows: data.windows.map(window => {
            if (!window || typeof window !== 'object') return fail('stored-window');
            return { ...window, startAt: decodeTime(window.startAt), endAt: decodeTime(window.endAt) };
          }) });
        },
        saveAvailability: (id: string, value: DoctorAvailability) => {
          const data = validateAvailability(value);
          tx.set(ref('doctorAvailability', id), { ...data, createdAt: encodeTime(data.createdAt), updatedAt: encodeTime(data.updatedAt),
            windows: data.windows.map(window => ({ startAt: encodeTime(window.startAt), endAt: encodeTime(window.endAt) })) });
        },
      });
    }),
  };
}
