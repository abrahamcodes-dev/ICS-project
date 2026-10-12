import { HttpsError } from 'firebase-functions/v2/https';
import type { Consultation, ConsultationMessage, ConsultationSendState } from '../../../shared/types/consultationContracts';
import type { DomainTimestamp } from '../../../shared/types/profiles';
import type { ConsultationTransaction } from './openHandler';
import { createAuthorization, requireAuthenticated } from '../shared/authorization';
import { DomainValidationError, fail, safeId } from '../profiles/domainValidation';
import { approvedDoctor } from '../scheduling/availabilityHandlers';
import { validateAppointment } from '../scheduling/validation';
import { bindConsultation, messageId, validateAppointmentProjection, validateSendInput } from './domain';
import { authorizeHistory, authorizeNew, planSend, reconcileConsultation } from './policy';
export interface MessageTransaction extends Pick<ConsultationTransaction, 'identity' | 'profile' | 'publicProfile' | 'verification' | 'appointment' | 'consultation'> {
  message(room: string, id: string): Promise<ConsultationMessage | null>;
  senderState(room: string, uid: string): Promise<ConsultationSendState | null>;
  createMessage(room: string, message: ConsultationMessage): void;
  saveSenderState(state: ConsultationSendState): void;
  close(value: Consultation): void;
}
export interface MessageDependencies {
  now(): DomainTimestamp;
  transact<T>(action: (tx: MessageTransaction) => Promise<T>): Promise<T>;
}
export interface SendConsultationMessageResult {
  consultationId: string; messageId: string; senderId: string; type: 'text'; text: string; createdAt: number; replayed: boolean;
}
type SendTransactionOutcome =
  | { readonly kind: 'success'; readonly result: SendConsultationMessageResult }
  | { readonly kind: 'closed' };
/** No logging: text and underlying storage errors must never enter diagnostic output. */
export function createSendConsultationMessageHandler(deps: MessageDependencies) {
  return async (request: { auth?: { uid: string }; data: unknown }): Promise<SendConsultationMessageResult> => {
    const uid = requireAuthenticated(request.auth);
    let input;
    try { safeId(uid); input = validateSendInput(request.data); }
    catch { throw new HttpsError('invalid-argument', 'Supply a valid consultation ID, request UUID and text.'); }
    try {
      const outcome = await deps.transact<SendTransactionOutcome>(async tx => {
        const caller = await createAuthorization(key => tx.identity(key)).requireActive({ uid });
        const rawAppointment = await tx.appointment(input.consultationId);
        if (!rawAppointment) fail('consultation-access');
        const appointment = validateAppointment(rawAppointment);
        if (appointment.appointmentId !== input.consultationId) fail('consultation-binding');
        const a = validateAppointmentProjection({ appointmentId: appointment.appointmentId, patientId: appointment.patientId,
          doctorId: appointment.doctorId, startAt: appointment.startAt, endAt: appointment.endAt, status: appointment.status });
        authorizeHistory(a, caller);
        const room = bindConsultation(await tx.consultation(input.consultationId), a);
        const id = messageId(room.consultationId, uid, input.messageRequestId);
        const existing = await tx.message(room.consultationId, id);
        const closure = appointment.status === 'scheduled' ? {} : { terminalDecisionAt: appointment.status === 'cancelled'
          ? appointment.cancellation.cancelledAt : appointment.outcome.recordedAt };

        if (existing !== null) {
          // Replay deliberately does not read counterpart, approval or private rate documents.
          const now = deps.now(); // All replay reads are complete.
          const plan = planSend(input, a, room, existing, null, { caller, patient: null, doctor: null }, now, closure);
          const effective = reconcileConsultation(room, a, now, closure);
          if (room.state === 'active' && effective.state === 'closed') tx.close(effective);
          const result: SendConsultationMessageResult = { consultationId: room.consultationId, messageId: plan.message.messageId,
            senderId: plan.message.senderId, type: 'text', text: plan.message.text,
            createdAt: plan.message.createdAt.seconds * 1000 + Math.floor(plan.message.createdAt.nanoseconds / 1000000), replayed: true };
          return { kind: 'success', result };
        }

        const patient = uid === a.patientId ? caller : await tx.identity(a.patientId);
        const doctor = uid === a.doctorId ? caller : await tx.identity(a.doctorId);
        const actors = { caller, patient, doctor };
        let sendError: unknown;
        let rate: ConsultationSendState | null = null;
        try {
          authorizeNew(a, actors);
          await approvedDoctor(tx, a.doctorId);
          rate = await tx.senderState(room.consultationId, uid);
        } catch (error) {
          // History-authorized closure remains possible after approval/counterpart loss.
          // Infrastructure failures must still abort rather than masquerade as denials.
          if (!(error instanceof DomainValidationError || (error instanceof HttpsError && error.code === 'permission-denied'))) throw error;
          sendError = error;
        }
        const now = deps.now(); // One decision time per attempt, after all required reads.
        // Returning instead of throwing lets Firestore commit a closure before rejection.
        const effective = reconcileConsultation(room, a, now, closure);
        if (effective.state === 'closed') {
          if (room.state === 'active') tx.close(effective);
          return { kind: 'closed' };
        }

        if (sendError) throw sendError;
        const plan = planSend(input, a, room, null, rate, actors, now, closure);
        const result: SendConsultationMessageResult = { consultationId: room.consultationId, messageId: plan.message.messageId,
          senderId: plan.message.senderId, type: 'text', text: plan.message.text,
          createdAt: plan.message.createdAt.seconds * 1000 + Math.floor(plan.message.createdAt.nanoseconds / 1000000), replayed: false };
        tx.createMessage(room.consultationId, plan.message);
        if (plan.rateState === null) {
          throw new Error('missing-rate-state');
        }
        tx.saveSenderState(plan.rateState);
        return { kind: 'success', result };
      });
      if (outcome.kind === 'closed') throw new HttpsError('failed-precondition', 'Consultation is not eligible for new messages.');
      return outcome.result;
    } catch (error) {
      if (error instanceof DomainValidationError) {
        if (error.code === 'message-rate-limited') throw new HttpsError('resource-exhausted', 'Please wait before sending another message.');
        if (error.code === 'conflicting-message-retry') throw new HttpsError('already-exists', 'Message request conflicts with existing data.');
        if (['consultation-window-closed', 'consultation-closed'].includes(error.code))
          throw new HttpsError('failed-precondition', 'Consultation is not eligible for new messages.');
        throw new HttpsError('permission-denied', 'Consultation unavailable to this caller.');
      }
      if (error instanceof HttpsError && error.code === 'failed-precondition') throw error;
      if (error instanceof HttpsError && error.code === 'permission-denied')
        throw new HttpsError('permission-denied', 'Consultation unavailable to this caller.');
      throw new HttpsError('internal', 'Unable to send message. Please retry later.');
    }
  };
}
