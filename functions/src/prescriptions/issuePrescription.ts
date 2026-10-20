import { onCall } from 'firebase-functions/v2/https';
import { db } from '../shared/firestoreRefs';
import { createPrescriptionStore } from './store';
import { createPrescriptionHandlers } from './handlers';
const handlers = createPrescriptionHandlers(createPrescriptionStore(db));
export const issuePrescription = onCall(request => handlers.issue(request));
export const getConsultationPrescription = onCall(request => handlers.get(request));
