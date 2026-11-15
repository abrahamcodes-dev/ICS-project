import { onCall } from '../shared/academicHttps';
import { db } from '../shared/firestoreRefs';
import { createAvailabilityStore } from './availabilityStore';
import { createBookingHandler } from './bookingHandler';

const handler = createBookingHandler(createAvailabilityStore(db));
export const bookAppointment = onCall(request => handler(request));
