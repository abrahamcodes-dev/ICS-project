import { fromMilliseconds as ts } from '../src/scheduling/primitives';
export const day = '2026-10-05';
export const start = Date.parse(day + 'T10:00:00Z');
export const now = start - 3600000;
export const input = () => ({ utcDate: day, timeZone: 'Africa/Nairobi', windows: [{ startAt: start, endAt: start + 3600000 }], expectedRevision: 0 });
export function identity(uid = 'doctor', role = 'doctor', extra = {}) {
  return { uid, role, email: uid + '@example.test', fullName: 'Test User', status: 'active', schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...(role === 'doctor' ? { verificationStatus: 'approved' } : {}), ...extra };
}
export function approvedDocuments(): Record<string, any> {
  const time = ts(now - 86400000);
  const professional = { professionalName: 'Doctor Name', specialty: 'Medicine', registrationNumber: 'private-registration', issuingAuthority: 'Authority' };
  return {
    'users/doctor': identity(), 'users/patient': identity('patient', 'patient'),
    'doctorProfiles/doctor': { uid: 'doctor', ...professional, phoneNumber: '+251111111', revision: 2, activeRequestId: null,
      approvedRequestId: 'approved', schemaVersion: 1, createdAt: time, updatedAt: time },
    'doctorPublicProfiles/doctor': { uid: 'doctor', professionalName: professional.professionalName, specialty: professional.specialty,
      approvedRevision: 2, approvedRequestId: 'approved', schemaVersion: 1, publishedAt: time, updatedAt: time },
    'verificationRequests/approved': { requestId: 'approved', doctorUid: 'doctor', profileRevision: 2, professional,
      credentials: [{ credentialId: 'private-credential', category: 'medical_license', generation: '1', checksum: 'a'.repeat(64) }],
      previousRequestId: null, state: 'approved', reviewedAt: time, reviewerUid: 'reviewer', submittedAt: time,
      schemaVersion: 1, createdAt: time, updatedAt: time },
  };
}
