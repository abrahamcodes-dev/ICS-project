import {cellStarts,CELL_MS} from './durations';
import {occupiedCell,decodeLock} from './cellLocks';
import {bookingLockId} from './ids';
import {toMilliseconds} from './primitives';
import { Timestamp, type Firestore, type DocumentData, type Transaction } from 'firebase-admin/firestore';
import { cancellationRefund } from '../payments/ledger';
import { paymentHold } from '../payments/reservations';
import { writeEvent } from '../notifications/events';
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
    transact: action => db.runTransaction(tx => action(availabilityTransaction(db,tx))),
  };
}
export function availabilityTransaction(db:Firestore,tx:Transaction): import('./availabilityHandlers').AvailabilityTransaction {
      const ref = (collection: string, id: string) => db.collection(collection).doc(id);
      const docRef=(path:string)=>{const parts=path.split('/');return db.collection(parts.slice(0,-1).join('/')).doc(parts[parts.length-1]);};
      const cache=new Map<string,Promise<DocumentData|null>>();
      const raw=(path:string)=>{if(!cache.has(path))cache.set(path,tx.get(docRef(path)).then(s=>s.data()??null));return cache.get(path)!;};
      async function read(collection:string,id:string){return raw(collection+'/'+id);}
      async function held(role:'doctor'|'patient',uid:string,cell:number){for(const t of [cell,cell-CELL_MS]){const a=await paymentHold(db,tx,bookingLockId(role,uid,t),raw);if(a&&toMilliseconds(a.startAt)<=cell&&toMilliseconds(a.endAt)>cell)return a;}return null;}
      async function audit<T>(collection: string, id: string): Promise<T | null> {
        const data = await read(collection, id); return data ? decodeAudit(data) as T : null;
      }
      return {
        identity: uid => read('users', uid),
        paymentHold: id => paymentHold(db,tx,id,raw),
        cellReservation: async (uid,cell)=>{const lock=await occupiedCell(raw,'doctor',uid,cell);return lock?lock.appointmentId:null;},
        heldReservation: (uid,cell)=>held('doctor',uid,cell),
        isResourceBusy: async(role,uid,start,end,ignore)=>{for(const cell of cellStarts(start,end)){if(await occupiedCell(raw,role,uid,cell))return true;const a=await held(role,uid,cell);if(a&&a.appointmentId!==ignore)return true;}return false;},
        prepareCellRelease: async a=>{const paths:string[]=[];for(const role of ['doctor','patient'] as const)for(const cell of cellStarts(toMilliseconds(a.startAt),toMilliseconds(a.endAt))){const id=bookingLockId(role,role==='doctor'?a.doctorId:a.patientId,cell),r=await raw('schedulingCellLocks/'+id);if(r){const lock=decodeLock(r);if(lock.appointmentId!==a.appointmentId||lock.resourceType!==role||lock.resourceId!==(role==='doctor'?a.doctorId:a.patientId)||toMilliseconds(lock.startAt)!==toMilliseconds(a.startAt)||toMilliseconds(lock.endAt)!==toMilliseconds(a.endAt))fail('cell-release-owner');paths.push('schedulingCellLocks/'+id);}}return ()=>{for(const path of paths)tx.delete(docRef(path));};},
        requireFreeBooking: async doctorId => {const fee=await read('doctorFees',doctorId);if(!fee||fee.amountMinor!==0)fail('explicit-free-fee-required');},
        prepareCancellation: a => cancellationRefund(db,tx,a),
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
          for (const uid of [data.patientId, data.doctorId])
            writeEvent(db, tx, uid, 'booking', data.appointmentId, data.appointmentId, data.createdAt);
        },
        createLock: (id,value)=>{const lock=validateBookingLock(value),encoded=encodeScheduled(lock);tx.create(ref('bookingLocks',id),encoded);for(const cell of cellStarts(toMilliseconds(lock.startAt),toMilliseconds(lock.endAt)))tx.create(ref('schedulingCellLocks',bookingLockId(lock.resourceType,lock.resourceId,cell)),encoded);},
        saveTerminalAppointment: value => {
          const data = validateAppointment(value);
          if (data.status === 'scheduled') fail('terminal-state-required');
          tx.update(ref('appointments', data.appointmentId), { ...encodeScheduled(data), updatedAt: encodeTime(data.updatedAt),
            cancellation: data.cancellation ? { ...data.cancellation, cancelledAt: encodeTime(data.cancellation.cancelledAt) } : null,
            outcome: data.outcome ? { ...data.outcome, recordedAt: encodeTime(data.outcome.recordedAt) } : null });
          if (data.status === 'cancelled') for (const uid of [data.patientId, data.doctorId])
            writeEvent(db, tx, uid, 'cancellation', data.appointmentId, data.appointmentId, data.cancellation.cancelledAt);
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
      };
}
