import {createHash} from 'crypto';
import {HttpsError} from 'firebase-functions/v2/https';
import {strictRecord} from '../profiles/domainValidation';
import {bookingRequestId} from '../scheduling/primitives';
import {consultationId} from './domain';
import type {PrepareAttachmentInput,AttachmentMime,AttachmentLimits} from '../../../shared/types/consultationAttachments';

export const ATTACHMENT_MAX_BYTES:AttachmentLimits['maxBytes']=10485760;
export const ATTACHMENT_MIMES:AttachmentMime[]=['application/pdf','image/jpeg','image/png'];
export const UPLOAD_MINUTES:AttachmentLimits['uploadMinutes']=15;
export function displayFilename(value:unknown):string {
 if(typeof value!=='string'||value.length>512)throw new Error('filename');
 const name=value.normalize('NFKC').split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,120);
 if(!name||name==='.'||name==='..')throw new Error('filename');
 return name;
}
export function prepareAttachmentInput(value:unknown):PrepareAttachmentInput {
 try{
  const fields=['consultationId','requestId','filename','contentType','sizeBytes'],v=strictRecord(value,fields,fields);
  if(!ATTACHMENT_MIMES.includes(v.contentType as AttachmentMime)||!Number.isSafeInteger(v.sizeBytes)||Number(v.sizeBytes)<1||Number(v.sizeBytes)>ATTACHMENT_MAX_BYTES)throw new Error('file');
  return {consultationId:consultationId(v.consultationId),requestId:bookingRequestId(v.requestId),filename:displayFilename(v.filename),contentType:v.contentType as AttachmentMime,sizeBytes:Number(v.sizeBytes)};
 }catch{throw new HttpsError('invalid-argument','Choose a PDF, JPEG or PNG of at most 10 MiB with a valid filename.');}
}
export function attachmentId(room:string,uid:string,requestId:string){return createHash('sha256').update(JSON.stringify(['attachment',room,uid,requestId])).digest('hex');}
export function validateAttachmentBytes(bytes:Buffer,mime:AttachmentMime,size:number){
 if(bytes.length!==size||size<1||size>ATTACHMENT_MAX_BYTES)throw new HttpsError('invalid-argument','The uploaded file size does not match.');
 const pdf=bytes.subarray(0,8).toString('ascii');
 const valid=mime==='application/pdf'? /^%PDF-1\.[0-9]/.test(pdf)&&bytes.subarray(-1024).includes(Buffer.from('%%EOF'))
  :mime==='image/jpeg'?bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217
  :bytes.length>=45&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.subarray(12,16).toString('ascii')==='IHDR'&&bytes.subarray(-8,-4).toString('ascii')==='IEND';
 if(!valid)throw new HttpsError('invalid-argument','The file signature does not match its declared type.');
 // This is a bounded signature check, not a malware or complete document parser.
 if(mime==='application/pdf'&&/\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|OpenAction)\b/.test(bytes.toString('latin1')))
  throw new HttpsError('invalid-argument','PDFs with active or embedded content are not supported.');
 return createHash('sha256').update(bytes).digest('hex');
}
