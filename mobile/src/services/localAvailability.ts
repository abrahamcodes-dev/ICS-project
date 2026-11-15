import type {OwnAvailabilityResult} from '@shared/types/schedulingReads';
import type {AvailabilityReplacementInput,AvailabilityBatchInput} from '@shared/types/scheduling';
export const DAY=86400000, SLOT=900000;
export type Window={startAt:number;endAt:number};
export type Snapshot=Record<string,OwnAvailabilityResult['day']>;
const fail=(message:string):never=>{throw new Error(message);};
export function shiftDate(day:string,n:number){return new Date(Date.parse(day+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);}
function formatter(zone:string){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}
function parts(format:Intl.DateTimeFormat,t:number){const p=Object.fromEntries(format.formatToParts(t).map(v=>[v.type,v.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
export function zonedDate(zone:string,t=Date.now()){return parts(formatter(zone),t).slice(0,10);}
/** Match wall time against IANA offsets on both sides of a transition. Never guess a fold/gap. */
export function wallInstant(day:string,time:string,zone:string){
 const wall=Date.parse(`${day}T${time}:00Z`),format=formatter(zone);
 if(!Number.isFinite(wall)||new Date(wall).toISOString().slice(0,16)!==`${day}T${time}`)return fail('Choose a valid date and time.');
 const offsets=new Set<number>();
 for(let h=-36;h<=36;h+=3){const t=wall+h*3600000;offsets.add(Date.parse(parts(format,t)+':00Z')-t);}
 const matches=[...offsets].map(offset=>wall-offset).filter(t=>parts(format,t)===`${day}T${time}`);
 if(matches.length!==1)return fail('This local time is skipped or repeated by a clock change. Choose another time.');
 return matches[0];
}
export function localDay(day:string,zone:string){
 const start=wallInstant(day,'00:00',zone),end=wallInstant(shiftDate(day,1),'00:00',zone);
 const dates:string[]=[];for(let t=Math.floor(start/DAY)*DAY;t<end;t+=DAY)dates.push(new Date(t).toISOString().slice(0,10));
 return {start,end,dates};
}
export function timeLabel(t:number,zone:string){return new Intl.DateTimeFormat('en',{timeZone:zone,hour:'numeric',minute:'2-digit',hour12:true}).format(t);}
export function timeChoices(day:string,zone:string){
 const {start,end}=localDay(day,zone),format=formatter(zone),all: Array<{value:number;label:string;wall:string}>=[];
 for(let t=Math.ceil(start/SLOT)*SLOT;t<=end;t+=SLOT)all.push({value:t,label:timeLabel(t,zone)+(t===end?' (next day)':''),wall:parts(format,t)});
 // Repeated local labels cannot identify one instant unambiguously, so omit both occurrences.
 return all.filter(a=>all.filter(b=>b.wall===a.wall).length===1);
}
export function visibleWindows(snapshot:Snapshot,start:number,end:number){
 const segments=Object.values(snapshot).flatMap(d=>d?.windows??[]).filter(w=>w.endAt>start&&w.startAt<end).map(w=>({startAt:Math.max(start,w.startAt),endAt:Math.min(end,w.endAt)})).sort((a,b)=>a.startAt-b.startAt);
 const windows:Window[]=[];
 for(const segment of segments){const previous=windows.at(-1);if(previous&&previous.endAt===segment.startAt&&segment.startAt%DAY===0)previous.endAt=segment.endAt;else windows.push({...segment});}
 return windows;
}
const same=(a:Window,b:Window)=>a.startAt===b.startAt&&a.endAt===b.endAt;
/** One request, either single-day or an atomic batch. All loaded revisions are retained. */
export function planLocalAvailability(day:string,zone:string,rows:Window[],snapshot:Snapshot,now=Date.now()):AvailabilityReplacementInput|AvailabilityBatchInput|null{
 const range=localDay(day,zone),sorted=[...rows].sort((a,b)=>a.startAt-b.startAt);
 if(range.dates.some(d=>!Object.prototype.hasOwnProperty.call(snapshot,d)))return fail('Load all saved availability before reviewing changes.');
 if(sorted.length>8)return fail('Use up to eight availability windows.');
 sorted.forEach((w,i)=>{if(!Number.isSafeInteger(w.startAt)||!Number.isSafeInteger(w.endAt)||w.startAt%SLOT||w.endAt%SLOT||w.startAt<range.start||w.endAt>range.end||w.endAt-w.startAt<SLOT)fail('Select a start and end time at least 15 minutes apart.');if(i&&sorted[i-1].endAt>w.startAt)fail('Availability windows overlap. Adjust the times.');});
 const changes:AvailabilityReplacementInput[]=[];
 for(const date of range.dates){
  const base=Date.parse(date+'T00:00:00Z'),old=snapshot[date],before=old?.windows??[];
  let windows:Window[]=before.flatMap(w=>w.endAt<=range.start||w.startAt>=range.end?[w]:[
   ...(w.startAt<range.start?[{startAt:w.startAt,endAt:range.start}]:[]),...(w.endAt>range.end?[{startAt:range.end,endAt:w.endAt}]:[])]);
  windows.push(...sorted.filter(w=>w.endAt>base&&w.startAt<base+DAY).map(w=>({startAt:Math.max(base,w.startAt),endAt:Math.min(base+DAY,w.endAt)})));
  windows.sort((a,b)=>a.startAt-b.startAt);
  // Restore original window boundaries when clipping the local date split an unchanged window.
  for(const original of before){const pieces=windows.filter(w=>w.startAt>=original.startAt&&w.endAt<=original.endAt);if(pieces.length>1&&pieces[0].startAt===original.startAt&&pieces.at(-1)!.endAt===original.endAt&&pieces.every((w,i)=>i===0||pieces[i-1].endAt===w.startAt)){windows=windows.filter(w=>!pieces.includes(w));windows.push(original);windows.sort((a,b)=>a.startAt-b.startAt);}}
  if(before.length===windows.length&&before.every((w,i)=>same(w,windows[i])))continue;
  if(windows.some(w=>w.startAt%SLOT||w.endAt%SLOT))return fail('This boundary does not align with supported appointment times. Keep the existing crossing window unchanged.');
  if(windows.length>8)return fail('This date shares saved hours with another local day. Reduce the number of windows.');
  if(before.some(w=>w.startAt<=now&&!windows.some(v=>same(w,v)))||windows.some(w=>w.startAt<=now&&!before.some(v=>same(w,v))))return fail('Availability that has already started must remain unchanged.');
  const today=Math.floor(now/DAY)*DAY;if(base<today||base>today+90*DAY)return fail('Choose a date within the next 90 days.');
  changes.push({utcDate:date,timeZone:old?.timeZone??zone,expectedRevision:old?.revision??0,windows});
 }
 if(changes.length>1){
  const first=changes[0].utcDate,last=changes.at(-1)!.utcDate;
  // Include an unchanged middle partition, if any, so the request is consecutive and checks its revision too.
  const days=range.dates.filter(d=>d>=first&&d<=last).map(d=>changes.find(c=>c.utcDate===d)??{utcDate:d,timeZone:snapshot[d]?.timeZone??zone,expectedRevision:snapshot[d]?.revision??0,windows:snapshot[d]?.windows??[]});
  if(days.length>3)return fail('This date exceeds the supported scheduling range.');
  return {days};
 }
 return changes[0]??null;
}
export function availabilityError(error:unknown){const code=(error as {code?:string})?.code??'';if(/failed-precondition|already-exists/.test(code))return 'Saved hours or bookings have changed. Reload and review your hours; booked appointments and started hours must stay covered.';if(/permission-denied|unauthenticated/.test(code))return 'Your account is no longer eligible. Sign in again or check your verification status.';return 'The change could not be confirmed. Reload saved hours before trying again; it may already have been saved.';}
