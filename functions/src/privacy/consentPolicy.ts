import {HttpsError} from 'firebase-functions/v2/https';
import type {PatientConsentInput, PatientConsentState} from '../../../shared/types/consent';

export const DOCUMENT_VERSION = 'development-2026-11-03-v1';
export function consentInput(value: unknown): PatientConsentInput {
  const v = value as PatientConsentInput;
  const fields = ['requestId','expectedRevision','documentVersion','privacyAcknowledged','sharingDecision','source'];
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== fields.length
    || Object.keys(v).some(k => !fields.includes(k)) || typeof v.requestId !== 'string' || !/^[A-Za-z0-9]{20}$/.test(v.requestId)
    || !Number.isSafeInteger(v.expectedRevision) || v.expectedRevision < 0
    || v.documentVersion !== DOCUMENT_VERSION || v.privacyAcknowledged !== true
    || !['granted','declined','withdrawn'].includes(v.sharingDecision)
    || !['registration','profile'].includes(v.source)) {
    throw new HttpsError('invalid-argument','Review the current privacy information and supply an explicit sharing decision.');
  }
  return v;
}
export function planConsent(uid: string, input: PatientConsentInput, current: PatientConsentState | null, now: string): PatientConsentState {
  if ((current?.revision ?? 0) !== input.expectedRevision)
    throw new HttpsError('aborted','Consent changed. Reload before saving another decision.');
  if (input.sharingDecision === 'withdrawn' && current?.sharingDecision !== 'granted')
    throw new HttpsError('failed-precondition','Only a current grant can be withdrawn.');
  return {patientUid:uid,revision:input.expectedRevision+1,documentVersion:input.sharingDecision==='withdrawn'?current!.documentVersion:DOCUMENT_VERSION,
    privacyAcknowledged:true,sharingDecision:input.sharingDecision,source:input.source,recordedAt:now,
    privacyAcknowledgedAt:input.sharingDecision==='withdrawn'?(current!.privacyAcknowledgedAt??current!.recordedAt):now,
    scope:'medical-records-for-treatment',developmentOnly:true};
}
