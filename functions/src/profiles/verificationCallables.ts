import { onCall } from 'firebase-functions/v2/https';
import { db, storage } from '../shared/firestoreRefs';
import { createVerificationHandlers } from './verificationHandlers';
import { createVerificationStore } from './verificationStore';

const handlers = () => createVerificationHandlers(createVerificationStore(db, storage.bucket()));
export const submitDoctorVerification = onCall(request => handlers().submit(request));
export const reviewDoctorVerification = onCall(request => handlers().review(request));
