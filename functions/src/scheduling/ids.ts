import { createHash } from 'crypto';
import { fail, safeId } from '../profiles/domainValidation';
import { alignedStart, bookingRequestId, utcDate } from './primitives';
import type { BookingResourceType } from '../../../shared/types/scheduling';

const digest = (tuple: readonly (string | number)[]) => createHash('sha256').update(JSON.stringify(tuple), 'utf8').digest('hex');
export function availabilityId(doctorId: string, day: string): string { return digest([safeId(doctorId), utcDate(day)]); }
export function appointmentId(patientId: string, requestId: string): string { return digest([safeId(patientId), bookingRequestId(requestId)]); }
export function resourceType(value: unknown): BookingResourceType {
  if (value !== 'doctor' && value !== 'patient') return fail('invalid-resource-type');
  return value;
}
export function bookingLockId(type: BookingResourceType, uid: string, start: number): string {
  return digest([resourceType(type), safeId(uid), alignedStart(start)]);
}
export function digestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return fail('invalid-deterministic-id');
  return value;
}
