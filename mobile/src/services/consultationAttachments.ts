import type {ConsultationAttachment,PrepareAttachmentInput,AttachmentMime,AttachmentLimits} from '@shared/types/consultationAttachments';
export const ATTACHMENT_MAX_BYTES:AttachmentLimits['maxBytes']=10485760;
export const ATTACHMENT_MIMES:AttachmentMime[]=['application/pdf','image/jpeg','image/png'];
let startupCleanup:Promise<void>|null=null;
export type SelectedAttachment={uri:string;filename:string;contentType:AttachmentMime;sizeBytes:number};
export function parseAttachment(value:unknown):ConsultationAttachment {
 const v=value as ConsultationAttachment;
 if(!v||!/^([a-f0-9]{64})$/.test(v.attachmentId)||!/^([a-f0-9]{64})$/.test(v.consultationId)||v.messageId!==v.attachmentId
  ||typeof v.senderId!=='string'||!v.senderId||typeof v.filename!=='string'||!v.filename||v.filename.length>120||/[\\/\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(v.filename)
  ||v.status!=='finalized'||v.storagePath!==`consultationAttachments/${v.consultationId}/${v.attachmentId}/document`)throw new Error('Invalid private document reference.');
 validateAttachmentFile(v.contentType,v.sizeBytes);return v;
}
export function validateAttachmentFile(mime:unknown,size:unknown){
 if(!ATTACHMENT_MIMES.includes(mime as AttachmentMime)||!Number.isSafeInteger(size)||Number(size)<1||Number(size)>ATTACHMENT_MAX_BYTES)
  throw new Error('Choose a PDF, JPEG or PNG of at most 10 MiB.');
}
export function attachmentError(error:unknown){
 const code=(error as {code?:string})?.code??'';
 if(/invalid-argument/.test(code))return 'The file was rejected. Check its format, contents and size; select a supported file again.';
 if(/permission-denied|unauthenticated/.test(code))return 'Your account cannot access this consultation document. Reopen the consultation.';
 if(/failed-precondition/.test(code))return 'This consultation or upload is no longer available. Check history, then cancel this selection before choosing again.';
 if(/already-exists/.test(code))return 'This upload belongs to a different file. Check history, cancel this selection and choose the file again.';
 if(/resource-exhausted/.test(code))return 'Please wait before retrying. This consultation may have reached its document limit.';
 if(/not-found/.test(code))return 'The private file is missing. Retry an interrupted upload or select the file again.';
 if(/cancel/.test(code))return 'Upload stopped. Check message history before selecting the document again.';
 return 'Operation not confirmed. Check your connection, then retry the same document or reload message history.';
}
/** Owns temporary files and a single upload intent. Cancellation prevents its
 * publication even when the callable's in-flight network transfer cannot abort.
 * Native libraries and
 * Firebase are the existing application dependencies, loaded only when needed. */
export function createAttachmentSession(uid:string,consultationId:string){
 const {auth,functions}=require('./firebaseConfig') as typeof import('./firebaseConfig');
 const {httpsCallable}=require('firebase/functions') as typeof import('firebase/functions');
 const BlobUtil=(require('react-native-blob-util') as typeof import('react-native-blob-util')).default;
 // Remove this feature's cache copies left by process death. All sessions await
 // the same initial sweep before creating files, so live selections are retained.
 if(!startupCleanup)startupCleanup=(async()=>{try{const names=await BlobUtil.fs.ls(BlobUtil.fs.dirs.CacheDir);await Promise.all(names.filter(n=>/^calladoc-attachment-[a-f0-9-]+\.(pdf|png|jpg)$/.test(n)).map(n=>BlobUtil.fs.unlink(`${BlobUtil.fs.dirs.CacheDir}/${n}`).catch(()=>{})));}catch{/* Cache may be unavailable until native startup. */}})();
 let disposed=false,viewVersion=0,uploadVersion=0,viewerPath:string|null=null,selectedPath:string|null=null;
 const check=()=>{if(disposed||auth.currentUser?.uid!==uid)throw new Error('Session ended.');};
 async function unlink(path:string|null){if(path)try{if(await BlobUtil.fs.exists(path))await BlobUtil.fs.unlink(path);}catch{/* App-private cache cleanup is best effort. */}}
 async function call<T>(name:string,data:unknown){check();const response=await httpsCallable<unknown,T>(functions,name)(data);check();return response.data;}
 async function closeViewer(){viewVersion++;const path=viewerPath;viewerPath=null;await unlink(path);}
 async function clearSelection(){const path=selectedPath;selectedPath=null;await unlink(path);}
 return {
  async pick():Promise<SelectedAttachment|null>{
   await startupCleanup;check();const picker=require('expo-document-picker') as typeof import('expo-document-picker');
   const result=await picker.getDocumentAsync({type:ATTACHMENT_MIMES,multiple:false,copyToCacheDirectory:true});
   if(result.canceled)return null;
   const file=result.assets[0],path=file.uri.replace(/^file:\/\//,'');
   // Delete only picker-created copies inside this application's private cache.
   if(!file.uri.startsWith('file://')||!path.startsWith(BlobUtil.fs.dirs.CacheDir+'/'))throw new Error('Private picker cache unavailable.');
   let owned:string|null=null;
   try{check();validateAttachmentFile(file.mimeType,file.size);await clearSelection();
    const {uuid}=require('expo-modules-core') as typeof import('expo-modules-core');
    const ext=file.mimeType==='application/pdf'?'pdf':file.mimeType==='image/png'?'png':'jpg';
    owned=`${BlobUtil.fs.dirs.CacheDir}/calladoc-attachment-${uuid.v4()}.${ext}`;
    await BlobUtil.fs.cp(path,owned);await unlink(path);check();selectedPath=owned;
    return {uri:`file://${owned}`,filename:file.name,contentType:file.mimeType as AttachmentMime,sizeBytes:file.size!};
   }catch(e){await unlink(path);await unlink(owned);throw e;}
  },
  async upload(file:SelectedAttachment,intent:{requestId:string;attachmentId?:string},progress:(stage:string)=>void){
   check();validateAttachmentFile(file.contentType,file.sizeBytes);
   const version=++uploadVersion,current=()=>{check();if(version!==uploadVersion)throw Object.assign(new Error('Upload cancelled'),{code:'upload/cancelled'});};
   const request:PrepareAttachmentInput={consultationId,requestId:intent.requestId,filename:file.filename,contentType:file.contentType,sizeBytes:file.sizeBytes};
   progress('Preparing private upload');
   if(!intent.attachmentId){const prepared=await call<{attachmentId:string;storagePath:string;state:string}>('prepareConsultationAttachment',request);
    if(!/^[a-f0-9]{64}$/.test(prepared.attachmentId)||prepared.storagePath!==`consultationAttachments/${consultationId}/${prepared.attachmentId}/document`)throw new Error('Invalid upload slot.');
    intent.attachmentId=prepared.attachmentId;
   }
   current();
   const binding={consultationId,attachmentId:intent.attachmentId};
   // A lost upload/finalization acknowledgement must never overwrite an object
   // or create a second message. Check the same backend slot before retrying.
   try{return await call<{attachment:ConsultationAttachment}>('finalizeConsultationAttachment',binding);}
   catch(e){if(!(e as {code?:string}).code?.includes('not-found'))throw e;}
   progress('Reading private file');
   const encoded=await BlobUtil.fs.readFile(file.uri.replace(/^file:\/\//,''),'base64');current();
   if(atob(encoded).length!==file.sizeBytes)throw new Error('File size changed.');
   progress('Uploading private document');
   await call('uploadConsultationAttachment',{...binding,base64:encoded});current();
   progress('Validating and publishing document');
   return call<{attachment:ConsultationAttachment}>('finalizeConsultationAttachment',binding);
  },
  async cancel(attachmentId?:string){uploadVersion++;if(attachmentId)await call('discardConsultationAttachment',{consultationId,attachmentId});await clearSelection();},
  clearSelection,closeViewer,
  async view(attachment:ConsultationAttachment){
   await startupCleanup;await closeViewer();const version=viewVersion;let path:string|null=null;
   try{const result=await call<{attachment:ConsultationAttachment;base64:string}>('getConsultationAttachment',{consultationId,attachmentId:attachment.attachmentId});
    if(result.attachment.attachmentId!==attachment.attachmentId||result.attachment.consultationId!==consultationId||result.attachment.contentType!==attachment.contentType)throw new Error('Document changed.');
    validateAttachmentFile(result.attachment.contentType,result.attachment.sizeBytes);
    if(typeof result.base64!=='string'||result.base64.length>Math.ceil(ATTACHMENT_MAX_BYTES/3)*4||atob(result.base64).length!==result.attachment.sizeBytes)throw new Error('Invalid document.');
    check();if(version!==viewVersion)throw new Error('View ended.');
    const {uuid}=require('expo-modules-core') as typeof import('expo-modules-core');
    path=`${BlobUtil.fs.dirs.CacheDir}/calladoc-attachment-${uuid.v4()}.${attachment.contentType==='application/pdf'?'pdf':attachment.contentType==='image/png'?'png':'jpg'}`;
    await BlobUtil.fs.writeFile(path,result.base64,'base64');check();if(version!==viewVersion)throw new Error('View ended.');
    viewerPath=path;return {uri:`file://${path}`,contentType:attachment.contentType};
   }catch(e){await unlink(path);throw e;}
  },
  dispose(){disposed=true;uploadVersion++;void closeViewer();void clearSelection();},
 };
}
