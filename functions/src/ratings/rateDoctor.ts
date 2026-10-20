import { onCall } from 'firebase-functions/v2/https';
import { db } from '../shared/firestoreRefs';
import { createRatingStore } from './store';
import { createRatingHandlers } from './handlers';
const handlers = createRatingHandlers(createRatingStore(db));
export const rateDoctor = onCall(request => handlers.rate(request));
export const getOwnConsultationRating = onCall(request => handlers.get(request));
export const getOwnDoctorRatingSummary = onCall(request => handlers.summary(request));
