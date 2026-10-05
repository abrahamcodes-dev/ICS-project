import type { DomainTimestamp } from '../../../shared/types/profiles';
import { fail, strictRecord, timestamp } from '../profiles/domainValidation';
import { SCHEDULING, MIN_TIMESTAMP_MS, MAX_TIMESTAMP_MS } from './constants';

/** Pure boundary accepts exact structural maps. SDK adapters must explicitly project seconds/nanoseconds. */
export function schedulingTimestamp(value: unknown): DomainTimestamp {
  const data = strictRecord(value, ['seconds', 'nanoseconds'], ['seconds', 'nanoseconds']);
  return timestamp({ seconds: data.seconds as number, nanoseconds: data.nanoseconds as number });
}
export function epochMilliseconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < MIN_TIMESTAMP_MS || value > MAX_TIMESTAMP_MS)
    return fail('invalid-scheduling-instant');
  return value;
}
export function fromMilliseconds(value: unknown): DomainTimestamp {
  const ms = epochMilliseconds(value), seconds = Math.floor(ms / 1000);
  return timestamp({ seconds, nanoseconds: (ms - seconds * 1000) * 1000000 });
}
export function toMilliseconds(value: unknown): number {
  const time = schedulingTimestamp(value);
  if (time.nanoseconds % 1000000 !== 0) return fail('submillisecond-scheduling-instant');
  return epochMilliseconds(time.seconds * 1000 + time.nanoseconds / 1000000);
}
export function alignedStart(value: unknown): number {
  const ms = epochMilliseconds(value);
  if (ms % SCHEDULING.slotIntervalMs !== 0) return fail('unaligned-slot');
  return ms;
}
export function compareTimes(a: DomainTimestamp, b: DomainTimestamp): number {
  const x = schedulingTimestamp(a), y = schedulingTimestamp(b);
  return Math.sign(x.seconds - y.seconds) || Math.sign(x.nanoseconds - y.nanoseconds);
}
export function positiveRevision(value: unknown, allowZero = false): number {
  if (!Number.isSafeInteger(value) || (value as number) < (allowZero ? 0 : 1)) return fail('invalid-revision');
  return value as number;
}
export function utcDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail('invalid-utc-date');
  const ms = Date.parse(value + 'T00:00:00.000Z');
  epochMilliseconds(ms);
  if (new Date(ms).toISOString().slice(0, 10) !== value) return fail('invalid-utc-date');
  return value;
}
export function dateStart(value: unknown): number { return Date.parse(utcDate(value) + 'T00:00:00.000Z'); }
export function timeZone(value: unknown): string {
  // Reject ambiguous abbreviations and offset identifiers. Named IANA aliases are normalized by Node ICU.
  if (typeof value !== 'string' || value !== value.trim() || !(value === 'UTC' || /^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/.test(value)))
    return fail('invalid-timezone');
  try { return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone; }
  catch { return fail('invalid-timezone'); }
}
export function bookingRequestId(value: unknown): string {
  // Lowercase canonical RFC variant UUID, versions 1–8. Its only authority is caller-bound retry identity.
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))
    return fail('invalid-booking-request-id');
  return value;
}
export function assertBookableStart(value: unknown, trustedNow: DomainTimestamp): number {
  const start = alignedStart(value), now = schedulingTimestamp(trustedNow);
  // Compare whole seconds plus nanos without losing precision at large Timestamp values.
  const difference = fromMilliseconds(start).seconds - now.seconds;
  if (difference < SCHEDULING.bookingLeadMs / 1000
    || (difference === SCHEDULING.bookingLeadMs / 1000 && now.nanoseconds > 0)) fail('booking-too-soon');
  if (difference > SCHEDULING.horizonDays * SCHEDULING.utcDayMs / 1000) fail('booking-beyond-horizon');
  epochMilliseconds(start + SCHEDULING.appointmentDurationMs);
  return start;
}
