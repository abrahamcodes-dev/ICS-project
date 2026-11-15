import {durationMinutes} from './durations';
import { validateApprovedDoctorBinding } from './approvalBinding';
import { HttpsError } from 'firebase-functions/v2/https';
import type { DoctorProfile, DomainTimestamp } from '../../../shared/types/profiles';
import type { VerificationRequest } from '../../../shared/types/verification';
import type { Appointment, AppointmentDoctorDisplay, BookingLock, AvailabilityDiscoveryInput, AvailabilityDiscoveryResult, AvailabilityReplacementResult, DoctorAvailability } from '../../../shared/types/scheduling';
import { createAuthorization, requireAuthenticated } from '../shared/authorization';
import { DomainValidationError, fail, safeId, strictRecord } from '../profiles/domainValidation';
import { validateDoctorProfile, validateRequest } from '../profiles/verificationPolicy';
import { SCHEDULING } from './constants';
import { availabilityId } from './ids';
import { deriveSlots } from './intervals';
import { assertBookableStart, compareTimes, dateStart, schedulingTimestamp, toMilliseconds, utcDate } from './primitives';
import { planAvailabilityReplacement } from './policy';
import { validateAvailability, validateAvailabilityInput } from './validation';
import { assertCoverage, readDayReservations, readDoctorReservation } from './reservationGuards';
import type { AvailabilityBatchResult, AvailabilityReplacementInput } from '../../../shared/types/scheduling';

/** Shared scheduling transaction boundary: all reads precede every write. */
export interface AvailabilityTransaction {
  isResourceBusy?(role:'doctor'|'patient',uid:string,start:number,end:number,ignoreReservationId?:string):Promise<boolean>;
  cellReservation?(doctorId:string,cell:number):Promise<string|null>;
  heldReservation?(doctorId:string,cell:number):Promise<Appointment|null>;
  prepareCellRelease?(appointment:Appointment):Promise<()=>void>;
  paymentHold?(id: string): Promise<Appointment | null>;
  requireFreeBooking?(doctorId: string): Promise<void>;
  prepareCancellation?(appointment: Appointment): Promise<() => void>;
  identity(uid: string): Promise<unknown>;
  profile(uid: string): Promise<DoctorProfile | null>;
  publicProfile(uid: string): Promise<unknown>;
  verification(id: string): Promise<VerificationRequest | null>;
  availability(id: string): Promise<DoctorAvailability | null>;
  appointment(id: string): Promise<Appointment | null>;
  lock(id: string): Promise<BookingLock | null>;
  createAppointment(value: Appointment): void;
  createLock(id: string, value: BookingLock): void;
  saveTerminalAppointment(value: Appointment): void;
  deleteLock(id: string): void;
  saveAvailability(id: string, value: DoctorAvailability): void;
}
export interface AvailabilityDependencies {
  now(): DomainTimestamp;
  transact<T>(action: (tx: AvailabilityTransaction) => Promise<T>): Promise<T>;
}
type Request = { auth?: { uid: string }; data: unknown };
export async function authorize<T>(action: Promise<T>, deny: () => never): Promise<T> {
  try { return await action; }
  catch (error) {
    if (error instanceof DomainValidationError || (error instanceof HttpsError && error.code === 'permission-denied')) return deny();
    // Preserve transient storage errors so Firestore can retry the transaction.
    throw error;
  }
}

export function validateDiscoveryInput(value: unknown): AvailabilityDiscoveryInput {
  const keys = ['doctorId', 'fromDate', 'days','durationMinutes'];
  const data = strictRecord(value, keys, ['doctorId','fromDate','days']);
  if (!Number.isSafeInteger(data.days) || (data.days as number) < 1 || (data.days as number) > SCHEDULING.maxDiscoveryDays)
    fail('invalid-discovery-days');
  return {doctorId:safeId(data.doctorId),fromDate:utcDate(data.fromDate),days:data.days as number,...(data.durationMinutes!==undefined?{durationMinutes:durationMinutes(data.durationMinutes)}:{})};
}

export async function approvedDoctor(tx: Pick<AvailabilityTransaction, 'identity' | 'profile' | 'publicProfile' | 'verification'>, uid: string): Promise<AppointmentDoctorDisplay> {
  await createAuthorization(id => tx.identity(id)).requireApprovedDoctor({ uid });
  const profile = await tx.profile(uid);
  if (!profile) fail('missing-doctor-profile');
  validateDoctorProfile(profile);
  const fields = ['uid', 'professionalName', 'specialty', 'approvedRevision', 'approvedRequestId', 'schemaVersion', 'publishedAt', 'updatedAt'];
  const projection = strictRecord(await tx.publicProfile(uid), fields, fields);
  const requestId = safeId(projection.approvedRequestId);
  const source = await tx.verification(requestId);
  if (!source) fail('missing-approved-source');
  validateRequest(source);
  return validateApprovedDoctorBinding(uid, profile, projection, source);
}

export function createAvailabilityHandlers(deps: AvailabilityDependencies) {
  // Errors from storage or unexpected SDK failures are never returned verbatim.
  async function execute<T>(action: (tx: AvailabilityTransaction, deny: () => never) => Promise<T>): Promise<T> {
    const safeErrors = new Set<Error>();
    const deny = (): never => {
      const error = new HttpsError('permission-denied', 'Active authorized identity and approved doctor required.');
      safeErrors.add(error); throw error;
    };
    try { return await deps.transact(tx => action(tx, deny)); }
    catch (error) {
      if (error instanceof Error && safeErrors.has(error)) throw error;
      if (error instanceof DomainValidationError) throw new HttpsError('failed-precondition', 'Scheduling state or date range does not permit this operation.');
      throw new HttpsError('internal', 'Scheduling operation failed. Please retry later.');
    }
  }
  async function replaceDays(uid: string, inputs: AvailabilityReplacementInput[]): Promise<AvailabilityBatchResult> {
    return execute(async (tx, deny) => {
      await authorize(approvedDoctor(tx, uid), deny);
      // Read every partition and reservation before planning or queuing any write.
      const states = [];
      for (const input of inputs) {
        const id = availabilityId(uid, input.utcDate), existing = await tx.availability(id);
        const reservations = await readDayReservations(tx, uid, input.utcDate);
        for (const appointment of reservations) {
          if (!existing) fail('missing-reserved-availability');
          assertCoverage(appointment, existing);
        }
        states.push({ input, id, existing, reservations });
      }
      const now = deps.now(); // Refreshed after reads on every transaction retry.
      const plans = states.map(state => {
        const plan = planAvailabilityReplacement(uid, state.existing, state.input, now);
        for (const appointment of state.reservations) assertCoverage(appointment, plan.availability);
        return { ...state, ...plan };
      });
      for (const plan of plans) if (plan.changed) tx.saveAvailability(plan.id, plan.availability);
      return { days: plans.map(plan => ({ utcDate: plan.input.utcDate, availabilityId: plan.id,
        revision: plan.availability.revision, changed: plan.changed })) };
    });
  }
  return {
    async replaceMany(request: Request): Promise<AvailabilityBatchResult> {
      const uid = requireAuthenticated(request.auth);
      let inputs: AvailabilityReplacementInput[];
      try {
        safeId(uid);
        const data = strictRecord(request.data, ['days'], ['days']);
        if (!Array.isArray(data.days) || data.days.length < 1 || data.days.length > 3) fail('invalid-day-count');
        inputs = (data.days as unknown[]).map(validateAvailabilityInput);
        for (let i = 1; i < inputs.length; i++)
          if (dateStart(inputs[i].utcDate) !== dateStart(inputs[i - 1].utcDate) + SCHEDULING.utcDayMs) fail('nonconsecutive-days');
      } catch { throw new HttpsError('invalid-argument', 'Supply one through three consecutive UTC-day replacements.'); }
      return replaceDays(uid, inputs);
    },
    async replace(request: Request): Promise<AvailabilityReplacementResult> {
      const uid = requireAuthenticated(request.auth);
      let input;
      try { safeId(uid); input = validateAvailabilityInput(request.data); }
      catch { throw new HttpsError('invalid-argument', 'Supply a valid availability replacement.'); }
      const { days } = await replaceDays(uid, [input]);
      const { utcDate: _date, ...result } = days[0];
      return result;
    },
    async discover(request: Request): Promise<AvailabilityDiscoveryResult> {
      const uid = requireAuthenticated(request.auth);
      let input: AvailabilityDiscoveryInput;
      try { safeId(uid); input = validateDiscoveryInput(request.data); }
      catch { throw new HttpsError('invalid-argument', 'Supply doctorId, a UTC fromDate and 1 through 7 days.'); }
      return execute(async (tx, deny) => {
        const identity = await authorize(createAuthorization(id => tx.identity(id)).requireActive({ uid }), deny);
        if (identity.role !== 'patient') deny();
        await authorize(approvedDoctor(tx, input.doctorId), deny);
        const first = dateStart(input.fromDate);
        const days = Array.from({ length: input.days }, (_, i) => utcDate(new Date(first + i * SCHEDULING.utcDayMs).toISOString().slice(0, 10)));
        const documents: { id: string; day: string; value: DoctorAvailability | null }[] = [];
        for (const day of days) {
          const id = availabilityId(input.doctorId, day);
          documents.push({ id, day, value: await tx.availability(id) });
        }
        const now = schedulingTimestamp(deps.now()), today = dateStart(new Date(now.seconds * 1000).toISOString().slice(0, 10));
        if (first < today || dateStart(days[days.length - 1]) > today + SCHEDULING.horizonDays * SCHEDULING.utcDayMs)
          fail('discovery-outside-horizon');
        const times: AvailabilityDiscoveryResult['times'] = [];
        const nextDate=new Date(first+input.days*SCHEDULING.utcDayMs).toISOString().slice(0,10);
        const afterLast=await tx.availability(availabilityId(input.doctorId,nextDate));
        if(afterLast&&(afterLast.doctorId!==input.doctorId||afterLast.utcDate!==nextDate))fail('availability-partition-binding');
        for (const { id, day, value } of documents) {
          if (!value) continue;
          const available = validateAvailability(value);
          if (available.doctorId !== input.doctorId || available.utcDate !== day) fail('availability-binding');
          for (const slot of deriveSlots(available.windows,day,durationMinutes(input.durationMinutes),(documents.find(d=>dateStart(d.day)===dateStart(day)+SCHEDULING.utcDayMs)?.value??(day===days[days.length-1]?afterLast:null))?.windows??[])) {
            const startAt = toMilliseconds(slot.startAt);
            try { assertBookableStart(startAt, now); }
            catch (error) { if (error instanceof DomainValidationError) continue; throw error; }
            if(await tx.isResourceBusy?.('doctor',input.doctorId,startAt,toMilliseconds(slot.endAt)))continue;
            const occupied = await readDoctorReservation(tx, input.doctorId, startAt);
            if (occupied) { assertCoverage(occupied, available); continue; }
            times.push({ doctorId: input.doctorId, startAt, endAt: toMilliseconds(slot.endAt), availabilityId: id, availabilityRevision: available.revision });
          }
        }
        // Advisory only: booking rechecks both doctor and patient locks transactionally.
        // Occupancy reads may take time. Reapply temporal limits at the end of this attempt.
        const finishedAt = schedulingTimestamp(deps.now());
        return { times: times.filter(time => {
          try { assertBookableStart(time.startAt, finishedAt); return true; }
          catch (error) { if (error instanceof DomainValidationError) return false; throw error; }
        }) };
      });
    },
  };
}
