import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { consultationTransaction } from '../consultations/consultationStore';
import { fail } from '../profiles/domainValidation';
import { type RatingDependencies, validateRating, validateSummary } from './handlers';
export function createRatingStore(db: Firestore): RatingDependencies {
  return { now: () => { const t = Timestamp.now(); return { seconds: t.seconds, nanoseconds: t.nanoseconds }; },
    transact: action => db.runTransaction(tx => action({ ...consultationTransaction(db, tx),
      rating: async id => {
        const d = (await tx.get(db.collection('ratings').doc(id))).data(); if (!d) return null;
        if (!(d.createdAt instanceof Timestamp)) fail('timestamp');
        const r = validateRating({ ...d, createdAt: { seconds: d.createdAt.seconds, nanoseconds: d.createdAt.nanoseconds } });
        if (r.consultationId !== id) fail('binding'); return r;
      },
      summary: async uid => (await tx.get(db.collection('doctorRatingSummaries').doc(uid))).data() ?? null,
      createRating: value => { const r = validateRating(value); tx.create(db.collection('ratings').doc(r.consultationId),
        { ...r, createdAt: new Timestamp(r.createdAt.seconds, r.createdAt.nanoseconds) }); },
      saveSummary: value => { const s = validateSummary(value, value.doctorId); tx.set(db.collection('doctorRatingSummaries').doc(s.doctorId), s); },
    })) };
}
