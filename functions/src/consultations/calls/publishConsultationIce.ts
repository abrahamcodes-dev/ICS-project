import { onCall } from 'firebase-functions/v2/https';
import { db } from '../../shared/firestoreRefs';
import { createCallStore } from './callStore';
import { createCallLifecycleHandlers } from './lifecycleHandler';

// Explicitly exported by src/index.ts; deployment is a separate release step.
const handlers = createCallLifecycleHandlers(createCallStore(db));
export const publishConsultationIce = onCall(request => handlers.publishIce(request));
