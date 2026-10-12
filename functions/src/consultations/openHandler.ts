import { HttpsError } from 'firebase-functions/v2/https';
import type { Appointment } from '../../../shared/types/scheduling';
import type { Consultation, ConsultationAppointment } from '../../../shared/types/consultationContracts';
import type { DomainTimestamp } from '../../../shared/types/profiles';
import { createAuthorization, requireAuthenticated } from '../shared/authorization';
import { DomainValidationError, fail, safeId } from '../profiles/domainValidation';
import { approvedDoctor, type AvailabilityTransaction } from '../scheduling/availabilityHandlers';
import { validateAppointment } from '../scheduling/validation';
import { validateAppointmentProjection, validateOpenInput } from './domain';
import { assertSendWindow, authorizeHistory, authorizeNew, planOpen } from './policy';

export interface ConsultationTransaction extends Pick<AvailabilityTransaction, 'identity' | 'profile' | 'publicProfile' | 'verification'> {
  appointment(id: string): Promise<Appointment | null>;
  consultation(id: string): Promise<Consultation | null>;
  create(value: Consultation): void;
  close(value: Consultation): void;
}
export interface ConsultationDependencies {
  now(): DomainTimestamp;
  transact<T>(action: (tx: ConsultationTransaction) => Promise<T>): Promise<T>;
}
export interface OpenConsultationResult {
  consultationId: string; appointmentId: string; patientId: string; doctorId: string;
  appointmentStartAt: number; appointmentEndAt: number; state: 'active' | 'closed';
  createdAt: number; closedAt: number | null; canSend: boolean;
}
const millis = (t: DomainTimestamp) => t.seconds * 1000 + Math.floor(t.nanoseconds / 1000000);
function response(c: Consultation, canSend: boolean): OpenConsultationResult {
  return { consultationId: c.consultationId, appointmentId: c.appointmentId, patientId: c.patientId, doctorId: c.doctorId,
    appointmentStartAt: millis(c.appointmentStartAt), appointmentEndAt: millis(c.appointmentEndAt), state: c.state,
    createdAt: millis(c.createdAt), closedAt: c.closedAt ? millis(c.closedAt) : null, canSend };
}
const policyDenial = (error: unknown) => error instanceof DomainValidationError || (error instanceof HttpsError && error.code === 'permission-denied');
/** Callable boundary: every authorization read uses the same Firestore transaction. */
export function createOpenConsultationHandler(deps: ConsultationDependencies) {
  return async (request: { auth?: { uid: string }; data: unknown }): Promise<OpenConsultationResult> => {
    const uid = requireAuthenticated(request.auth);
    let input;
    try { safeId(uid); input = validateOpenInput(request.data); }
    catch { throw new HttpsError('invalid-argument', 'Supply only a valid appointment ID.'); }
    try {
      return await deps.transact(async tx => {
        const caller = await createAuthorization(id => tx.identity(id)).requireActive({ uid });
        const stored = await tx.appointment(input.appointmentId);
        if (!stored) fail('appointment-access');
        const appointment = validateAppointment(stored);
        if (appointment.appointmentId !== input.appointmentId) fail('appointment-access');
        const a: ConsultationAppointment = validateAppointmentProjection({ appointmentId: appointment.appointmentId,
          patientId: appointment.patientId, doctorId: appointment.doctorId, startAt: appointment.startAt, endAt: appointment.endAt, status: appointment.status });
        authorizeHistory(a, caller);
        const existing = await tx.consultation(a.appointmentId);
        const patient = uid === a.patientId ? caller : await tx.identity(a.patientId);
        const doctor = uid === a.doctorId ? caller : await tx.identity(a.doctorId);
        const actors = { caller, patient, doctor };
        let sendAuthority = false;
        try {
          authorizeNew(a, actors);
          await approvedDoctor(tx, a.doctorId);
          sendAuthority = true;
        } catch (error) {
          // Approval loss/corruption blocks sending, not otherwise valid historical retrieval.
          if (!policyDenial(error)) throw error;
          if (!existing) throw error;
        }
        const now = deps.now(); // Refreshed after all reads, on every transaction attempt.
        const closure = appointment.status === 'scheduled' ? {} : { terminalDecisionAt: appointment.status === 'cancelled'
          ? appointment.cancellation.cancelledAt : appointment.outcome.recordedAt };
        const plan = planOpen(input, a, existing, actors, now, closure);
        let canSend = sendAuthority && plan.consultation.state === 'active';
        try { assertSendWindow(a, now); } catch (error) { if (!policyDenial(error)) throw error; canSend = false; }
        const result = response(plan.consultation, canSend);
        if (plan.action === 'create') tx.create(plan.consultation);
        if (plan.action === 'close') tx.close(plan.consultation);
        return result;
      });
    } catch (error) {
      if (error instanceof DomainValidationError && error.code === 'consultation-window-closed')
        throw new HttpsError('failed-precondition', 'Appointment is not eligible for consultation creation.');
      if (policyDenial(error)) throw new HttpsError('permission-denied', 'Consultation unavailable to this caller.');
      throw new HttpsError('internal', 'Unable to open consultation. Please retry later.');
    }
  };
}
