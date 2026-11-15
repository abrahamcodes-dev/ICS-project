import { onCall } from '../shared/academicHttps';
import { db } from '../shared/firestoreRefs';
import { createMessageStore } from './messageStore';
import { createSendConsultationMessageHandler } from './messageHandler';
const handler = createSendConsultationMessageHandler(createMessageStore(db));
export const sendConsultationMessage = onCall(request => handler(request));
