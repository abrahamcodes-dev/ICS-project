import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { DomainTimestamp } from '../../../shared/types/profiles';
import { fail, safeId } from '../profiles/domainValidation';
import { consultationTransaction } from './consultationStore';
import { consultationId, validateMessage, validateSendState } from './domain';
import { digestId } from '../scheduling/ids';
import type { MessageDependencies } from './messageHandler';
import type { Consultation } from '../../../shared/types/consultationContracts';
import { writeEvent } from '../notifications/events';
function decode(value: unknown): DomainTimestamp {
  if (!(value instanceof Timestamp)) return fail('stored-timestamp');
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
const encode = (t: DomainTimestamp) => new Timestamp(t.seconds, t.nanoseconds);
/** SDK adapter only; injected Firestore instance, no Firebase initialization. */
export function createMessageStore(db: Firestore): MessageDependencies {
  return {
    now: () => decode(Timestamp.now()),
    transact: action => db.runTransaction(async tx => {
      const readers = consultationTransaction(db, tx);
      let observedRoom: Consultation | null = null;
      const roomRef = (room: string) => db.collection('consultations').doc(consultationId(room));
      return action({
        identity: readers.identity, profile: readers.profile, publicProfile: readers.publicProfile, verification: readers.verification,
        appointment: readers.appointment, consultation: async id => { observedRoom = await readers.consultation(id); return observedRoom; },
        message: async (room, id) => {
          const data = (await tx.get(roomRef(room).collection('messages').doc(digestId(id)))).data();
          if (!data) return null;
          const message = validateMessage({ ...data, createdAt: decode(data.createdAt) });
          if (message.messageId !== id) fail('message-document-binding');
          return message;
        },
        senderState: async (room, uid) => {
          const data = (await tx.get(roomRef(room).collection('senderState').doc(safeId(uid)))).data();
          if (!data) return null;
          const state = validateSendState({ ...data, lastAcceptedAt: decode(data.lastAcceptedAt) });
          if (state.consultationId !== room || state.senderId !== uid) fail('sender-state-binding');
          return state;
        },
        createMessage: (room, value) => {
          const message = validateMessage(value);
          if (!observedRoom || observedRoom.consultationId !== room
            || ![observedRoom.patientId, observedRoom.doctorId].includes(message.senderId)) fail('notification-binding');
          tx.create(roomRef(room).collection('messages').doc(message.messageId), { ...message, createdAt: encode(message.createdAt) });
          writeEvent(db, tx, message.senderId === observedRoom.patientId ? observedRoom.doctorId : observedRoom.patientId,
            'message', message.messageId, room, message.createdAt);
        },
        saveSenderState: value => {
          const state = validateSendState(value);
          tx.set(roomRef(state.consultationId).collection('senderState').doc(state.senderId), { ...state, lastAcceptedAt: encode(state.lastAcceptedAt) });
        },
        close: value => readers.close(value),
      });
    }),
  };
}
