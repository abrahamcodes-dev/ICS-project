import { onCall } from 'firebase-functions/v2/https';
import { db } from '../shared/firestoreRefs';
import { createAvailabilityHandlers } from './availabilityHandlers';
import { createAvailabilityStore } from './availabilityStore';

const handlers = createAvailabilityHandlers(createAvailabilityStore(db));
export const replaceDoctorAvailabilityDay = onCall(request => handlers.replace(request));
export const getAvailableAppointmentTimes = onCall(request => handlers.discover(request));
