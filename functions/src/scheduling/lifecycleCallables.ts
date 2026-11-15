import { onCall } from '../shared/academicHttps';
import { db } from '../shared/firestoreRefs';
import { createAvailabilityStore } from './availabilityStore';
import { createLifecycleHandlers } from './lifecycleHandlers';

const handlers = createLifecycleHandlers(createAvailabilityStore(db));
export const cancelAppointment = onCall(request => handlers.cancel(request));
export const recordAppointmentOutcome = onCall(request => handlers.outcome(request));
