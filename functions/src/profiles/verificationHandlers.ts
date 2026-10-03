import { createHash } from 'crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallADocIdentity } from '../../../shared/types/identity';
import type { DoctorProfile, DoctorPublicProfile, DomainTimestamp } from '../../../shared/types/profiles';
import type { DoctorCredentialRecord, VerificationRequest, VerificationAudit, VerificationReviewInput } from '../../../shared/types/verification';
import { createAuthorization, requireAuthenticated } from '../shared/authorization';
import { validIdentity } from '../auth/registrationPolicy';
import { DomainValidationError, fail, safeId, strictRecord, timestamp, validateReviewInput } from './domainValidation';
import { planVerificationSubmission, planVerificationReview, validateRequest, validateDoctorProfile, validateCredentialRecord } from './verificationPolicy';
import type { ObservedCredential } from './credentialHandlers';

export interface VerificationTransaction {
  identity(uid: string): Promise<unknown>;
  profile(uid: string): Promise<DoctorProfile | null>;
  credential(id: string): Promise<DoctorCredentialRecord | null>;
  request(id: string): Promise<VerificationRequest | null>;
  latest(uid: string): Promise<VerificationRequest | null>;
  audit(id: string): Promise<VerificationAudit | null>;
  createRequest(value: VerificationRequest): void;
  saveRequest(value: VerificationRequest): void;
  saveProfile(value: DoctorProfile): void;
  saveCredential(value: DoctorCredentialRecord): void;
  saveIdentity(value: CallADocIdentity): void;
  publish(uid: string, value: DoctorPublicProfile | null): void;
  createAudit(value: VerificationAudit): void;
}
export interface VerificationDependencies {
  now(): DomainTimestamp;
  newId(): string;
  transact<T>(action: (tx: VerificationTransaction) => Promise<T>): Promise<T>;
  inspect(path: string): Promise<ObservedCredential>;
  assertUnchanged(path: string, observed: ObservedCredential): Promise<void>;
}
export const verificationEventId = (requestId: string, phase: 'submitted' | 'review') =>
  createHash('sha256').update(JSON.stringify([requestId, phase])).digest('hex');
const result = (request: VerificationRequest) => ({ requestId: request.requestId, state: request.state, profileRevision: request.profileRevision });
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) return fail('invalid-revision');
  return value as number;
}
function existing<T>(value: T | null): T { if (value === null) return fail('missing-document'); return value; }
function credentialBinding(record: DoctorCredentialRecord) {
  return JSON.stringify([record.credentialId, record.doctorUid, record.storagePath, record.category,
    record.contentType, record.sizeBytes, record.generation, record.checksum]);
}
function attached(record: DoctorCredentialRecord, request: VerificationRequest) {
  validateCredentialRecord(record);
  const reference = request.credentials.find(ref => ref.credentialId === record.credentialId);
  if (record.doctorUid !== request.doctorUid || record.state !== 'attached' || record.requestId !== request.requestId
    || !reference || reference.category !== record.category || reference.generation !== record.generation || reference.checksum !== record.checksum)
    fail('inconsistent-evidence');
}
function sameSelection(request: VerificationRequest, ids: string[]) {
  return JSON.stringify(request.credentials.map(ref => ref.credentialId).sort()) === JSON.stringify(ids);
}
function identityUpdate(identity: CallADocIdentity, status: 'pending' | 'approved' | 'rejected', now: DomainTimestamp): CallADocIdentity {
  const updatedAt = new Date(now.seconds * 1000 + Math.floor(now.nanoseconds / 1e6)).toISOString();
  const next = { ...identity, verificationStatus: status, updatedAt };
  if (updatedAt < identity.updatedAt || !validIdentity(next)) return fail('identity-clock');
  return next;
}
async function inspectAll(deps: VerificationDependencies, records: DoctorCredentialRecord[]) {
  return Promise.all(records.map(async record => {
    const object = await deps.inspect(record.storagePath);
    if (object.generation !== record.generation || object.checksum !== record.checksum
      || object.contentType !== record.contentType || object.sizeBytes !== record.sizeBytes) fail('changed-evidence');
    return object;
  }));
}
export function createVerificationHandlers(deps: VerificationDependencies) {
  async function guarded<T>(work: (authorize: (tx: VerificationTransaction, uid: string, role: 'doctor' | 'administrator') => Promise<CallADocIdentity>) => Promise<T>) {
    const safeErrors = new Set<Error>();
    try {
      return await work(async (tx, uid, role) => {
        const authorization = createAuthorization(id => tx.identity(id));
        const identity = await authorization.requireActive({ uid }).catch(() => {
          const error = new HttpsError('permission-denied', 'Active canonical identity required.'); safeErrors.add(error); throw error;
        });
        if (identity.role !== role) {
          const error = new HttpsError('permission-denied', 'This identity cannot perform this operation.'); safeErrors.add(error); throw error;
        }
        return identity;
      });
    } catch (error) {
      if (error instanceof Error && safeErrors.has(error)) throw error;
      if (error instanceof DomainValidationError) throw new HttpsError('failed-precondition', 'Verification state or evidence does not permit this operation.');
      throw new HttpsError('internal', 'Verification operation could not be completed. Please retry later.');
    }
  }
  async function submit(request: { auth?: { uid: string }; data: unknown }) {
    const uid = requireAuthenticated(request.auth);
    let ids: string[], expectedRevision: number;
    try {
      const data = strictRecord(request.data, ['credentialIds', 'expectedRevision'], ['credentialIds', 'expectedRevision']);
      expectedRevision = revision(data.expectedRevision);
      if (!Array.isArray(data.credentialIds) || data.credentialIds.length < 1 || data.credentialIds.length > 5) fail();
      ids = (data.credentialIds as unknown[]).map(safeId).sort();
      if (new Set(ids).size !== ids.length) fail();
    } catch { throw new HttpsError('invalid-argument', 'Provide 1-5 distinct credentialIds and a positive expectedRevision.'); }
    return guarded(async authorize => {
      const requestId = safeId(deps.newId());
      async function load(tx: VerificationTransaction) {
        const identity = await authorize(tx, uid, 'doctor');
        if (!['pending', 'rejected'].includes(identity.verificationStatus!)) fail('ineligible-doctor');
        const profile = existing(await tx.profile(uid)); validateDoctorProfile(profile);
        if (profile.uid !== uid || profile.revision !== expectedRevision) fail('stale-profile');
        const latest = await tx.latest(uid);
        if (latest) { validateRequest(latest); if (latest.doctorUid !== uid) fail('foreign-request'); }
        const records = await Promise.all(ids.map(async id => {
          const record = existing(await tx.credential(id)); validateCredentialRecord(record);
          if (record.credentialId !== id || record.doctorUid !== uid) fail('foreign-credential'); return record;
        }));
        if (latest && latest.profileRevision === expectedRevision && sameSelection(latest, ids)) {
          const matchingState = (latest.state === 'submitted' && identity.verificationStatus === 'pending' && profile.activeRequestId === latest.requestId)
            || (latest.state === 'rejected' && identity.verificationStatus === 'rejected' && profile.activeRequestId === null);
          if (!matchingState || profile.approvedRequestId !== null
            || Object.entries(latest.professional).some(([key, value]) => profile[key as keyof DoctorProfile] !== value)) fail('invalid-replay');
          records.forEach(record => attached(record, latest));
          return { replay: latest } as const;
        }
        if (identity.verificationStatus === 'pending' && latest) fail('inconsistent-history');
        const plan = planVerificationSubmission({ profile, identityStatus: identity.verificationStatus!, expectedRevision,
          requestId, credentials: records, previousRequest: latest, now: deps.now() });
        return { identity, records, plan } as const;
      }
      const first = await deps.transact(load);
      if ('replay' in first) return result(first.replay!);
      const observations = await inspectAll(deps, first.records);
      return deps.transact(async tx => {
        const current = await load(tx);
        if ('replay' in current) return result(current.replay!);
        if (JSON.stringify(current.plan.request.professional) !== JSON.stringify(first.plan.request.professional)) fail('snapshot-changed');
        for (let index = 0; index < current.records.length; index++) {
          if (credentialBinding(current.records[index]) !== credentialBinding(first.records[index])) fail('metadata-changed');
          await deps.assertUnchanged(current.records[index].storagePath, observations[index]);
        }
        const { plan, identity } = current;
        const nextIdentity = identityUpdate(identity, 'pending', plan.request.updatedAt);
        tx.createRequest(plan.request); tx.saveProfile(plan.profile);
        plan.credentials.forEach(record => tx.saveCredential(record)); tx.saveIdentity(nextIdentity);
        tx.createAudit({ eventId: verificationEventId(requestId, 'submitted'), requestId, doctorUid: uid,
          actorUid: uid, action: 'submitted', occurredAt: plan.request.submittedAt, schemaVersion: 1 });
        return result(plan.request);
      });
    });
  }
  async function review(request: { auth?: { uid: string }; data: unknown }) {
    const reviewerUid = requireAuthenticated(request.auth);
    let requestId: string, expectedRevision: number, decision: VerificationReviewInput;
    try {
      const data = strictRecord(request.data, ['requestId', 'decision', 'rejectionReason', 'expectedRevision'], ['requestId', 'decision', 'expectedRevision']);
      requestId = safeId(data.requestId); expectedRevision = revision(data.expectedRevision);
      decision = validateReviewInput({ decision: data.decision, ...('rejectionReason' in data ? { rejectionReason: data.rejectionReason } : {}) });
    } catch { throw new HttpsError('invalid-argument', 'Provide requestId, expectedRevision and a valid review decision/reason.'); }
    return guarded(async authorize => {
      const eventId = verificationEventId(requestId, 'review');
      async function load(tx: VerificationTransaction) {
        await authorize(tx, reviewerUid, 'administrator');
        const stored = existing(await tx.request(requestId)); validateRequest(stored);
        if (stored.requestId !== requestId || stored.doctorUid === reviewerUid || stored.profileRevision !== expectedRevision) fail('invalid-review');
        const doctor = await authorize(tx, stored.doctorUid, 'doctor');
        const profile = existing(await tx.profile(stored.doctorUid)); validateDoctorProfile(profile);
        if (profile.uid !== stored.doctorUid) fail('foreign-profile');
        if (stored.state !== 'submitted') {
          const event = existing(await tx.audit(eventId));
          const fields = ['eventId', 'requestId', 'doctorUid', 'actorUid', 'action', 'occurredAt', 'schemaVersion'];
          strictRecord(event, fields, fields);
          if (stored.state !== decision.decision || stored.reviewerUid !== reviewerUid
            || (stored.state === 'rejected' && (decision.decision !== 'rejected' || stored.rejectionReason !== decision.rejectionReason))
            || event.eventId !== eventId || event.requestId !== requestId || event.doctorUid !== stored.doctorUid
            || event.actorUid !== reviewerUid || event.action !== decision.decision || event.schemaVersion !== 1
            || JSON.stringify(timestamp(event.occurredAt)) !== JSON.stringify(timestamp(stored.reviewedAt!))) fail('conflicting-review');
          return { replay: stored } as const;
        }
        const plan = planVerificationReview({ profile, request: stored, identityStatus: doctor.verificationStatus!, expectedRevision,
          input: decision, reviewerUid, eventId, now: deps.now() });
        const records = decision.decision === 'approved' ? await Promise.all(stored.credentials.map(async reference => {
          const record = existing(await tx.credential(reference.credentialId));
          if (record.credentialId !== reference.credentialId) fail('credential-id-mismatch');
          attached(record, stored); return record;
        })) : [];
        return { doctor, stored, plan, records } as const;
      }
      const first = await deps.transact(load);
      if ('replay' in first) return result(first.replay!);
      const observations = await inspectAll(deps, first.records);
      return deps.transact(async tx => {
        const current = await load(tx);
        if ('replay' in current) return result(current.replay!);
        if (JSON.stringify(current.stored) !== JSON.stringify(first.stored)) fail('request-changed');
        for (let index = 0; index < current.records.length; index++) {
          if (credentialBinding(current.records[index]) !== credentialBinding(first.records[index])) fail('metadata-changed');
          await deps.assertUnchanged(current.records[index].storagePath, observations[index]);
        }
        const { plan, doctor } = current;
        const nextIdentity = identityUpdate(doctor, plan.identityVerificationStatus, plan.request.updatedAt);
        tx.saveRequest(plan.request); tx.saveProfile(plan.profile); tx.saveIdentity(nextIdentity);
        tx.publish(doctor.uid, plan.publicProfile); tx.createAudit(plan.audit);
        return result(plan.request);
      });
    });
  }
  return { submit, review };
}
