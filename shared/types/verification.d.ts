import type { DomainDocument, DomainTimestamp, DoctorProfessionalSnapshot } from "./profiles";
export type CredentialCategory = "medical_license" | "professional_certificate" | "identity_document" | "other_supporting_document";
export type CredentialContentType = "application/pdf" | "image/jpeg" | "image/png";
export interface CredentialUploadInput {
  category: CredentialCategory;
  contentType: CredentialContentType;
  sizeBytes: number;
}
export interface DoctorCredentialRecord extends DomainDocument, CredentialUploadInput {
  readonly credentialId: string;
  readonly doctorUid: string;
  readonly storagePath: string;
  readonly state: "prepared" | "ready" | "attached" | "invalid";
  readonly generation: string | null;
  readonly checksum: string | null;
  readonly requestId: string | null;
  readonly expiresAt: DomainTimestamp;
}
/** Generation/checksum are observed by the future trusted finalizer, never proof
 * supplied by public input. Pure validation cannot verify file existence/content. */
export interface FinalizedCredentialReference {
  readonly credentialId: string;
  readonly category: CredentialCategory;
  readonly generation: string;
  readonly checksum: string;
}
export type VerificationRequestState = "submitted" | "approved" | "rejected" | "invalidated";
interface VerificationRequestBase extends DomainDocument {
  readonly requestId: string;
  readonly doctorUid: string;
  readonly profileRevision: number;
  readonly professional: DoctorProfessionalSnapshot;
  readonly credentials: readonly FinalizedCredentialReference[];
  readonly previousRequestId: string | null;
  readonly submittedAt: DomainTimestamp;
}
export type VerificationRequest = VerificationRequestBase & (
  | { readonly state: "submitted"; readonly reviewedAt: null; readonly reviewerUid: null; readonly rejectionReason?: never }
  | { readonly state: "approved"; readonly reviewedAt: DomainTimestamp; readonly reviewerUid: string; readonly rejectionReason?: never }
  | { readonly state: "rejected"; readonly reviewedAt: DomainTimestamp; readonly reviewerUid: string; readonly rejectionReason: string }
  | { readonly state: "invalidated"; readonly reviewedAt: DomainTimestamp; readonly reviewerUid: string; readonly invalidatedAt: DomainTimestamp; readonly rejectionReason?: never }
);
export type VerificationReviewInput =
  | { decision: "approved"; rejectionReason?: never }
  | { decision: "rejected"; rejectionReason: string };
export interface VerificationAudit {
  readonly eventId: string;
  readonly requestId: string;
  readonly doctorUid: string;
  readonly actorUid: string;
  readonly action: "submitted" | "approved" | "rejected" | "invalidated";
  readonly occurredAt: DomainTimestamp;
  readonly schemaVersion: 1;
}
/** Internal exception messages are never inputs to this reason contract. */
