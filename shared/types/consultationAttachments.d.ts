export type AttachmentMime = 'application/pdf' | 'image/jpeg' | 'image/png';
/** One compile-checked limit for the authoritative server and advisory client. */
export interface AttachmentLimits {maxBytes:10485760;uploadMinutes:15}
export interface ConsultationAttachment {
  attachmentId:string;
  consultationId:string;
  messageId:string;
  senderId:string;
  filename:string;
  contentType:AttachmentMime;
  sizeBytes:number;
  storagePath:string;
  status:'finalized';
}
export interface PrepareAttachmentInput {
  consultationId:string;
  requestId:string;
  filename:string;
  contentType:AttachmentMime;
  sizeBytes:number;
}
export interface ConsultationAttachmentMessage {
 readonly messageId:string;
 readonly senderId:string;
 readonly type:'attachment';
 readonly attachment:ConsultationAttachment;
 readonly createdAt:import('./profiles').DomainTimestamp;
 readonly schemaVersion:1;
}
export type ConsultationChatMessage=import('./consultationContracts').ConsultationMessage|ConsultationAttachmentMessage;
