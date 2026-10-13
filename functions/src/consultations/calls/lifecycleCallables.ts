import { onCall } from 'firebase-functions/v2/https';
import { db } from '../../shared/firestoreRefs';
import { createCallStore } from './callStore';
import { createCallLifecycleHandlers } from './lifecycleHandler';

// Internal bindings only. Deliberately absent from src/index.ts until the C6 surface phase.
const handlers = createCallLifecycleHandlers(createCallStore(db));
export const respondToConsultationCall = onCall(request => handlers.respond(request));
export const endConsultationCall = onCall(request => handlers.end(request));
export const getConsultationCall = onCall(request => handlers.get(request));
