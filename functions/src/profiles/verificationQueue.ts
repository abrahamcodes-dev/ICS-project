import {HttpsError} from 'firebase-functions/v2/https';
import {createAuthorization, requireAuthenticated} from '../shared/authorization';
import {safeId, strictRecord, timestamp} from './domainValidation';
import {validateRequest} from './verificationPolicy';
import type {VerificationRequest} from '../../../shared/types/verification';
import type {VerificationQueuePage} from '../../../shared/types/verificationQueue';

export interface QueueTransaction {
  identity(uid: string): Promise<unknown>;
  list(limit: number, after?: string): Promise<{id: string; data: VerificationRequest}[]>;
}
export function createVerificationQueue(run: <T>(work: (tx: QueueTransaction) => Promise<T>) => Promise<T>) {
  return async (request: {auth?: {uid: string}; data: unknown}): Promise<VerificationQueuePage> => {
    const uid = requireAuthenticated(request.auth);
    let limit: number, after: string | undefined;
    try {
      const data = strictRecord(request.data, ['limit', 'after']);
      limit = data.limit === undefined ? 10 : data.limit as number;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error();
      after = data.after === undefined ? undefined : safeId(data.after);
    } catch { throw new HttpsError('invalid-argument', 'Use a limit of 1–20 and a valid cursor.'); }
    return run(async tx => {
      await createAuthorization(id => tx.identity(id)).requireAdministrator({uid});
      const rows = await tx.list(limit + 1, after);
      try {
        // A corrupt request fails the page closed; never forward arbitrary document fields.
        if (rows.length > limit + 1) throw new Error();
        for (const row of rows) {
          validateRequest(row.data);
          if (row.id !== row.data.requestId || row.data.state !== 'submitted') throw new Error();
        }
        const items = rows.slice(0, limit).map(({data}) => ({
          requestId: data.requestId, doctorUid: data.doctorUid, profileRevision: data.profileRevision,
          professional: {...data.professional}, credentials: data.credentials.map(ref => ({...ref})),
          submittedAt: timestamp(data.submittedAt),
        }));
        return {items, nextCursor: rows.length > limit ? items[items.length - 1].requestId : null};
      } catch { throw new HttpsError('failed-precondition', 'Verification queue contains invalid data. Contact the operator.'); }
    });
  };
}
