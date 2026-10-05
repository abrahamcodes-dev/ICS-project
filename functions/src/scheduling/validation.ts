import type { Appointment, AppointmentDecision, BookingLock, BookingRequest, DoctorAvailability, AvailabilityReplacementInput } from '../../../shared/types/scheduling';
import { fail, LIMITS, safeId, strictRecord, text } from '../profiles/domainValidation';
import { SCHEDULING } from './constants';
import { alignedStart, bookingRequestId, compareTimes, fromMilliseconds, positiveRevision, schedulingTimestamp, timeZone, toMilliseconds, utcDate } from './primitives';
import { availabilityWindows, interval } from './intervals';
import { availabilityId, digestId, resourceType } from './ids';

export function validateBookingRequest(value: unknown): BookingRequest {
  const data = strictRecord(value, ['doctorId', 'startAt', 'bookingRequestId'], ['doctorId', 'startAt', 'bookingRequestId']);
  const startAt = alignedStart(data.startAt); fromMilliseconds(startAt + SCHEDULING.appointmentDurationMs);
  return Object.freeze({ doctorId: safeId(data.doctorId), startAt, bookingRequestId: bookingRequestId(data.bookingRequestId) });
}
export function validateAvailabilityInput(value: unknown): AvailabilityReplacementInput {
  const fields = ['utcDate', 'timeZone', 'windows', 'expectedRevision'];
  const data = strictRecord(value, fields, fields), day = utcDate(data.utcDate), zone = timeZone(data.timeZone);
  if (!Array.isArray(data.windows) || data.windows.length > SCHEDULING.maxWindowsPerUtcDay) return fail('invalid-windows');
  const windows = [];
  for (let i = 0; i < data.windows.length; i++) {
    const window = strictRecord(data.windows[i], ['startAt', 'endAt'], ['startAt', 'endAt']);
    windows.push({ startAt: fromMilliseconds(window.startAt), endAt: fromMilliseconds(window.endAt) });
  }
  return { utcDate: day, timeZone: zone, expectedRevision: positiveRevision(data.expectedRevision, true),
    windows: availabilityWindows(windows, day).map(w => ({ startAt: toMilliseconds(w.startAt), endAt: toMilliseconds(w.endAt) })) };
}
export function validateAvailability(value: unknown): DoctorAvailability {
  const fields = ['doctorId', 'utcDate', 'timeZone', 'windows', 'revision', 'schemaVersion', 'createdAt', 'updatedAt'];
  const data = strictRecord(value, fields, fields);
  const doctorId = safeId(data.doctorId), day = utcDate(data.utcDate), zone = timeZone(data.timeZone);
  const createdAt = schedulingTimestamp(data.createdAt), updatedAt = schedulingTimestamp(data.updatedAt);
  if (data.schemaVersion !== SCHEDULING.schemaVersion || zone !== data.timeZone || compareTimes(updatedAt, createdAt) < 0) fail('invalid-availability');
  return Object.freeze({ doctorId, utcDate: day, timeZone: zone, windows: availabilityWindows(data.windows, day),
    revision: positiveRevision(data.revision), schemaVersion: SCHEDULING.schemaVersion, createdAt, updatedAt });
}
export function cancellationReason(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return fail('invalid-reason');
  if (!value.trim()) return null;
  return text(value, SCHEDULING.cancellationReasonMax);
}
export function validateDecision(value: unknown): AppointmentDecision {
  const data = strictRecord(value, ['status', 'reason'], ['status']);
  if (data.status === 'cancelled') return Object.freeze({ status: 'cancelled', reason: cancellationReason(data.reason) });
  if ((data.status === 'completed' || data.status === 'no_show') && !Object.prototype.hasOwnProperty.call(data, 'reason'))
    return Object.freeze({ status: data.status });
  return fail('invalid-appointment-decision');
}
export function validateAppointment(value: unknown): Appointment {
  const fields = ['appointmentId', 'patientId', 'doctorId', 'availabilityId', 'availabilityRevision', 'startAt', 'endAt',
    'doctorDisplay', 'status', 'cancellation', 'outcome', 'schemaVersion', 'createdAt', 'updatedAt'];
  const data = strictRecord(value, fields, fields);
  const patientId = safeId(data.patientId), doctorId = safeId(data.doctorId);
  const times = interval({ startAt: data.startAt, endAt: data.endAt }), start = alignedStart(toMilliseconds(times.startAt));
  if (toMilliseconds(times.endAt) - start !== SCHEDULING.appointmentDurationMs || patientId === doctorId) fail('invalid-appointment');
  const day = new Date(start).toISOString().slice(0, 10);
  if (data.availabilityId !== availabilityId(doctorId, day) || data.schemaVersion !== SCHEDULING.schemaVersion) fail('invalid-appointment');
  const display = strictRecord(data.doctorDisplay, ['professionalName', 'specialty'], ['professionalName', 'specialty']);
  const professionalName = text(display.professionalName, LIMITS.name), specialty = text(display.specialty, LIMITS.specialty);
  if (professionalName !== display.professionalName || specialty !== display.specialty) fail('unnormalized-doctor-display');
  const createdAt = schedulingTimestamp(data.createdAt), updatedAt = schedulingTimestamp(data.updatedAt);
  if (compareTimes(updatedAt, createdAt) < 0 || compareTimes(createdAt, times.startAt) >= 0) fail('invalid-appointment-time');
  const base = { appointmentId: digestId(data.appointmentId), patientId, doctorId, availabilityId: data.availabilityId as string,
    availabilityRevision: positiveRevision(data.availabilityRevision), ...times, doctorDisplay: Object.freeze({ professionalName, specialty }),
    schemaVersion: SCHEDULING.schemaVersion, createdAt, updatedAt };
  if (data.status === 'scheduled' && data.cancellation === null && data.outcome === null && compareTimes(updatedAt, createdAt) === 0)
    return Object.freeze({ ...base, status: 'scheduled', cancellation: null, outcome: null });
  if (data.status === 'cancelled' && data.outcome === null) {
    const cancellation = strictRecord(data.cancellation, ['cancelledBy', 'cancelledAt', 'reason'], ['cancelledBy', 'cancelledAt', 'reason']);
    const cancelledBy = safeId(cancellation.cancelledBy), cancelledAt = schedulingTimestamp(cancellation.cancelledAt), reason = cancellationReason(cancellation.reason);
    if (![patientId, doctorId].includes(cancelledBy) || reason !== cancellation.reason || compareTimes(cancelledAt, createdAt) < 0
      || compareTimes(cancelledAt, times.startAt) >= 0 || compareTimes(updatedAt, cancelledAt) !== 0) fail('invalid-cancellation');
    return Object.freeze({ ...base, status: 'cancelled', cancellation: Object.freeze({ cancelledBy, cancelledAt, reason }), outcome: null });
  }
  if ((data.status === 'completed' || data.status === 'no_show') && data.cancellation === null) {
    const outcome = strictRecord(data.outcome, ['recordedBy', 'recordedAt'], ['recordedBy', 'recordedAt']);
    const recordedBy = safeId(outcome.recordedBy), recordedAt = schedulingTimestamp(outcome.recordedAt);
    if (recordedBy !== doctorId || compareTimes(recordedAt, times.endAt) < 0 || compareTimes(updatedAt, recordedAt) !== 0) fail('invalid-outcome');
    return Object.freeze({ ...base, status: data.status, cancellation: null, outcome: Object.freeze({ recordedBy, recordedAt }) });
  }
  return fail('invalid-appointment-state');
}
export function validateBookingLock(value: unknown): BookingLock {
  const fields = ['resourceType', 'resourceId', 'appointmentId', 'startAt', 'endAt', 'schemaVersion', 'createdAt'];
  const data = strictRecord(value, fields, fields), times = interval({ startAt: data.startAt, endAt: data.endAt });
  const start = alignedStart(toMilliseconds(times.startAt)), createdAt = schedulingTimestamp(data.createdAt);
  if (data.schemaVersion !== SCHEDULING.schemaVersion || toMilliseconds(times.endAt) - start !== SCHEDULING.appointmentDurationMs
    || compareTimes(createdAt, times.startAt) >= 0) fail('invalid-booking-lock');
  return Object.freeze({ resourceType: resourceType(data.resourceType), resourceId: safeId(data.resourceId), appointmentId: digestId(data.appointmentId),
    ...times, schemaVersion: SCHEDULING.schemaVersion, createdAt });
}
