import { onCall } from '../shared/academicHttps';
import { db } from '../shared/firestoreRefs';
import { createSchedulingReads } from './readHandlers';
import { createSchedulingReadStore } from './readStore';

const handlers = createSchedulingReads(createSchedulingReadStore(db));
export const listApprovedDoctors = onCall(request => handlers.list(request));
export const getOwnDoctorAvailabilityDay = onCall(request => handlers.ownDay(request));
