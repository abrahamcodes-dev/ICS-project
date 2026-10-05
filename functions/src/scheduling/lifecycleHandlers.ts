import { HttpsError } from 'firebase-functions/v2/https';
import type { Appointment, AppointmentDecision, AppointmentLifecycleResult, BookingLock } from '../../../shared/types/scheduling';
import { createAuthorization, requireAuthenticated } from '../shared/authorization';
import { DomainValidationError, fail, safeId, strictRecord } from '../profiles/domainValidation';
import { authorize, type AvailabilityDependencies } from './availabilityHandlers';
import { digestId } from './ids';
import { planAppointmentTransition, scheduledLocks } from './policy';
import { validateAppointment, validateDecision } from './validation';

function parseInput(value: unknown, kind: 'cancel' | 'outcome'): { appointmentId: string; decision: AppointmentDecision } {
  const fields = kind === 'cancel' ? ['appointmentId', 'reason'] : ['appointmentId', 'outcome'];
  const data = strictRecord(value, fields, kind === 'cancel' ? ['appointmentId'] : fields);
  if (kind === 'outcome' && data.outcome !== 'completed' && data.outcome !== 'no_show') fail('invalid-outcome');
  return { appointmentId: digestId(data.appointmentId), decision: validateDecision(kind === 'cancel'
    ? { status: 'cancelled', reason: data.reason } : { status: data.outcome }) };
}

/** 4B authorizes doctor-participant outcomes, without a current-approval condition.
 * Canonical active identity is required for every decision and replay. No public projection gate applies here. */
export function createLifecycleHandlers(deps: AvailabilityDependencies) {
  async function execute(request: { auth?: { uid: string }; data: unknown }, kind: 'cancel' | 'outcome'): Promise<AppointmentLifecycleResult> {
    const uid = requireAuthenticated(request.auth);
    let input;
    try { safeId(uid); input = parseInput(request.data, kind); }
    catch { throw new HttpsError('invalid-argument', 'Supply only a valid appointment ID and lifecycle decision.'); }
    const safeErrors = new Set<Error>();
    const deny = (): never => {
      const error = new HttpsError('permission-denied', 'Active authorized participant required.');
      safeErrors.add(error); throw error;
    };
    try {
      return await deps.transact(async tx => {
        const identity = await authorize(createAuthorization(id => tx.identity(id)).requireActive({ uid }), deny);
        if (identity.role !== 'doctor' && (kind !== 'cancel' || identity.role !== 'patient')) deny();
        let appointment: Appointment;
        try {
          const stored = await tx.appointment(input.appointmentId);
          if (!stored) return deny();
          appointment = validateAppointment(stored);
          if (appointment.appointmentId !== input.appointmentId) return deny();
        } catch (error) {
          // Absent, malformed and inaccessible appointments have the same public response.
          if (error instanceof DomainValidationError) return deny();
          throw error;
        }
        if (!((identity.role === 'patient' && appointment.patientId === uid)
          || (identity.role === 'doctor' && appointment.doctorId === uid))) deny();
        const observed: BookingLock[] = [];
        if (appointment.status === 'scheduled') {
          for (const expected of scheduledLocks(appointment)) {
            const lock = await tx.lock(expected.lockId);
            if (!lock) fail('missing-reservation');
            observed.push(lock);
          }
        }
        // Refresh trusted time after reads on every retry. Terminal replays deliberately skip lock reads.
        const plan = planAppointmentTransition(appointment, { uid, role: identity.role }, input.decision, deps.now(), observed);
        if (plan.appointment.status === 'scheduled') fail('terminal-state-required');
        if (plan.changed) {
          // Policy has verified both deterministic resources, appointment references, times and creation metadata.
          tx.saveTerminalAppointment(plan.appointment);
          for (const id of plan.releaseLockIds) tx.deleteLock(id);
        }
        return { appointmentId: plan.appointment.appointmentId, status: plan.appointment.status, replayed: !plan.changed };
      });
    } catch (error) {
      if (error instanceof Error && safeErrors.has(error)) throw error;
      if (error instanceof DomainValidationError) throw new HttpsError('failed-precondition', 'Appointment state, timing or reservation consistency does not permit this decision.');
      throw new HttpsError('internal', 'Appointment decision failed. Please retry later.');
    }
  }
  return {
    cancel: (request: { auth?: { uid: string }; data: unknown }) => execute(request, 'cancel'),
    outcome: (request: { auth?: { uid: string }; data: unknown }) => execute(request, 'outcome'),
  };
}
