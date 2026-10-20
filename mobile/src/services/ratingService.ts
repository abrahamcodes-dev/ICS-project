import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebaseConfig';
import { onIdentityRefresh } from './authService';
import type { ConsultationRating, DoctorRatingSummary } from '@shared/types/ratingContracts';
export type { ConsultationRating, DoctorRatingSummary };
export function validateRatingInput(score: number, comment: string) {
  if (!Number.isInteger(score) || score < 0 || score > 5 || typeof comment !== 'string' || comment.length > 1000
    || /[\u0000-\u001f\u007f]/.test(comment)) throw new Error('Choose 0–5 and a comment up to 1000 characters.');
  return { score, comment: comment.trim() };
}
export function createRatingSession(uid: string) {
  let disposed = false, intent: { consultationId: string; score: number; comment: string } | null = null;
  let pending: Promise<ConsultationRating> | null = null;
  const stop = onIdentityRefresh(() => { disposed = true; intent = null; });
  function check() { if (disposed || auth.currentUser?.uid !== uid) throw new Error('Session changed.'); }
  function id(cid: string) { if (!/^[a-f0-9]{64}$/.test(cid)) throw new Error('Invalid consultation.'); }
  async function call(name: string, data: unknown): Promise<any> {
    check(); const r = await httpsCallable(functions, name)(data); check(); return r.data;
  }
  function parse(value: any, cid: string): ConsultationRating | null {
    if (value === null) return null;
    if (!value || value.consultationId !== cid || !Number.isSafeInteger(value.createdAt)) throw new Error('Invalid rating response.');
    return { consultationId: cid, ...validateRatingInput(value.score, value.comment), createdAt: value.createdAt };
  }
  return {
    dispose() { disposed = true; intent = null; stop(); },
    async get(cid: string) { id(cid); const data = await call('getOwnConsultationRating', { consultationId: cid }); return parse(data?.rating, cid); },
    async summary(): Promise<DoctorRatingSummary> {
      const d = await call('getOwnDoctorRatingSummary', {});
      if (!d || !Number.isSafeInteger(d.count) || d.count < 0 ||
        (d.count === 0 ? d.average !== null : typeof d.average !== 'number' || !Number.isFinite(d.average) || d.average < 0 || d.average > 5))
        throw new Error('Invalid rating summary.');
      return { count: d.count, average: d.average };
    },
    submit(cid: string, score: number, comment: string) {
      check(); id(cid); const next = { consultationId: cid, ...validateRatingInput(score, comment) };
      if (intent && JSON.stringify(intent) !== JSON.stringify(next)) throw new Error('Retry the unchanged rating or retrieve your record.');
      intent = next;
      if (pending) return pending;
      pending = call('rateDoctor', intent).then(data => {
        if (typeof data?.replayed !== 'boolean') throw new Error('Invalid acknowledgment.');
        const result = parse(data.rating, cid);
        if (!result || result.score !== next.score || result.comment !== next.comment) throw new Error('Rating not confirmed.');
        return result;
      }).finally(() => { pending = null; });
      return pending;
    },
  };
}
