import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {Timestamp} from 'firebase-admin/firestore';
import {db} from '../shared/firestoreRefs';
import {createAuthorization, requireAuthenticated} from '../shared/authorization';
import {consentInput, planConsent} from './consentPolicy';
import type {PatientConsentState} from '../../../shared/types/consent';

// No direct client access: the existing deny-all rules cover this collection.
// Development decisions never authorize medical-record access. Approved policy and
// an appointment-bound medical reader are prerequisites for enabling that feature.
export const getOwnPatientConsent = onCall(async request => {
  const uid = requireAuthenticated(request.auth);
  if (!request.data || typeof request.data !== 'object' || Object.keys(request.data).length)
    throw new HttpsError('invalid-argument','No patient identifier is accepted.');
  return db.runTransaction(async tx => {
    const identity = await createAuthorization(async () => (await tx.get(db.doc(`users/${uid}`))).data()).requireActive({uid});
    if (identity.role !== 'patient') throw new HttpsError('permission-denied','Patient account required.');
    const snapshot = await tx.get(db.doc(`patientConsents/${uid}`));
    return {state:snapshot.exists ? snapshot.data() as PatientConsentState : null};
  });
});
export const updateOwnPatientConsent = onCall(async request => {
  const uid = requireAuthenticated(request.auth), input = consentInput(request.data);
  if(input.source!=='profile')throw new HttpsError('invalid-argument','Use profile privacy management for consent changes.');
  const stateRef = db.doc(`patientConsents/${uid}`);
  const receiptRef = stateRef.collection('history').doc(input.requestId);
  return db.runTransaction(async tx => {
    const identity = await createAuthorization(async () => (await tx.get(db.doc(`users/${uid}`))).data()).requireActive({uid});
    if (identity.role !== 'patient') throw new HttpsError('permission-denied','Patient account required.');
    const [current,receipt] = await Promise.all([tx.get(stateRef),tx.get(receiptRef)]);
    if (receipt.exists) {
      const saved = receipt.data()!;
      if (Object.keys(input).some(k => saved.input?.[k] !== input[k as keyof typeof input]))
        throw new HttpsError('already-exists','This request identifier was already used.');
      // A replay never resurrects a grant after a subsequent withdrawal.
      return {state:current.data() as PatientConsentState};
    }
    const now = Timestamp.now();
    const state = planConsent(uid,input,current.exists ? current.data() as PatientConsentState : null,now.toDate().toISOString());
    tx.create(receiptRef,{input,state,serverTimestamp:now});
    tx.set(stateRef,state);
    return {state};
  });
});
