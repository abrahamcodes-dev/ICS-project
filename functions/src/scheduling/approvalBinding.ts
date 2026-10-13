import type { DoctorProfile } from '../../../shared/types/profiles';
import type { VerificationRequest } from '../../../shared/types/verification';
import { fail, LIMITS, safeId, strictRecord, text } from '../profiles/domainValidation';
import { validateDoctorProfile, validateRequest } from '../profiles/verificationPolicy';
import { SCHEDULING } from './constants';
import { compareTimes, positiveRevision, schedulingTimestamp } from './primitives';
/** Pure approval-source binding shared by trusted adapters and call policy. */
export function validateApprovedDoctorBinding(uid: string, profile: DoctorProfile | null, projectionValue: unknown, source: VerificationRequest | null) {
  safeId(uid);
  if (!profile || !source) fail('missing-approved-source');
  validateDoctorProfile(profile); validateRequest(source);
  const fields = ['uid', 'professionalName', 'specialty', 'approvedRevision', 'approvedRequestId', 'schemaVersion', 'publishedAt', 'updatedAt'];
  const projection = strictRecord(projectionValue, fields, fields);
  const requestId = safeId(projection.approvedRequestId);
  const publishedAt = schedulingTimestamp(projection.publishedAt), updatedAt = schedulingTimestamp(projection.updatedAt);
  if (profile.uid !== uid || profile.activeRequestId !== null || profile.approvedRequestId !== requestId
    || projection.uid !== uid || projection.schemaVersion !== SCHEDULING.schemaVersion
    || positiveRevision(projection.approvedRevision) !== profile.revision
    || source.requestId !== requestId || source.doctorUid !== uid || source.state !== 'approved'
    || source.profileRevision !== profile.revision || source.reviewerUid === uid
    || compareTimes(updatedAt, publishedAt) < 0 || !source.reviewedAt || compareTimes(publishedAt, source.reviewedAt) !== 0
    || text(projection.professionalName, LIMITS.name) !== projection.professionalName
    || text(projection.specialty, LIMITS.specialty) !== projection.specialty
    || projection.professionalName !== source.professional.professionalName || projection.specialty !== source.professional.specialty
    || (['professionalName', 'specialty', 'registrationNumber', 'issuingAuthority'] as const)
      .some(key => profile[key] !== source.professional[key])) fail('invalid-approved-binding');
  return { professionalName: projection.professionalName as string, specialty: projection.specialty as string };
}
