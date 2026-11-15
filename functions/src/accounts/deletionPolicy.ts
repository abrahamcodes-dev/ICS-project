import {HttpsError} from 'firebase-functions/v2/https';
import {POST_END_GRACE_MS} from '../consultations/domain';
export const RECENT_AUTH_SECONDS=300;
export const DELETION_PHASES=['sessions','devices','avatars','profiles','staging','evidence','authentication','complete'] as const;
export type DeletionPhase=typeof DELETION_PHASES[number];
export const RETAINED_CATEGORIES=['clinical_records','health_history','professional_verification','ratings','consent_and_audit_history','operational_logs','financial_transactions'];
export function requireRecentAuthentication(authTime:unknown,now=Date.now()){
 if(!Number.isSafeInteger(authTime)||Number(authTime)>Math.floor(now/1000)+30||Math.floor(now/1000)-Number(authTime)>RECENT_AUTH_SECONDS)
  throw new HttpsError('failed-precondition','Reauthenticate before requesting account deletion.');
}
export function assertNoCareCommitment(latest:{endAt:{toMillis():number}}|null,now=Date.now()){
 if(latest&&latest.endAt.toMillis()+POST_END_GRACE_MS>now)
  throw new HttpsError('failed-precondition','Resolve future appointments and active consultations first. Cancel future appointments through Appointments, finish active care and retry after the consultation access window ends.');
}
