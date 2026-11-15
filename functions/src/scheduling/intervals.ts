import type { SchedulingInterval } from '../../../shared/types/scheduling';
import { fail, strictRecord } from '../profiles/domainValidation';
import { SCHEDULING } from './constants';
import { alignedStart, dateStart, fromMilliseconds, toMilliseconds } from './primitives';
import {durationMinutes,CELL_MS} from './durations';

export function interval(value: unknown): SchedulingInterval {
  const data = strictRecord(value, ['startAt', 'endAt'], ['startAt', 'endAt']);
  const start = toMilliseconds(data.startAt), end = toMilliseconds(data.endAt);
  if (end <= start) return fail('invalid-interval');
  return Object.freeze({ startAt: fromMilliseconds(start), endAt: fromMilliseconds(end) });
}
export function overlaps(a: SchedulingInterval, b: SchedulingInterval): boolean {
  const x = interval(a), y = interval(b);
  return toMilliseconds(x.startAt) < toMilliseconds(y.endAt) && toMilliseconds(y.startAt) < toMilliseconds(x.endAt);
}
export function contains(outer: SchedulingInterval, inner: SchedulingInterval): boolean {
  const a = interval(outer), b = interval(inner);
  return toMilliseconds(a.startAt) <= toMilliseconds(b.startAt) && toMilliseconds(b.endAt) <= toMilliseconds(a.endAt);
}
export function sameInterval(a: SchedulingInterval, b: SchedulingInterval): boolean {
  const x = interval(a), y = interval(b);
  return toMilliseconds(x.startAt) === toMilliseconds(y.startAt) && toMilliseconds(x.endAt) === toMilliseconds(y.endAt);
}
export function availabilityWindows(value: unknown, day: string): readonly SchedulingInterval[] {
  const startOfDay = dateStart(day);
  if (!Array.isArray(value) || value.length > SCHEDULING.maxWindowsPerUtcDay) return fail('invalid-windows');
  const windows: SchedulingInterval[] = [];
  // Index iteration also rejects sparse arrays rather than silently skipping holes.
  for (let i = 0; i < value.length; i++) {
    const next = interval(value[i]), start = alignedStart(toMilliseconds(next.startAt)), end = alignedStart(toMilliseconds(next.endAt));
    if (end - start < CELL_MS || start < startOfDay || end > startOfDay + SCHEDULING.utcDayMs
      || (i > 0 && start < toMilliseconds(windows[i - 1].endAt))) fail('invalid-windows');
    windows.push(next);
  }
  return Object.freeze(windows);
}
export function continuousWindows(windows:readonly SchedulingInterval[]){const merged:SchedulingInterval[]=[];for(const w of windows){const last=merged[merged.length-1];if(last&&toMilliseconds(last.endAt)===toMilliseconds(w.startAt))merged[merged.length-1]={startAt:last.startAt,endAt:w.endAt};else merged.push(w);}return merged;}
export function deriveSlots(windows: unknown, day: string,duration:unknown=30,nextWindows:readonly SchedulingInterval[]=[]): readonly SchedulingInterval[] {
  const slots: SchedulingInterval[] = [];
  const length=durationMinutes(duration)*60000,dayEnd=dateStart(day)+SCHEDULING.utcDayMs;
  for (const window of continuousWindows([...availabilityWindows(windows, day),...nextWindows])) {
    const end = toMilliseconds(window.endAt);
    for (let start = toMilliseconds(window.startAt); start<dayEnd&&start + length <= end; start += SCHEDULING.slotIntervalMs)
      slots.push(Object.freeze({ startAt: fromMilliseconds(start), endAt: fromMilliseconds(start + length) }));
  }
  return Object.freeze(slots);
}
export function fitsAvailability(candidate: SchedulingInterval, windows: unknown, day: string): boolean {
  const slot = interval(candidate);
  alignedStart(toMilliseconds(slot.startAt));
  if(toMilliseconds(slot.endAt)-toMilliseconds(slot.startAt)>3600000)fail('invalid-duration');
  return continuousWindows(availabilityWindows(windows, day)).some(window => contains(window, slot));
}
