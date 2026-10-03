/** Structural Firestore Timestamp type. Future adapters must supply real server/backend
 * timestamps; these objects are not instructions to persist plain maps or client clocks. */
export interface DomainTimestamp { readonly seconds: number; readonly nanoseconds: number }
export interface DomainDocument {
  readonly schemaVersion: 1;
  readonly createdAt: DomainTimestamp;
  readonly updatedAt: DomainTimestamp;
}
export interface PatientProfileInput { displayName?: string; phoneNumber?: string }
export interface PatientProfile extends DomainDocument, PatientProfileInput { readonly uid: string }
export interface PatientHealthProfileInput {
  dateOfBirth?: string;
  gender?: string;
  knownConditions?: string[];
  allergies?: string[];
  currentMedications?: string[];
}
export interface PatientHealthProfile extends DomainDocument, PatientHealthProfileInput { readonly uid: string }
export interface DoctorDraftInput {
  professionalName?: string;
  specialty?: string;
  phoneNumber?: string;
  registrationNumber?: string;
  issuingAuthority?: string;
}
export interface DoctorProfessionalSnapshot {
  readonly professionalName: string;
  readonly specialty: string;
  readonly registrationNumber: string;
  readonly issuingAuthority: string;
}
export interface DoctorProfile extends DomainDocument, DoctorDraftInput {
  readonly uid: string;
  readonly revision: number;
  readonly activeRequestId: string | null;
  readonly approvedRequestId: string | null;
}
export interface DoctorPublicProfile {
  readonly uid: string;
  readonly professionalName: string;
  readonly specialty: string;
  readonly approvedRevision: number;
  readonly approvedRequestId: string;
  readonly schemaVersion: 1;
  readonly publishedAt: DomainTimestamp;
  readonly updatedAt: DomainTimestamp;
}
