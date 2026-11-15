import type { Appointment, BookingLock, DoctorAvailability } from '../../../shared/types/scheduling';
import type { AvailabilityTransaction } from './availabilityHandlers';
import { fail } from '../profiles/domainValidation';
import { SCHEDULING } from './constants';
import { availabilityId, bookingLockId } from './ids';
import { fitsAvailability } from './intervals';
import { dateStart, toMilliseconds,fromMilliseconds } from './primitives';
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
  let observedStart=start,value = await tx.lock(bookingLockId('doctor', doctorId, start));
  if(!value&&!tx.cellReservation){const previous=await tx.lock(bookingLockId('doctor',doctorId,start-SCHEDULING.slotIntervalMs));if(previous&&toMilliseconds(previous.startAt)<=start&&toMilliseconds(previous.endAt)>start){value=previous;observedStart=start-SCHEDULING.slotIntervalMs;}}
  if (!value){const id=await tx.cellReservation?.(doctorId,start);if(id){const a=await tx.appointment(id);if(!a||a.doctorId!==doctorId||a.status!=='scheduled')fail('cell-appointment-binding');await assertScheduledPair(tx,a);return a;}return tx.heldReservation?tx.heldReservation(doctorId,start):tx.paymentHold?tx.paymentHold(bookingLockId('doctor', doctorId, start)):null;}
  const lock = validateBookingLock(value);
  if (lock.resourceType !== 'doctor' || lock.resourceId !== doctorId || toMilliseconds(lock.startAt)!==observedStart||toMilliseconds(lock.endAt)<=start) fail('reservation-binding');
  const stored = await tx.appointment(lock.appointmentId);
  if (!stored) fail('orphan-reservation');
  const appointment = validateAppointment(stored);
  if (appointment.appointmentId !== lock.appointmentId || appointment.doctorId !== doctorId
    || toMilliseconds(appointment.startAt)!==toMilliseconds(lock.startAt) || appointment.status !== 'scheduled') fail('reservation-binding');
  await assertScheduledPair(tx, appointment, lock);
  return appointment;
}
export function assertCoverage(appointment: Appointment, availability: DoctorAvailability): void {
  const midnight=dateStart(availability.utcDate),start=toMilliseconds(appointment.startAt),end=toMilliseconds(appointment.endAt),first=new Date(start).toISOString().slice(0,10);
  const segment={startAt:fromMilliseconds(Math.max(start,midnight)),endAt:fromMilliseconds(Math.min(end,midnight+SCHEDULING.utcDayMs))};
  if (appointment.doctorId !== availability.doctorId || (first===availability.utcDate&&(appointment.availabilityId!==availabilityId(availability.doctorId,first)||appointment.availabilityRevision>availability.revision))
    || !fitsAvailability(segment, availability.windows, availability.utcDate))
    fail('reserved-coverage-required');
}
export async function assertFullCoverage(tx:AvailabilityTransaction,a:Appointment,initial?:DoctorAvailability){
 for(let day=Math.floor(toMilliseconds(a.startAt)/SCHEDULING.utcDayMs)*SCHEDULING.utcDayMs;day<toMilliseconds(a.endAt);day+=SCHEDULING.utcDayMs){const date=new Date(day).toISOString().slice(0,10),available=initial?.utcDate===date?initial:await tx.availability(availabilityId(a.doctorId,date));if(!available)fail('missing-covered-partition');if(available.doctorId!==a.doctorId||available.utcDate!==date)fail('availability-partition-binding');assertCoverage(a,available);}
}
export async function readDayReservations(tx: AvailabilityTransaction, doctorId: string, day: string): Promise<Appointment[]> {
  const reservations: Appointment[] = [], midnight = dateStart(day);
  for (let offset = 0; offset < SCHEDULING.utcDayMs; offset += SCHEDULING.slotIntervalMs) {
    const appointment = await readDoctorReservation(tx, doctorId, midnight + offset);
    if (appointment&&!reservations.some(a=>a.appointmentId===appointment.appointmentId)) reservations.push(appointment);
  }
  return reservations;
}
