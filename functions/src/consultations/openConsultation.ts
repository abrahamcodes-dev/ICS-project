import { onCall } from 'firebase-functions/v2/https';
import { db } from '../shared/firestoreRefs';
import { createConsultationStore } from './consultationStore';
import { createOpenConsultationHandler } from './openHandler';
const handler = createOpenConsultationHandler(createConsultationStore(db));
export const openConsultation = onCall(request => handler(request));
