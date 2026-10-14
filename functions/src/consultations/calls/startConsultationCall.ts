import { onCall } from 'firebase-functions/v2/https';
import { db } from '../../shared/firestoreRefs';
import { createCallStore } from './callStore';
import { createStartConsultationCallHandler } from './startHandler';

// Explicitly exported by src/index.ts; deployment is a separate release step.
const handler = createStartConsultationCallHandler(createCallStore(db));
export const startConsultationCall = onCall(request => handler(request));
