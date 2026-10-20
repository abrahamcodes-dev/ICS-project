import { HttpsError } from 'firebase-functions/v2/https';
import type { IssuePrescriptionInput, Prescription, PrescriptionMedication } from '../../../shared/types/prescriptionContracts';
import type { DomainTimestamp } from '../../../shared/types/profiles';
import type { ConsultationTransaction } from '../consultations/openHandler';
import { createAuthorization, requireAuthenticated } from '../shared/authorization';
import { DomainValidationError, fail, strictRecord, text, safeId, timestamp } from '../profiles/domainValidation';
import { digestId } from '../scheduling/ids';
import { bookingRequestId, compareTimes } from '../scheduling/primitives';
import { validateAppointment } from '../scheduling/validation';
import { approvedDoctor } from '../scheduling/availabilityHandlers';
import { bindConsultation, validateAppointmentProjection } from '../consultations/domain';
import { authorizeHistory, authorizeNew, reconcileConsultation } from '../consultations/policy';

export interface StoredPrescription extends Omit<Prescription, 'issuedAt'> {
  issuedAt: DomainTimestamp; requestId: string; issuedBy: string;
}
export interface PrescriptionTransaction extends ConsultationTransaction {
  prescription(id: string): Promise<unknown | null>;
  createPrescription(value: StoredPrescription): void;
}
export interface PrescriptionDependencies {
  now(): DomainTimestamp;
  transact<T>(action: (tx: PrescriptionTransaction) => Promise<T>): Promise<T>;
}
export function medications(value: unknown): PrescriptionMedication[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return fail('invalid-medications');
  return value.map(item => {
    const keys = ['name', 'dosage', 'frequency', 'duration', 'instructions'];
    const d = strictRecord(item, keys, keys);
    return { name: text(d.name, 200), dosage: text(d.dosage, 200), frequency: text(d.frequency, 200),
      duration: text(d.duration, 200), instructions: text(d.instructions, 1000) };
  });
}
export function validateStored(value: unknown): StoredPrescription {
  const keys = ['prescriptionId', 'consultationId', 'appointmentId', 'doctorId', 'patientId', 'medications', 'issuedAt',
    'schemaVersion', 'requestId', 'issuedBy'];
  const d = strictRecord(value, keys, keys);
  const id = digestId(d.prescriptionId), doctorId = safeId(d.doctorId), patientId = safeId(d.patientId);
  if (d.consultationId !== id || d.appointmentId !== id || d.issuedBy !== doctorId
    || patientId === doctorId || d.schemaVersion !== 1) fail('invalid-prescription-binding');
  const m = medications(d.medications);
  if (m.some((item, i) => Object.keys(item).some(k =>
    item[k as keyof PrescriptionMedication] !== (d.medications as PrescriptionMedication[])[i][k as keyof PrescriptionMedication])))
    fail('invalid-prescription-content');
  return { prescriptionId: id, consultationId: id, appointmentId: id, doctorId, patientId,
    medications: m, issuedAt: timestamp(d.issuedAt as DomainTimestamp), schemaVersion: 1,
    requestId: bookingRequestId(d.requestId), issuedBy: doctorId };
}
function dto(value: StoredPrescription): Prescription {
  const { requestId, issuedBy, issuedAt, ...record } = value;
  return { ...record, issuedAt: issuedAt.seconds * 1000 + Math.floor(issuedAt.nanoseconds / 1000000) };
}
/** One immutable prescription per consultation; no updates or deletes. */
export function createPrescriptionHandlers(deps: PrescriptionDependencies) {
  async function execute(request: { auth?: { uid: string }; data: unknown }, issue: boolean) {
    const uid = requireAuthenticated(request.auth);
    let id: string, input: IssuePrescriptionInput | null = null;
    try {
      safeId(uid);
      const keys = issue ? ['consultationId', 'requestId', 'medications'] : ['consultationId'];
      const d = strictRecord(request.data, keys, keys); id = digestId(d.consultationId);
      if (issue) input = { consultationId: id, requestId: bookingRequestId(d.requestId), medications: medications(d.medications) };
    } catch { throw new HttpsError('invalid-argument', 'Supply a valid consultation and structured prescription.'); }
    try {
      return await deps.transact(async tx => {
        const caller = await createAuthorization(key => tx.identity(key)).requireActive({ uid });
        const appointment = validateAppointment(await tx.appointment(id));
        if (appointment.appointmentId !== id) fail('binding');
        const a = validateAppointmentProjection({ appointmentId: id, patientId: appointment.patientId, doctorId: appointment.doctorId,
          startAt: appointment.startAt, endAt: appointment.endAt, status: appointment.status });
        authorizeHistory(a, caller);
        const room = bindConsultation(await tx.consultation(id), a);
        if (issue && (caller.role !== 'doctor' || uid !== a.doctorId)) fail('doctor-required');
        const raw = await tx.prescription(id);
        const existing = raw === null ? null : validateStored(raw);
        if (existing && (existing.patientId !== a.patientId || existing.doctorId !== a.doctorId
          || existing.prescriptionId !== id || appointment.status !== 'completed'
          || compareTimes(existing.issuedAt, appointment.outcome.recordedAt) < 0
          || compareTimes(existing.issuedAt, room.createdAt) < 0)) fail('binding');
        if (!issue) return { prescription: existing ? dto(existing) : null, replayed: false };
        if (existing) {
          if (existing.requestId !== input!.requestId || JSON.stringify(existing.medications) !== JSON.stringify(input!.medications))
            throw new HttpsError('already-exists', 'A prescription already exists. Retrieve it before continuing.');
          return { prescription: dto(existing), replayed: true };
        }
        if (appointment.status !== 'completed') throw new HttpsError('failed-precondition', 'A recorded completed appointment is required.');
        const patient = await tx.identity(a.patientId);
        authorizeNew(a, { caller, patient, doctor: caller });
        await approvedDoctor(tx, uid);
        const now = deps.now(); // Single clock after all required transaction reads.
        if (compareTimes(now, appointment.outcome.recordedAt) < 0) fail('clock');
        const closed = reconcileConsultation(room, a, now, { terminalDecisionAt: appointment.outcome.recordedAt });
        const record = validateStored({ prescriptionId: id, consultationId: id, appointmentId: id, doctorId: uid,
          patientId: a.patientId, medications: input!.medications, requestId: input!.requestId, issuedBy: uid,
          issuedAt: now, schemaVersion: 1 });
        if (room.state === 'active') tx.close(closed);
        tx.createPrescription(record);
        return { prescription: dto(record), replayed: false };
      });
    } catch (e) {
      if (e instanceof HttpsError && ['already-exists', 'failed-precondition'].includes(e.code)) throw e;
      if (e instanceof DomainValidationError || (e instanceof HttpsError && e.code === 'permission-denied'))
        throw new HttpsError('permission-denied', 'Prescription unavailable to this account.');
      throw new HttpsError('internal', 'Prescription operation could not be confirmed. Retry safely.');
    }
  }
  return { issue: (r: { auth?: { uid: string }; data: unknown }) => execute(r, true),
    get: (r: { auth?: { uid: string }; data: unknown }) => execute(r, false) };
}
