import { onCall } from 'firebase-functions/v2/https';
import { db } from '../../shared/firestoreRefs';
import { createCallStore } from './callStore';
import { createStartConsultationCallHandler } from './startHandler';

// Deliberately absent from src/index.ts until the C6 export-surface phase.
const handler = createStartConsultationCallHandler(createCallStore(db));
export const startConsultationCall = onCall(request => handler(request));
