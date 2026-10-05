import type { Appointment, BookingLock, DoctorAvailability, SchedulingActor } from '../../../shared/types/scheduling';
import type { DomainTimestamp } from '../../../shared/types/profiles';
import { fail, safeId, strictRecord } from '../profiles/domainValidation';
import { SCHEDULING } from './constants';
import { compareTimes, dateStart, fromMilliseconds, positiveRevision, schedulingTimestamp, toMilliseconds } from './primitives';
import { sameInterval } from './intervals';
import { appointmentId, bookingLockId } from './ids';
import { validateAppointment, validateAvailability, validateAvailabilityInput, validateBookingLock, validateBookingRequest, validateDecision } from './validation';

/** Pure plan only. Later transactions must additionally protect booked coverage and recheck canonical authorization. */
export function planAvailabilityReplacement(doctorId: string, existing: DoctorAvailability | null, input: unknown, trustedNow: DomainTimestamp) {
  safeId(doctorId);
  const data = validateAvailabilityInput(input), now = schedulingTimestamp(trustedNow);
  const today = new Date(now.seconds * 1000).toISOString().slice(0, 10), day = dateStart(data.utcDate);
  if (day < dateStart(today) || day > dateStart(today) + SCHEDULING.horizonDays * SCHEDULING.utcDayMs) fail('availability-outside-horizon');
  const before = existing === null ? null : validateAvailability(existing);
  if (before && (before.doctorId !== doctorId || before.utcDate !== data.utcDate || before.timeZone !== data.timeZone
    || compareTimes(now, before.updatedAt) < 0)) fail('availability-conflict');
  if (data.expectedRevision !== (before?.revision ?? 0)) fail('stale-revision');
  const windows = data.windows.map(w => ({ startAt: fromMilliseconds(w.startAt), endAt: fromMilliseconds(w.endAt) }));
  for (const previous of before?.windows ?? [])
    if (compareTimes(previous.startAt, now) <= 0 && !windows.some(w => sameInterval(w, previous))) fail('past-window-immutable');
  for (const next of windows)
    if (compareTimes(next.startAt, now) <= 0 && !before?.windows.some(w => sameInterval(w, next))) fail('past-window-immutable');
  if (before && before.windows.length === windows.length && before.windows.every((w, i) => sameInterval(w, windows[i])))
    return { availability: before, changed: false };
  const revision = positiveRevision((before?.revision ?? 0) + 1);
  return { availability: validateAvailability({ doctorId, utcDate: data.utcDate, timeZone: data.timeZone, windows, revision,
    schemaVersion: SCHEDULING.schemaVersion, createdAt: before?.createdAt ?? now, updatedAt: now }), changed: true };
}
/** Does not authorize. Matching terminal history returns as-is; callers must not recreate its reservations. */
export function matchBookingRetry(patientId: string, input: unknown, existing: Appointment | null): Appointment | null {
  safeId(patientId); const request = validateBookingRequest(input);
  if (existing === null) return null;
  const stored = validateAppointment(existing);
  if (stored.appointmentId !== appointmentId(patientId, request.bookingRequestId) || stored.patientId !== patientId
    || stored.doctorId !== request.doctorId || toMilliseconds(stored.startAt) !== request.startAt) fail('conflicting-booking-retry');
  return stored;
}
export function scheduledLocks(value: Appointment): readonly { lockId: string; lock: BookingLock }[] {
  const appointment = validateAppointment(value);
  if (appointment.status !== 'scheduled') return fail('terminal-reservation');
  return Object.freeze((['doctor', 'patient'] as const).map(type => {
    const uid = type === 'doctor' ? appointment.doctorId : appointment.patientId;
    return Object.freeze({ lockId: bookingLockId(type, uid, toMilliseconds(appointment.startAt)), lock: validateBookingLock({ resourceType: type,
      resourceId: uid, appointmentId: appointment.appointmentId, startAt: appointment.startAt, endAt: appointment.endAt,
      schemaVersion: SCHEDULING.schemaVersion, createdAt: appointment.createdAt }) });
  }));
}
/** Resolve only the two expected documents in the eventual transaction. Mismatches fail closed; never delete another owner. */
export function lockIdsToRelease(value: Appointment, observed: readonly BookingLock[]): readonly string[] {
  const expected = scheduledLocks(value);
  if (!Array.isArray(observed) || observed.length !== expected.length) return fail('inconsistent-reservations');
  const locks = Array.from(observed, validateBookingLock);
  for (const { lock } of expected) {
    const matches = locks.filter(found => found.resourceType === lock.resourceType && found.resourceId === lock.resourceId);
    if (matches.length !== 1 || matches[0].appointmentId !== lock.appointmentId
      || !sameInterval({ startAt: matches[0].startAt, endAt: matches[0].endAt }, { startAt: lock.startAt, endAt: lock.endAt })
      || compareTimes(matches[0].createdAt, lock.createdAt) !== 0) fail('inconsistent-reservations');
  }
  return Object.freeze(expected.map(entry => entry.lockId));
}
/** Actor category is trusted context from a future canonical-identity authorization layer, never public input. */
export function planAppointmentTransition(value: Appointment, actor: SchedulingActor, input: unknown, trustedNow: DomainTimestamp,
  observedLocks: readonly BookingLock[] = []) {
  const appointment = validateAppointment(value), decision = validateDecision(input), now = schedulingTimestamp(trustedNow);
  const context = strictRecord(actor, ['uid', 'role'], ['uid', 'role']), uid = safeId(context.uid);
  const participant = (context.role === 'patient' && uid === appointment.patientId) || (context.role === 'doctor' && uid === appointment.doctorId);
  if (!participant || (decision.status !== 'cancelled' && context.role !== 'doctor')) fail('invalid-lifecycle-actor');
  if (compareTimes(now, appointment.updatedAt) < 0) fail('lifecycle-clock');
  if (appointment.status !== 'scheduled') {
    const matches = appointment.status === decision.status && (appointment.status === 'cancelled'
      ? decision.status === 'cancelled' && appointment.cancellation.cancelledBy === uid && appointment.cancellation.reason === decision.reason
      : appointment.outcome.recordedBy === uid);
    if (!matches) fail('conflicting-terminal-decision');
    // An exact replay is not another transition and must not touch newly acquired reservations.
    return { appointment, changed: false, releaseLockIds: Object.freeze([] as string[]) };
  }
  if (decision.status === 'cancelled' ? compareTimes(now, appointment.startAt) >= 0 : compareTimes(now, appointment.endAt) < 0)
    fail('invalid-lifecycle-time');
  const releaseLockIds = lockIdsToRelease(appointment, observedLocks);
  const next = decision.status === 'cancelled'
    ? { ...appointment, status: decision.status, cancellation: { cancelledBy: uid, cancelledAt: now, reason: decision.reason ?? null }, outcome: null, updatedAt: now }
    : { ...appointment, status: decision.status, cancellation: null, outcome: { recordedBy: uid, recordedAt: now }, updatedAt: now };
  return { appointment: validateAppointment(next), changed: true, releaseLockIds };
}
