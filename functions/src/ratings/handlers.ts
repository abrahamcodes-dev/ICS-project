import { HttpsError } from 'firebase-functions/v2/https';
import type { DomainTimestamp } from '../../../shared/types/profiles';
import type { ConsultationTransaction } from '../consultations/openHandler';
import { requireAuthenticated, createAuthorization } from '../shared/authorization';
import { DomainValidationError, strictRecord, fail, safeId, timestamp } from '../profiles/domainValidation';
import { digestId } from '../scheduling/ids';
import { compareTimes } from '../scheduling/primitives';
import { validateAppointment } from '../scheduling/validation';
import { bindConsultation, validateAppointmentProjection } from '../consultations/domain';
import { authorizeHistory } from '../consultations/policy';
export interface RatingRecord {
  consultationId: string; appointmentId: string; patientId: string; doctorId: string;
  score: number; comment: string; createdAt: DomainTimestamp; schemaVersion: 1;
}
export interface Summary { doctorId: string; count: number; sum: number; schemaVersion: 1 }
export interface RatingTransaction extends ConsultationTransaction {
  rating(id: string): Promise<unknown | null>; summary(uid: string): Promise<unknown | null>;
  createRating(record: RatingRecord): void; saveSummary(summary: Summary): void;
}
export interface RatingDependencies { now(): DomainTimestamp; transact<T>(f: (tx: RatingTransaction) => Promise<T>): Promise<T> }
export function score(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 5) return fail('invalid-score');
  return value as number;
}
export function comment(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > 1000 || /[\u0000-\u001f\u007f]/.test(value)) return fail('invalid-comment');
  return value.trim();
}
export function validateRating(value: unknown): RatingRecord {
  const keys = ['consultationId', 'appointmentId', 'patientId', 'doctorId', 'score', 'comment', 'createdAt', 'schemaVersion'];
  const d = strictRecord(value, keys, keys), id = digestId(d.consultationId);
  if (d.appointmentId !== id || d.schemaVersion !== 1 || d.patientId === d.doctorId || comment(d.comment) !== d.comment) fail('rating-binding');
  return { consultationId: id, appointmentId: id, patientId: safeId(d.patientId), doctorId: safeId(d.doctorId),
    score: score(d.score), comment: comment(d.comment), createdAt: timestamp(d.createdAt as DomainTimestamp), schemaVersion: 1 };
}
export function validateSummary(value: unknown, uid: string): Summary {
  if (value === null) return { doctorId: uid, count: 0, sum: 0, schemaVersion: 1 };
  const d = strictRecord(value, ['doctorId', 'count', 'sum', 'schemaVersion'], ['doctorId', 'count', 'sum', 'schemaVersion']);
  if (d.doctorId !== uid || d.schemaVersion !== 1 || !Number.isSafeInteger(d.count) || !Number.isSafeInteger(d.sum)
    || (d.count as number) < 0 || (d.sum as number) < 0 || (d.sum as number) > (d.count as number) * 5) fail('summary-binding');
  return d as unknown as Summary;
}
function view(r: RatingRecord) {
  return { consultationId: r.consultationId, score: r.score, comment: r.comment,
    createdAt: r.createdAt.seconds * 1000 + Math.floor(r.createdAt.nanoseconds / 1000000) };
}
export function createRatingHandlers(deps: RatingDependencies) {
  async function execute(request: { auth?: { uid: string }; data: unknown }, operation: 'rate' | 'get' | 'summary') {
    const uid = requireAuthenticated(request.auth);
    let id = '', points = 0, note = '';
    try {
      safeId(uid);
      const keys = operation === 'summary' ? [] : operation === 'get' ? ['consultationId'] : ['consultationId', 'score', 'comment'];
      const d = strictRecord(request.data, keys, operation === 'rate' ? ['consultationId', 'score'] : keys);
      if (operation !== 'summary') id = digestId(d.consultationId);
      if (operation === 'rate') { points = score(d.score); note = comment(d.comment); }
    } catch { throw new HttpsError('invalid-argument', 'Supply a consultation, integer score 0–5 and optional comment up to 1000 characters.'); }
    try {
      return await deps.transact(async tx => {
        const caller = await createAuthorization(key => tx.identity(key)).requireActive({ uid });
        if (operation === 'summary') {
          if (caller.role !== 'doctor') fail('doctor-required');
          const s = validateSummary(await tx.summary(uid), uid);
          return { count: s.count, average: s.count ? s.sum / s.count : null };
        }
        if (caller.role !== 'patient') fail('patient-required');
        const a = validateAppointment(await tx.appointment(id));
        if (a.appointmentId !== id) fail('binding');
        const projection = validateAppointmentProjection({ appointmentId: id, patientId: a.patientId, doctorId: a.doctorId,
          startAt: a.startAt, endAt: a.endAt, status: a.status });
        authorizeHistory(projection, caller);
        const room = bindConsultation(await tx.consultation(id), projection);
        if (a.status !== 'completed') throw new HttpsError('failed-precondition', 'A recorded completed consultation appointment is required.');
        const raw = await tx.rating(id), existing = raw === null ? null : validateRating(raw);
        if (existing && (existing.consultationId !== id || existing.patientId !== uid || existing.doctorId !== a.doctorId
          || compareTimes(existing.createdAt, a.outcome.recordedAt) < 0 || compareTimes(existing.createdAt, room.createdAt) < 0)) fail('binding');
        if (operation === 'get') return { rating: existing ? view(existing) : null };
        if (existing) {
          if (existing.score !== points || existing.comment !== note) throw new HttpsError('already-exists', 'A different rating already exists. Retrieve your rating.');
          return { rating: view(existing), replayed: true };
        }
        const summary = validateSummary(await tx.summary(a.doctorId), a.doctorId);
        const now = deps.now();
        if (compareTimes(now, a.outcome.recordedAt) < 0 || compareTimes(now, room.createdAt) < 0) fail('clock');
        const rating = validateRating({ consultationId: id, appointmentId: id, patientId: uid, doctorId: a.doctorId,
          score: points, comment: note, createdAt: now, schemaVersion: 1 });
        const next = validateSummary({ ...summary, count: summary.count + 1, sum: summary.sum + points }, a.doctorId);
        tx.createRating(rating); tx.saveSummary(next);
        return { rating: view(rating), replayed: false };
      });
    } catch (e) {
      if (e instanceof HttpsError && ['already-exists', 'failed-precondition'].includes(e.code)) throw e;
      if (e instanceof DomainValidationError || (e instanceof HttpsError && e.code === 'permission-denied'))
        throw new HttpsError('permission-denied', 'Rating unavailable to this account.');
      throw new HttpsError('internal', 'Rating operation not confirmed. Retry safely.');
    }
  }
  return { rate: (r: { auth?: { uid: string }; data: unknown }) => execute(r, 'rate'),
    get: (r: { auth?: { uid: string }; data: unknown }) => execute(r, 'get'),
    summary: (r: { auth?: { uid: string }; data: unknown }) => execute(r, 'summary') };
}
