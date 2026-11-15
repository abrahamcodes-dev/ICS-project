import {fail} from '../profiles/domainValidation';
import {bookingLockId} from './ids';
export const CELL_MS=900000;
export type ConsultationDuration=15|30|60;
export function durationMinutes(value:unknown=30):ConsultationDuration{if(value!==15&&value!==30&&value!==60)fail('invalid-duration');return value as ConsultationDuration;}
export function intervalDuration(start:number,end:number){return durationMinutes((end-start)/60000);}
export function cellStarts(start:number,end:number){if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start%CELL_MS||end%CELL_MS||end<=start||end-start>3600000)fail('invalid-cell-range');return Array.from({length:(end-start)/CELL_MS},(_,i)=>start+i*CELL_MS);}
export function holdKeys(patientId:string,doctorId:string,start:number,end:number,version=2){return (['doctor','patient'] as const).flatMap(role=>(version===2?cellStarts(start,end):[start]).map(t=>bookingLockId(role,role==='doctor'?doctorId:patientId,t)));}
/** Round a positive half-minor unit upward; all operations remain safe integers. */
export function proportionalPrice(base:number,duration:unknown=30){if(!Number.isSafeInteger(base)||base<0||base>10000000)fail('invalid-base-fee');const d=durationMinutes(duration);return d===15?Math.floor(base/2)+base%2:d===60?base*2:base;}
