import {
  Timestamp,
  collection,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type {
  OpenConsultationInput,
  SendConsultationMessageInput,
} from "@shared/types/consultationContracts";
import { app, db } from "./firebaseConfig";
import { onIdentityRefresh } from "./authService";

export const DEFAULT_MESSAGE_PAGE_SIZE = 30;
export const MAX_MESSAGE_PAGE_SIZE = 50;

export interface ConsultationView {
  consultationId: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  appointmentStartAt: number;
  appointmentEndAt: number;
  state: "active" | "closed";
  createdAt: number;
  closedAt: number | null;
  canSend: boolean;
}

export interface ConsultationMessageView {
  messageId: string;
  senderId: string;
  type: "text";
  text: string;
  createdAt: number;
  readonly createdAtTimestamp: Timestamp;
  schemaVersion: 1;
}

export interface SendMessageResult extends Omit<ConsultationMessageView, "schemaVersion" | "createdAtTimestamp"> {
  consultationId: string;
  replayed: boolean;
}

export interface MessageCursor {
  readonly createdAt: Timestamp;
  readonly messageId: string;
}

export interface MessagePage {
  readonly messages: ConsultationMessageView[];
  readonly nextCursor: MessageCursor | null;
}

function pageSize(value = DEFAULT_MESSAGE_PAGE_SIZE) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_MESSAGE_PAGE_SIZE) {
    throw new Error("Message page size must be an integer from 1 to 50.");
  }
  return value;
}

function safeSegment(value: string, name: string) {
  if (typeof value !== "string" || !value || value.length > 128 || /[\\/\x00-\x1f\x7f]/.test(value)) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function parseMessage(snapshot: QueryDocumentSnapshot<DocumentData>): ConsultationMessageView {
  const data = snapshot.data();
  if (data.messageId !== snapshot.id || typeof data.senderId !== "string" || data.type !== "text"
    || typeof data.text !== "string" || data.schemaVersion !== 1 || !(data.createdAt instanceof Timestamp)) {
    throw new Error("Invalid consultation message received.");
  }
  return { messageId: data.messageId, senderId: data.senderId, type: "text", text: data.text,
    createdAt: data.createdAt.toMillis(), createdAtTimestamp: data.createdAt, schemaVersion: 1 };
}

function messageQuery(consultationId: string, size: number, cursor?: MessageCursor) {
  const room = safeSegment(consultationId, "consultation ID");
  const base = [orderBy("createdAt", "desc"), orderBy(documentId(), "desc"), limit(pageSize(size))];
  if (!cursor) return query(collection(db, "consultations", room, "messages"), ...base);
  safeSegment(cursor.messageId, "message cursor");
  if (!(cursor.createdAt instanceof Timestamp)) throw new Error("Invalid message cursor.");
  return query(collection(db, "consultations", room, "messages"), orderBy("createdAt", "desc"),
    orderBy(documentId(), "desc"), startAfter(cursor.createdAt, cursor.messageId), limit(pageSize(size)));
}

function pageFromSnapshots(docs: QueryDocumentSnapshot<DocumentData>[]): MessagePage {
  const byId = new Map<string, ConsultationMessageView>();
  docs.forEach(snapshot => { const message = parseMessage(snapshot); byId.set(message.messageId, message); });
  const messages = [...byId.values()];
  const last = messages[messages.length - 1];
  return { messages, nextCursor: last ? { createdAt: last.createdAtTimestamp, messageId: last.messageId } : null };
}

export async function openConsultation(appointmentId: string): Promise<ConsultationView> {
  const call = httpsCallable<OpenConsultationInput, ConsultationView>(getFunctions(app), "openConsultation");
  return (await call({ appointmentId: safeSegment(appointmentId, "appointment ID") })).data;
}

/** Keep messageRequestId stable when retrying the same logical send. */
export async function sendConsultationMessage(input: SendConsultationMessageInput): Promise<SendMessageResult> {
  const call = httpsCallable<SendConsultationMessageInput, SendMessageResult>(getFunctions(app), "sendConsultationMessage");
  return (await call(input)).data;
}

export function subscribeToLatestMessages(
  consultationId: string,
  onPage: (page: MessagePage) => void,
  onError: (error: Error) => void,
  size = DEFAULT_MESSAGE_PAGE_SIZE,
): Unsubscribe {
  return onSnapshot(messageQuery(consultationId, size), snapshot => onPage(pageFromSnapshots(snapshot.docs)),
    error => onError(error instanceof Error ? error : new Error("Unable to receive consultation messages.")));
}

export async function loadOlderMessages(consultationId: string, cursor: MessageCursor, size = DEFAULT_MESSAGE_PAGE_SIZE) {
  return pageFromSnapshots((await getDocs(messageQuery(consultationId, size, cursor))).docs);
}

/** Stateful adapter for screens: deduplicates pages and guarantees teardown on logout/identity refresh. */
export function createConsultationMessageSession() {
  const cache = new Map<string, ConsultationMessageView>();
  let unsubscribe: Unsubscribe | null = null;
  let generation = 0, disposed = false;
  let active: { room: string; size: number; notify: (messages: ConsultationMessageView[]) => void } | null = null;
  const clear = () => {
    generation++;
    const previous = active, stop = unsubscribe;
    active = null; unsubscribe = null; cache.clear();
    stop?.(); previous?.notify([]);
  };
  const merge = (page: MessagePage) => {
    page.messages.forEach(message => cache.set(message.messageId, message));
    const messages = [...cache.values()].sort((a, b) =>
      b.createdAtTimestamp.seconds - a.createdAtTimestamp.seconds
      || b.createdAtTimestamp.nanoseconds - a.createdAtTimestamp.nanoseconds
      || (a.messageId < b.messageId ? 1 : a.messageId > b.messageId ? -1 : 0));
    active?.notify(messages);
  };
  const removeIdentityListener = onIdentityRefresh(clear);
  return {
    start(consultationId: string, onMessages: (messages: ConsultationMessageView[]) => void, onError: (error: Error) => void,
      size = DEFAULT_MESSAGE_PAGE_SIZE) {
      if (disposed) throw new Error("Consultation session is disposed.");
      clear();
      const current = generation;
      active = { room: consultationId, size: pageSize(size), notify: onMessages };
      onMessages([]);
      const stop = subscribeToLatestMessages(consultationId, page => {
        if (generation === current && active && !disposed) merge(page);
      }, error => {
        if (generation === current && active && !disposed) onError(error);
      }, size);
      if (generation === current && active && !disposed) unsubscribe = stop;
      else stop();
      return () => { if (generation === current) clear(); };
    },
    // Own the request so its generation is captured before awaiting network work.
    // Untagged externally loaded pages must not be merged into session state.
    async loadOlder(cursor: MessageCursor): Promise<MessagePage | null> {
      if (!active || disposed) return null;
      const current = generation, { room, size } = active;
      try {
        const page = await loadOlderMessages(room, cursor, size);
        if (generation !== current || !active || disposed) return null;
        merge(page);
        return generation === current && active && !disposed ? page : null;
      } catch (error) {
        if (generation !== current || !active || disposed) return null;
        throw error;
      }
    },
    clear,
    dispose() { disposed = true; clear(); removeIdentityListener(); },
  };
}
