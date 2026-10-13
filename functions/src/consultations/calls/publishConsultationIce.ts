import { onCall } from 'firebase-functions/v2/https';
import { db } from '../../shared/firestoreRefs';
import { createCallStore } from './callStore';
import { createCallLifecycleHandlers } from './lifecycleHandler';

// Internal binding only; not exported by src/index.ts.
const handlers = createCallLifecycleHandlers(createCallStore(db));
export const publishConsultationIce = onCall(request => handlers.publishIce(request));
