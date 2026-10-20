import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { consultationTransaction } from '../consultations/consultationStore';
import { fail } from '../profiles/domainValidation';
import { writeEvent } from '../notifications/events';
import { validateStored, type PrescriptionDependencies } from './handlers';
export function createPrescriptionStore(db: Firestore): PrescriptionDependencies {
  return {
    now: () => { const t = Timestamp.now(); return { seconds: t.seconds, nanoseconds: t.nanoseconds }; },
    transact: action => db.runTransaction(tx => action({
      ...consultationTransaction(db, tx),
      prescription: async id => {
        const snap = await tx.get(db.collection('prescriptions').doc(id));
        if (!snap.exists) return null;
        const d = snap.data()!;
        if (!(d.issuedAt instanceof Timestamp)) fail('stored-timestamp');
        const record = validateStored({ ...d, issuedAt: { seconds: d.issuedAt.seconds, nanoseconds: d.issuedAt.nanoseconds } });
        if (record.prescriptionId !== id) fail('binding');
        return record;
      },
      createPrescription: value => {
        const d = validateStored(value);
        tx.create(db.collection('prescriptions').doc(d.prescriptionId),
          { ...d, issuedAt: new Timestamp(d.issuedAt.seconds, d.issuedAt.nanoseconds) });
        writeEvent(db, tx, d.patientId, 'prescription', d.prescriptionId, d.appointmentId, d.issuedAt);
      },
    })),
  };
}
