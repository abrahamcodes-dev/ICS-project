import { onCall } from 'firebase-functions/v2/https';
import { db } from '../shared/firestoreRefs';
import { createNotificationHandlers } from './handlers';
const h = createNotificationHandlers(db);
export const listNotifications = onCall(r => h.list(r));
export const markNotificationRead = onCall(r => h.read(r));
export const openNotification = onCall(r => h.open(r));
export const setNotificationDevice = onCall(r => h.device(r));
