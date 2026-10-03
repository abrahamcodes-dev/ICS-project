const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
import { createVerificationHandlers, VerificationDependencies, VerificationTransaction } from '../../src/profiles/verificationHandlers';
import { fail } from '../../src/profiles/domainValidation';
export const now = { seconds: 1810000000, nanoseconds: 0 };
export const professional = { professionalName: 'Doctor Name', specialty: 'Medicine', registrationNumber: 'REG-1', issuingAuthority: 'Board' };
export const identity = (uid = 'doctor', role = 'doctor', extra = {}) => ({ uid, role, email: uid + '@example.test', fullName: 'Name',
  status: 'active', schemaVersion: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  ...(role === 'doctor' ? { verificationStatus: 'pending' } : {}), ...extra });
export const credential = (id = 'license', extra = {}) => ({ credentialId: id, doctorUid: 'doctor', storagePath: `doctorCredentials/doctor/${id}/document`,
  category: 'medical_license', contentType: 'application/pdf', sizeBytes: 3, state: 'ready', generation: '123', checksum: 'a'.repeat(64),
  requestId: null, schemaVersion: 1, createdAt: now, updatedAt: now, expiresAt: { ...now, seconds: now.seconds + 900 }, ...extra });
export function fixture() {
  let docs: Record<string, any> = { 'users/doctor': identity(), 'users/admin': identity('admin', 'administrator'),
    'doctorProfiles/doctor': { uid: 'doctor', ...professional, phoneNumber: '123', revision: 1,
      activeRequestId: null, approvedRequestId: null, schemaVersion: 1, createdAt: now, updatedAt: now },
    'doctorCredentials/license': credential() };
  let sequence = 0, queue = Promise.resolve();
  const control = { failCommit: false };
  const inspect = jest.fn(async (path: string) => {
    const data = docs['doctorCredentials/' + path.split('/')[2]]; if (!data) return fail('object-missing');
    return { generation: data.generation, checksum: data.checksum, sizeBytes: data.sizeBytes, contentType: data.contentType };
  });
  const assertUnchanged = jest.fn(async () => {});
  const deps: VerificationDependencies = { now: () => now, newId: () => 'request-' + (++sequence), inspect, assertUnchanged,
    transact: async action => {
      const previous = queue; let unlock!: () => void; queue = new Promise(resolve => { unlock = resolve; }); await previous;
      const staged = clone(docs); let writes = 0;
      const read = (path: string) => clone(staged[path] ?? null);
      const save = (path: string, data: unknown) => { writes++; staged[path] = clone(data); };
      const create = (path: string, data: unknown) => { if (path in staged) throw new Error('already exists'); save(path, data); };
      const tx: VerificationTransaction = {
        identity: async uid => read('users/' + uid), profile: async uid => read('doctorProfiles/' + uid),
        credential: async id => read('doctorCredentials/' + id), request: async id => read('verificationRequests/' + id),
        audit: async id => read('verificationAudit/' + id),
        latest: async uid => Object.entries(staged).filter(([key, value]) => key.startsWith('verificationRequests/') && value.doctorUid === uid)
          .map(([, value]) => clone(value)).sort((a, b) => b.profileRevision - a.profileRevision)[0] ?? null,
        createRequest: value => create('verificationRequests/' + value.requestId, value),
        saveRequest: value => save('verificationRequests/' + value.requestId, value),
        saveProfile: value => save('doctorProfiles/' + value.uid, value), saveIdentity: value => save('users/' + value.uid, value),
        saveCredential: value => save('doctorCredentials/' + value.credentialId, value),
        publish: (uid, value) => { writes++; if (value) staged['doctorPublicProfiles/' + uid] = clone(value); else delete staged['doctorPublicProfiles/' + uid]; },
        createAudit: value => create('verificationAudit/' + value.eventId, value),
      };
      try { const result = await action(tx); if (writes && control.failCommit) throw new Error('test commit failure'); docs = staged; return result; }
      finally { unlock(); }
    } };
  const handlers = createVerificationHandlers(deps);
  return { get docs() { return docs; }, handlers, deps, inspect, assertUnchanged, control,
    submit: (data = {}, uid = 'doctor') => handlers.submit({ auth: { uid }, data: { credentialIds: ['license'], expectedRevision: 1, ...data } }),
    review: (data = {}, uid = 'admin') => handlers.review({ auth: { uid }, data: { requestId: 'request-1', expectedRevision: 1, decision: 'approved', ...data } }),
    requests: () => Object.entries(docs).filter(([key]) => key.startsWith('verificationRequests/')).map(([, value]) => value),
    audits: () => Object.entries(docs).filter(([key]) => key.startsWith('verificationAudit/')).map(([, value]) => value),
  };
}
