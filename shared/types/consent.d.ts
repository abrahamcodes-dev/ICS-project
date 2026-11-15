export type SharingDecision = 'granted' | 'declined' | 'withdrawn';
export interface PatientConsentInput {
  requestId: string;
  expectedRevision: number;
  documentVersion: string;
  privacyAcknowledged: true;
  sharingDecision: SharingDecision;
  source: 'registration' | 'profile';
}
export interface PatientConsentState {
  patientUid: string;
  revision: number;
  documentVersion: string;
  privacyAcknowledged: true;
  sharingDecision: SharingDecision;
  source: 'registration' | 'profile';
  recordedAt: string;
  privacyAcknowledgedAt: string;
  scope: 'medical-records-for-treatment';
  developmentOnly: boolean;
}
