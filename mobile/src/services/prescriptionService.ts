import { httpsCallable } from 'firebase/functions';
import { uuid } from 'expo-modules-core';
import type { Prescription, PrescriptionMedication, IssuePrescriptionInput } from '@shared/types/prescription';
import { auth, functions } from './firebaseConfig';
import { onIdentityRefresh } from './authService';
export type { Prescription, PrescriptionMedication };
export function validateMedication(value: PrescriptionMedication): PrescriptionMedication {
  const out = {} as PrescriptionMedication;
  for (const key of ['name', 'dosage', 'frequency', 'duration', 'instructions'] as const) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].trim().length > (key === 'instructions' ? 1000 : 200)
      || /[\u0000-\u001f\u007f]/.test(value[key])) throw new Error('Complete all medication fields within the displayed limits.');
    out[key] = value[key].trim();
  }
  return out;
}
function parse(value: unknown, cid: string, uid: string): Prescription | null {
  if (value === null) return null;
  const p = value as Prescription;
  if (!p || p.prescriptionId !== cid || p.consultationId !== cid || p.appointmentId !== cid || p.schemaVersion !== 1
    || typeof p.doctorId !== 'string' || typeof p.patientId !== 'string' || p.patientId === p.doctorId
    || ![p.patientId, p.doctorId].includes(uid) || !Number.isSafeInteger(p.issuedAt)
    || !Array.isArray(p.medications) || p.medications.length < 1 || p.medications.length > 10) throw new Error('Invalid prescription response.');
  return { prescriptionId: cid, consultationId: cid, appointmentId: cid, doctorId: p.doctorId, patientId: p.patientId,
    schemaVersion: 1, issuedAt: p.issuedAt, medications: p.medications.map(validateMedication) };
}
export function createPrescriptionSession(uid: string, cid: string) {
  if (!/^[a-f0-9]{64}$/.test(cid)) throw new Error('Invalid consultation.');
  let disposed = false, input: IssuePrescriptionInput | null = null, pending: Promise<Prescription> | null = null;
  const stop = onIdentityRefresh(() => { disposed = true; input = null; });
  function check() { if (disposed || auth.currentUser?.uid !== uid) throw new Error('Session changed.'); }
  async function call(name: string, data: unknown) {
    check(); const result = await httpsCallable(functions, name)(data); check();
    const body = result.data as { prescription: unknown; replayed: boolean };
    if (!body || typeof body.replayed !== 'boolean') throw new Error('Invalid response.');
    return parse(body.prescription, cid, uid);
  }
  return {
    dispose() { disposed = true; input = null; stop(); },
    get: () => call('getConsultationPrescription', { consultationId: cid }),
    issue(meds: PrescriptionMedication[]): Promise<Prescription> {
      check();
      if (!Array.isArray(meds) || meds.length < 1 || meds.length > 10) throw new Error('Supply 1–10 medications.');
      const normalized = meds.map(validateMedication);
      if (input && JSON.stringify(input.medications) !== JSON.stringify(normalized)) throw new Error('Retry the unchanged prescription or retrieve the existing record.');
      if (pending) return pending;
      if (!input) input = { consultationId: cid, requestId: uuid.v4(), medications: normalized };
      pending = call('issuePrescription', input).then(p => { if (!p || p.doctorId !== uid) throw new Error('Issuance not confirmed.'); return p; }).finally(() => { pending = null; });
      return pending;
    },
  };
}
