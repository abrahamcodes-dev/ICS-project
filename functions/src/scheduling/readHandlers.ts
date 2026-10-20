import { HttpsError } from 'firebase-functions/v2/https';
import type { DoctorDirectoryPage, OwnAvailabilityResult } from '../../../shared/types/schedulingReads';
import { createAuthorization, requireAuthenticated } from '../shared/authorization';
import { DomainValidationError, fail, safeId, strictRecord } from '../profiles/domainValidation';
import { approvedDoctor, type AvailabilityTransaction } from './availabilityHandlers';
import { availabilityId } from './ids';
import { toMilliseconds, utcDate } from './primitives';
import { validateAvailability } from './validation';

export interface SchedulingReadTransaction extends Pick<AvailabilityTransaction,
  'identity' | 'profile' | 'publicProfile' | 'verification' | 'availability'> {
  directory(limit: number, after?: string): Promise<string[]>;
}
export type SchedulingReadRunner = <T>(action: (tx: SchedulingReadTransaction) => Promise<T>) => Promise<T>;
// One bounded query per page. Excluded doctors never trigger an unbounded refill.
export const DIRECTORY_SCAN_LIMIT = 40;
export function createSchedulingReads(run: SchedulingReadRunner) {
  async function execute<T>(action: (tx: SchedulingReadTransaction) => Promise<T>): Promise<T> {
    try { return await run(action); }
    catch (error) {
      if (error instanceof HttpsError && error.code === 'permission-denied')
        throw new HttpsError('permission-denied', 'Active authorized account required.');
      if (error instanceof DomainValidationError)
        throw new HttpsError('failed-precondition', 'Scheduling data is inconsistent. Please refresh or contact support.');
      throw new HttpsError('internal', 'Unable to read scheduling data. Please retry.');
    }
  }
  return {
    async list(request: { auth?: { uid: string }; data: unknown }): Promise<DoctorDirectoryPage> {
      const uid = requireAuthenticated(request.auth);
      let size: number, after: string | undefined;
      try {
        safeId(uid);
        const data = strictRecord(request.data, ['limit', 'after']);
        size = data.limit === undefined ? 10 : data.limit as number;
        if (!Number.isSafeInteger(size) || size < 1 || size > 20) fail('invalid-limit');
        after = data.after === undefined ? undefined : safeId(data.after);
      } catch { throw new HttpsError('invalid-argument', 'Use a page size of 1–20 and a valid document cursor.'); }
      return execute(async tx => {
        const caller = await createAuthorization(id => tx.identity(id)).requireActive({ uid });
        if (caller.role !== 'patient') throw new HttpsError('permission-denied', 'Patient required.');
        const ids = await tx.directory(DIRECTORY_SCAN_LIMIT, after);
        if (ids.length > DIRECTORY_SCAN_LIMIT || ids.some((id, i) =>
          safeId(id) !== id || (i > 0 && Buffer.compare(Buffer.from(id), Buffer.from(ids[i - 1])) <= 0)
          || (after !== undefined && Buffer.compare(Buffer.from(id), Buffer.from(after)) <= 0))) fail('directory-order');
        const items: DoctorDirectoryPage['items'] = [];
        let scanned = 0;
        for (const id of ids) {
          scanned++;
          // Ineligible identities are omitted. Broken approval bindings fail the page closed.
          try { await createAuthorization(key => tx.identity(key)).requireApprovedDoctor({ uid: id }); }
          catch (error) {
            if (error instanceof HttpsError && error.code === 'permission-denied') continue;
            throw error;
          }
          items.push({ uid: id, ...await approvedDoctor(tx, id) });
          if (items.length === size) break;
        }
        const more = scanned < ids.length || ids.length === DIRECTORY_SCAN_LIMIT;
        return { items, nextCursor: more && scanned > 0 ? ids[scanned - 1] : null };
      });
    },
    async ownDay(request: { auth?: { uid: string }; data: unknown }): Promise<OwnAvailabilityResult> {
      const uid = requireAuthenticated(request.auth);
      let date: string;
      try { safeId(uid); date = utcDate(strictRecord(request.data, ['utcDate'], ['utcDate']).utcDate); }
      catch { throw new HttpsError('invalid-argument', 'Supply only a valid UTC date (YYYY-MM-DD).'); }
      return execute(async tx => {
        await approvedDoctor(tx, uid);
        const stored = await tx.availability(availabilityId(uid, date));
        if (!stored) return { day: null };
        const value = validateAvailability(stored);
        if (value.doctorId !== uid || value.utcDate !== date) fail('availability-binding');
        return { day: { utcDate: date, timeZone: value.timeZone, revision: value.revision,
          windows: value.windows.map(w => ({ startAt: toMilliseconds(w.startAt), endAt: toMilliseconds(w.endAt) })) } };
      });
    },
  };
}
