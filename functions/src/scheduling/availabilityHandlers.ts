import { HttpsError } from 'firebase-functions/v2/https';
import type { DoctorProfile, DomainTimestamp } from '../../../shared/types/profiles';
import type { VerificationRequest } from '../../../shared/types/verification';
import type { Appointment, AppointmentDoctorDisplay, BookingLock, AvailabilityDiscoveryInput, AvailabilityDiscoveryResult, AvailabilityReplacementResult, DoctorAvailability } from '../../../shared/types/scheduling';
import { createAuthorization, requireAuthenticated } from '../shared/authorization';
import { DomainValidationError, fail, LIMITS, safeId, strictRecord, text } from '../profiles/domainValidation';
import { validateDoctorProfile, validateRequest } from '../profiles/verificationPolicy';
import { SCHEDULING } from './constants';
import { availabilityId } from './ids';
import { deriveSlots } from './intervals';
import { assertBookableStart, compareTimes, dateStart, positiveRevision, schedulingTimestamp, toMilliseconds, utcDate } from './primitives';
import { planAvailabilityReplacement } from './policy';
import { validateAvailability, validateAvailabilityInput } from './validation';
import { assertCoverage, readDayReservations, readDoctorReservation } from './reservationGuards';

/** Shared scheduling transaction boundary: all reads precede every write. */
export interface AvailabilityTransaction {
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
  const keys = ['doctorId', 'fromDate', 'days'];
  const data = strictRecord(value, keys, keys);
  if (!Number.isSafeInteger(data.days) || (data.days as number) < 1 || (data.days as number) > SCHEDULING.maxDiscoveryDays)
    fail('invalid-discovery-days');
  return { doctorId: safeId(data.doctorId), fromDate: utcDate(data.fromDate), days: data.days as number };
}

export async function approvedDoctor(tx: AvailabilityTransaction, uid: string): Promise<AppointmentDoctorDisplay> {
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
  const publishedAt = schedulingTimestamp(projection.publishedAt), updatedAt = schedulingTimestamp(projection.updatedAt);
  if (profile.uid !== uid || profile.activeRequestId !== null || profile.approvedRequestId !== requestId
    || projection.uid !== uid || projection.schemaVersion !== SCHEDULING.schemaVersion
    || positiveRevision(projection.approvedRevision) !== profile.revision
    || source.requestId !== requestId || source.doctorUid !== uid || source.state !== 'approved'
    || source.profileRevision !== profile.revision || source.reviewerUid === uid
    || compareTimes(updatedAt, publishedAt) < 0 || !source.reviewedAt || compareTimes(publishedAt, source.reviewedAt) !== 0
    || text(projection.professionalName, LIMITS.name) !== projection.professionalName
    || text(projection.specialty, LIMITS.specialty) !== projection.specialty
    || projection.professionalName !== source.professional.professionalName || projection.specialty !== source.professional.specialty
    || (['professionalName', 'specialty', 'registrationNumber', 'issuingAuthority'] as const)
      .some(key => profile[key] !== source.professional[key])) fail('invalid-approved-binding');
  return { professionalName: projection.professionalName as string, specialty: projection.specialty as string };
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
  return {
    async replace(request: Request): Promise<AvailabilityReplacementResult> {
      const uid = requireAuthenticated(request.auth);
      let input;
      try { safeId(uid); input = validateAvailabilityInput(request.data); }
      catch { throw new HttpsError('invalid-argument', 'Supply a valid availability replacement.'); }
      const id = availabilityId(uid, input.utcDate);
      return execute(async (tx, deny) => {
        await authorize(approvedDoctor(tx, uid), deny);
        const existing = await tx.availability(id);
        const reservations = await readDayReservations(tx, uid, input.utcDate);
        for (const appointment of reservations) {
          if (!existing) fail('missing-reserved-availability');
          assertCoverage(appointment, existing);
        }
        // Trusted time is refreshed on every transaction attempt, after reads.
        const plan = planAvailabilityReplacement(uid, existing, input, deps.now());
        for (const appointment of reservations) assertCoverage(appointment, plan.availability);
        if (plan.changed) tx.saveAvailability(id, plan.availability);
        return { availabilityId: id, revision: plan.availability.revision, changed: plan.changed };
      });
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
        for (const { id, day, value } of documents) {
          if (!value) continue;
          const available = validateAvailability(value);
          if (available.doctorId !== input.doctorId || available.utcDate !== day) fail('availability-binding');
          for (const slot of deriveSlots(available.windows, day)) {
            const startAt = toMilliseconds(slot.startAt);
            try { assertBookableStart(startAt, now); }
            catch (error) { if (error instanceof DomainValidationError) continue; throw error; }
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
