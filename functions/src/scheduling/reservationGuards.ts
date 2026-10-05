import type { Appointment, BookingLock, DoctorAvailability } from '../../../shared/types/scheduling';
import type { AvailabilityTransaction } from './availabilityHandlers';
import { fail } from '../profiles/domainValidation';
import { SCHEDULING } from './constants';
import { availabilityId, bookingLockId } from './ids';
import { fitsAvailability } from './intervals';
import { dateStart, toMilliseconds } from './primitives';
import { lockIdsToRelease } from './policy';
import { validateAppointment, validateBookingLock } from './validation';

/** Validation only: this module never deletes or releases reservations. */
export async function assertScheduledPair(tx: AvailabilityTransaction, appointment: Appointment, doctorLock?: BookingLock): Promise<void> {
  const start = toMilliseconds(appointment.startAt);
  const doctor = doctorLock ?? await tx.lock(bookingLockId('doctor', appointment.doctorId, start));
  const patient = await tx.lock(bookingLockId('patient', appointment.patientId, start));
  if (!doctor || !patient) fail('missing-reservation');
  // Reuse the authoritative 4B exact pair/ownership invariant without applying a lifecycle change.
  lockIdsToRelease(appointment, [doctor, patient]);
}
export async function readDoctorReservation(tx: AvailabilityTransaction, doctorId: string, start: number): Promise<Appointment | null> {
  const value = await tx.lock(bookingLockId('doctor', doctorId, start));
  if (!value) return null;
  const lock = validateBookingLock(value);
  if (lock.resourceType !== 'doctor' || lock.resourceId !== doctorId || toMilliseconds(lock.startAt) !== start) fail('reservation-binding');
  const stored = await tx.appointment(lock.appointmentId);
  if (!stored) fail('orphan-reservation');
  const appointment = validateAppointment(stored);
  if (appointment.appointmentId !== lock.appointmentId || appointment.doctorId !== doctorId
    || toMilliseconds(appointment.startAt) !== start || appointment.status !== 'scheduled') fail('reservation-binding');
  await assertScheduledPair(tx, appointment, lock);
  return appointment;
}
export function assertCoverage(appointment: Appointment, availability: DoctorAvailability): void {
  if (appointment.doctorId !== availability.doctorId || appointment.availabilityId !== availabilityId(availability.doctorId, availability.utcDate)
    || appointment.availabilityRevision > availability.revision
    || !fitsAvailability({ startAt: appointment.startAt, endAt: appointment.endAt }, availability.windows, availability.utcDate))
    fail('reserved-coverage-required');
}
export async function readDayReservations(tx: AvailabilityTransaction, doctorId: string, day: string): Promise<Appointment[]> {
  const reservations: Appointment[] = [], midnight = dateStart(day);
  for (let offset = 0; offset < SCHEDULING.utcDayMs; offset += SCHEDULING.slotIntervalMs) {
    const appointment = await readDoctorReservation(tx, doctorId, midnight + offset);
    if (appointment) reservations.push(appointment);
  }
  return reservations;
}
