import {Timestamp} from 'firebase-admin/firestore';
import type {BookingLock,BookingResourceType} from '../../../shared/types/scheduling';
import {validateBookingLock} from './validation';
import {bookingLockId} from './ids';
import {CELL_MS} from './durations';
import {fail} from '../profiles/domainValidation';
import {toMilliseconds} from './primitives';
export type RawReader=(path:string)=>Promise<FirebaseFirestore.DocumentData|null>;
export function decodeLock(raw:FirebaseFirestore.DocumentData){const time=(v:Timestamp)=>{if(!(v instanceof Timestamp))fail('lock-time');return {seconds:v.seconds,nanoseconds:v.nanoseconds};};return validateBookingLock({...raw,startAt:time(raw.startAt),endAt:time(raw.endAt),createdAt:time(raw.createdAt)});}
/** Old 30-minute records have only their start lock. Check its predecessor as
 * well as new quarter-hour cells, without rewriting any historical record. */
export async function occupiedCell(read:RawReader,role:BookingResourceType,uid:string,cell:number):Promise<BookingLock|null>{
 const key=bookingLockId(role,uid,cell),values=[await read('schedulingCellLocks/'+key),await read('bookingLocks/'+key),await read('bookingLocks/'+bookingLockId(role,uid,cell-CELL_MS))];let found:BookingLock|null=null;
 for(let i=0;i<values.length;i++){if(!values[i])continue;const lock=decodeLock(values[i]!);if(lock.resourceType!==role||lock.resourceId!==uid)fail('cell-owner');const start=toMilliseconds(lock.startAt),end=toMilliseconds(lock.endAt);if(i>0&&start!==(i===1?cell:cell-CELL_MS))fail('original-lock-binding');if(start<=cell&&cell<end){if(found&&found.appointmentId!==lock.appointmentId)fail('conflicting-cell-owners');found=lock;}}
 return found;
}
