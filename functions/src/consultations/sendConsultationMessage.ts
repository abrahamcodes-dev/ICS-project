import { onCall } from 'firebase-functions/v2/https';
import { db } from '../shared/firestoreRefs';
import { createMessageStore } from './messageStore';
import { createSendConsultationMessageHandler } from './messageHandler';
const handler = createSendConsultationMessageHandler(createMessageStore(db));
export const sendConsultationMessage = onCall(request => handler(request));
