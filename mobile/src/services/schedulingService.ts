import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { uuid } from 'expo-modules-core';
import { auth, functions } from './firebaseConfig';
import type { ApprovedDoctor, DoctorDirectoryPage, OwnAvailabilityResult } from '@shared/types/schedulingReads';
import type { AvailabilityReplacementInput, AvailabilityReplacementResult, AvailableAppointmentTime,
  AvailabilityDiscoveryResult, BookingResult, AppointmentLifecycleResult } from '@shared/types/scheduling';
import type {AvailabilityBatchInput,AvailabilityBatchResult} from '@shared/types/scheduling';

export const GRID_MS=15*60*1000;
export const SLOT_MS = 30 * 60 * 1000, DAY_MS = 86400000;
const invalid = (): never => { throw new Error('Invalid scheduling response or input.'); };
function record(value: any, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) invalid();
  return value;
}
export function schedulingId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 128 || value.trim() !== value
    || /[/\\\u0000-\u001f\u007f]|%2f|%5c/i.test(value) || value === '.' || value === '..') invalid();
  return value as string;
}
const digest = (value: any) => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid(); return value as string; };
const positive = (value: any) => { if (!Number.isSafeInteger(value) || value < 1) invalid(); return value as number; };
function millis(value: any) {
  if (!Number.isSafeInteger(value) || value < -62135596800000 || value > 253402300799999) invalid();
  return value as number;
}
export function utcDayStart(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return invalid();
  const time = Date.parse(day + 'T00:00:00Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day) return invalid();
  return time;
}
export function localDate(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function localDateRange(day: string) {
  utcDayStart(day);
  const start = new Date(day + 'T00:00:00');
  if (localDate(start.getTime()) !== day) return invalid();
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}
export function discoveryPartitions(day: string, now = Date.now()) {
  const range = localDateRange(day), today = utcDayStart(new Date(now).toISOString().slice(0, 10));
  const first = Math.max(Math.floor(range.start / DAY_MS) * DAY_MS, today);
  const last = Math.min(Math.floor((range.end - 1) / DAY_MS) * DAY_MS, today + 90 * DAY_MS);
  return first > last ? null : { fromDate: new Date(first).toISOString().slice(0, 10), days: (last - first) / DAY_MS + 1, ...range };
}
export function validateWindows(day: string, windows: Array<{ startAt: number; endAt: number }>) {
  const start = utcDayStart(day);
  if (!Array.isArray(windows) || windows.length > 8) invalid();
  windows.forEach((w, i) => {
    record(w, ['startAt', 'endAt']); millis(w.startAt); millis(w.endAt);
    if (w.startAt % GRID_MS || w.endAt % GRID_MS || w.startAt < start || w.endAt > start + DAY_MS
      || w.endAt - w.startAt < GRID_MS || (i > 0 && windows[i - 1].endAt > w.startAt)) invalid();
  });
  return windows;
}
export function windowInputs(day: string, rows: Array<{ start: string; end: string }>) {
  const base = utcDayStart(day);
  const parse = (value: string, end: boolean) => {
    if (end && value === '24:00') return base + DAY_MS;
    if (!/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(value)) return invalid();
    const [h, m] = value.split(':').map(Number); return base + (h * 60 + m) * 60000;
  };
  return validateWindows(day, rows.map(r => ({ startAt: parse(r.start, false), endAt: parse(r.end, true) })).sort((a, b) => a.startAt - b.startAt));
}
export function schedulingError(error: unknown) {
  const code = (error as { code?: string })?.code || '';
  if (/already-exists/.test(code)) return 'That time conflicts with an existing booking. Refresh available times and choose again.';
  if (/permission-denied|unauthenticated/.test(code)) return 'Your account or this doctor is no longer eligible. Refresh or sign in again.';
  if (/failed-precondition/.test(code)) return 'Scheduling data, timing or revision changed. Reload before trying again; booked and started windows must be preserved.';
  if (/invalid-argument/.test(code)) return 'Check the date, times and entered information.';
  return 'Unable to confirm the result. Check your connection. A submitted change may have succeeded; refresh or retry the same request.';
}
export function createSchedulingSession(uid: string, makeId = () => uuid.v4()) {
  schedulingId(uid);
  let disposed = false, stop = () => {}, booking: { doctorId: string; startAt: number; bookingRequestId: string;durationMinutes?:15|30|60 } | null = null;
  let pendingBooking: Promise<BookingResult> | null = null;
  function check() { if (disposed || auth.currentUser?.uid !== uid) throw new Error('Scheduling session ended.'); }
  function dispose() { disposed = true; booking = null; stop(); }
  stop = onAuthStateChanged(auth, user => { if (user?.uid !== uid) dispose(); });
  async function call<T>(name: string, input: unknown): Promise<T> {
    check(); const response = await httpsCallable<unknown, T>(functions, name)(input); check(); return response.data;
  }
  return {
    dispose,
    async listDoctors(after?: string): Promise<DoctorDirectoryPage> {
      if (after !== undefined) schedulingId(after);
      const data = record(await call<DoctorDirectoryPage>('listApprovedDoctors', { limit: 10, ...(after ? { after } : {}) }), ['items', 'nextCursor']);
      if (!Array.isArray(data.items) || data.items.length > 10) invalid();
      const items: ApprovedDoctor[] = data.items.map((d: any) => {
        record(d, ['uid', 'professionalName', 'specialty']); schedulingId(d.uid);
        if (typeof d.professionalName !== 'string' || !d.professionalName.trim() || d.professionalName.length > 200
          || typeof d.specialty !== 'string' || !d.specialty.trim() || d.specialty.length > 120) invalid();
        return { uid: d.uid, professionalName: d.professionalName, specialty: d.specialty };
      });
      if (new Set(items.map(d => d.uid)).size !== items.length) invalid();
      if (data.nextCursor !== null) { schedulingId(data.nextCursor); if (data.nextCursor === after) invalid(); }
      return { items, nextCursor: data.nextCursor };
    },
    async ownDay(utcDate: string): Promise<OwnAvailabilityResult> {
      utcDayStart(utcDate);
      const data = record(await call<OwnAvailabilityResult>('getOwnDoctorAvailabilityDay', { utcDate }), ['day']);
      if (data.day === null) return { day: null };
      const day = record(data.day, ['utcDate', 'timeZone', 'revision', 'windows']);
      if (day.utcDate !== utcDate || typeof day.timeZone !== 'string') invalid();
      try { new Intl.DateTimeFormat('en', { timeZone: day.timeZone }); } catch { invalid(); }
      positive(day.revision); validateWindows(utcDate, day.windows);
      return { day };
    },
    async replace(input: AvailabilityReplacementInput) {
      validateWindows(input.utcDate, input.windows);
      const result = record(await call<AvailabilityReplacementResult>('replaceDoctorAvailabilityDay', input), ['availabilityId', 'revision', 'changed']);
      digest(result.availabilityId); positive(result.revision); if (typeof result.changed !== 'boolean') invalid();
      return result as AvailabilityReplacementResult;
    },
    async replaceMany(input: AvailabilityBatchInput): Promise<AvailabilityBatchResult> {
      if(!Array.isArray(input.days)||input.days.length<1||input.days.length>3)invalid();
      input.days.forEach((day,i)=>{
        validateWindows(day.utcDate,day.windows);
        if(i&&utcDayStart(day.utcDate)!==utcDayStart(input.days[i-1].utcDate)+DAY_MS)invalid();
      });
      const result=record(await call<AvailabilityBatchResult>('replaceDoctorAvailabilityDays',input),['days']);
      if(!Array.isArray(result.days)||result.days.length!==input.days.length)invalid();
      result.days.forEach((day:any,i:number)=>{
        record(day,['utcDate','availabilityId','revision','changed']);
        if(day.utcDate!==input.days[i].utcDate||typeof day.changed!=='boolean')invalid();
        digest(day.availabilityId);positive(day.revision);
        if(day.revision!==input.days[i].expectedRevision+(day.changed?1:0))invalid();
      });
      return result;
    },
    async times(doctorId: string, day: string,durationMinutes:15|30|60=30): Promise<AvailableAppointmentTime[]> {
      schedulingId(doctorId); check();
      const range = discoveryPartitions(day); if (!range) return [];
      const data = record(await call<AvailabilityDiscoveryResult>('getAvailableAppointmentTimes', { doctorId, fromDate: range.fromDate, days: range.days,...(durationMinutes!==30?{durationMinutes}:{}) }), ['times']);
      if (!Array.isArray(data.times) || data.times.length > range.days * 96) invalid();
      let previous = -Infinity;
      for (const t of data.times) {
        record(t, ['doctorId', 'startAt', 'endAt', 'availabilityId', 'availabilityRevision']);
        millis(t.startAt); millis(t.endAt); digest(t.availabilityId); positive(t.availabilityRevision);
        if (t.doctorId !== doctorId || t.startAt % GRID_MS || t.endAt - t.startAt !== durationMinutes*60000 || t.startAt <= previous
          || t.startAt < utcDayStart(range.fromDate) || t.startAt >= utcDayStart(range.fromDate) + range.days * DAY_MS) invalid();
        previous = t.startAt;
      }
      const now = Date.now();
      return data.times.filter((t: AvailableAppointmentTime) => t.startAt >= range.start && t.startAt < range.end
        && t.startAt >= now + 300000 && t.startAt <= now + 90 * DAY_MS);
    },
    selectBooking(doctorId: string, startAt: number,durationMinutes:15|30|60=30) {
      check(); schedulingId(doctorId); millis(startAt); if (startAt % GRID_MS||![15,30,60].includes(durationMinutes)) invalid();
      if (pendingBooking) throw new Error('Wait for the current booking attempt.');
      if (!booking || booking.doctorId !== doctorId || booking.startAt !== startAt||(booking.durationMinutes??30)!==durationMinutes) {
        booking = { doctorId, startAt, bookingRequestId: makeId(),...(durationMinutes!==30?{durationMinutes}:{}) };
      }
    },
    book(): Promise<BookingResult> {
      check(); if (pendingBooking) return pendingBooking;
      if (!booking) throw new Error('Select an appointment time.');
      const intent = { ...booking };
      pendingBooking = (async () => {
        const result = record(await call<BookingResult>('bookAppointment', intent), ['appointmentId', 'doctorId', 'startAt', 'endAt', 'status', 'replayed']);
        digest(result.appointmentId);
        if (result.doctorId !== intent.doctorId || result.startAt !== intent.startAt || result.endAt !== intent.startAt + (intent.durationMinutes??30)*60000
          || !['scheduled', 'cancelled', 'completed', 'no_show'].includes(result.status) || typeof result.replayed !== 'boolean') invalid();
        return result as BookingResult;
      })().finally(() => { pendingBooking = null; });
      return pendingBooking;
    },
    async complete(appointmentId: string): Promise<AppointmentLifecycleResult> {
      digest(appointmentId);
      const result = record(await call<AppointmentLifecycleResult>('recordAppointmentOutcome',
        { appointmentId, outcome: 'completed' }), ['appointmentId', 'status', 'replayed']);
      if (result.appointmentId !== appointmentId || result.status !== 'completed' || typeof result.replayed !== 'boolean') invalid();
      return result as AppointmentLifecycleResult;
    },
    async cancel(appointmentId: string, reason: string | null = null): Promise<AppointmentLifecycleResult> {
      digest(appointmentId);
      const normalized = reason?.trim() || null;
      if (normalized && (normalized.length > 500 || /[\u0000-\u001f\u007f]/.test(normalized))) invalid();
      const result = record(await call<AppointmentLifecycleResult>('cancelAppointment', { appointmentId, reason: normalized }), ['appointmentId', 'status', 'replayed']);
      if (result.appointmentId !== appointmentId || result.status !== 'cancelled' || typeof result.replayed !== 'boolean') invalid();
      return result as AppointmentLifecycleResult;
    },
  };
}
export type SchedulingSession = ReturnType<typeof createSchedulingSession>;
