import { HttpsError } from 'firebase-functions/v2/https';
import type { Appointment, BookingResult } from '../../../shared/types/scheduling';
import { createAuthorization, requireAuthenticated } from '../shared/authorization';
import { DomainValidationError, fail, safeId } from '../profiles/domainValidation';
import { approvedDoctor, authorize, type AvailabilityDependencies } from './availabilityHandlers';
import { appointmentId, availabilityId, bookingLockId } from './ids';
import { assertBookableStart, fromMilliseconds, schedulingTimestamp, toMilliseconds } from './primitives';
import { SCHEDULING } from './constants';
import { matchBookingRetry, scheduledLocks } from './policy';
import { validateAppointment, validateAvailability, validateBookingRequest } from './validation';
import { assertCoverage, assertScheduledPair } from './reservationGuards';

function response(appointment: Appointment, replayed: boolean): BookingResult {
  return { appointmentId: appointment.appointmentId, doctorId: appointment.doctorId,
    startAt: toMilliseconds(appointment.startAt), endAt: toMilliseconds(appointment.endAt), status: appointment.status, replayed };
}
export function createBookingHandler(deps: AvailabilityDependencies) {
  return async (request: { auth?: { uid: string }; data: unknown }): Promise<BookingResult> => {
    const uid = requireAuthenticated(request.auth);
    let input;
    try { safeId(uid); input = validateBookingRequest(request.data); }
    catch { throw new HttpsError('invalid-argument', 'Supply doctorId, aligned startAt and a canonical bookingRequestId.'); }
    const id = appointmentId(uid, input.bookingRequestId), day = new Date(input.startAt).toISOString().slice(0, 10);
    const availabilityKey = availabilityId(input.doctorId, day);
    const safeErrors = new Set<Error>();
    const reject = (code: 'permission-denied' | 'already-exists', message: string): never => {
      const error = new HttpsError(code, message); safeErrors.add(error); throw error;
    };
    const deny = () => reject('permission-denied', 'Active patient and approved doctor required.');
    try {
      return await deps.transact(async tx => {
        const patient = await authorize(createAuthorization(id => tx.identity(id)).requireActive({ uid }), deny);
        if (patient.role !== 'patient') deny();
        const display = await authorize(approvedDoctor(tx, input.doctorId), deny);
        const existing = matchBookingRetry(uid, input, await tx.appointment(id));
        if (existing) {
          if (existing.status === 'scheduled') {
            await assertScheduledPair(tx, existing);
            const availability = await tx.availability(availabilityKey);
            if (!availability) fail('missing-reserved-availability');
            assertCoverage(existing, validateAvailability(availability));
          }
          // Retry intent is patient + UUID-derived ID + doctor + start. No writes or new clock checks.
          // Terminal history never reads, recreates or deletes locks.
          return response(existing, true);
        }
        const stored = await tx.availability(availabilityKey);
        if (!stored) fail('missing-availability');
        const availability = validateAvailability(stored);
        if (availability.doctorId !== input.doctorId || availability.utcDate !== day) fail('availability-binding');
        const doctorLock = await tx.lock(bookingLockId('doctor', input.doctorId, input.startAt));
        const patientLock = await tx.lock(bookingLockId('patient', uid, input.startAt));
        if (doctorLock || patientLock) reject('already-exists', 'Scheduling conflict. Choose another time.');
        const now = schedulingTimestamp(deps.now());
        assertBookableStart(input.startAt, now);
        const appointment = validateAppointment({ appointmentId: id, patientId: uid, doctorId: input.doctorId,
          availabilityId: availabilityKey, availabilityRevision: availability.revision,
          startAt: fromMilliseconds(input.startAt), endAt: fromMilliseconds(input.startAt + SCHEDULING.appointmentDurationMs),
          doctorDisplay: display, status: 'scheduled', cancellation: null, outcome: null,
          schemaVersion: SCHEDULING.schemaVersion, createdAt: now, updatedAt: now });
        assertCoverage(appointment, availability);
        const locks = scheduledLocks(appointment);
        // All reads and complete document validation precede these three atomic creates.
        tx.createAppointment(appointment);
        for (const entry of locks) tx.createLock(entry.lockId, entry.lock);
        return response(appointment, false);
      });
    } catch (error) {
      if (error instanceof Error && safeErrors.has(error)) throw error;
      if (error instanceof DomainValidationError) throw new HttpsError('failed-precondition', 'Booking intent or scheduling state does not permit this operation.');
      throw new HttpsError('internal', 'Booking failed. Please retry later.');
    }
  };
}
