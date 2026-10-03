import { HttpsError } from "firebase-functions/v2/https";
import type { DoctorCredentialRecord } from "../../../shared/types/verification";
import type { DoctorProfile, DomainTimestamp } from "../../../shared/types/profiles";
import { createAuthorization, requireAuthenticated } from "../shared/authorization";
import { atOrAfter, credentialPath, DomainValidationError, fail, safeId, strictRecord, timestamp, validateCredentialUploadInput } from "./domainValidation";
import { validateCredentialRecord, validateDoctorProfile } from "./verificationPolicy";

export const UPLOAD_TTL_SECONDS = 15 * 60;
export interface ObservedCredential { generation: string; checksum: string; sizeBytes: number; contentType: string }
export interface CredentialTransaction {
  identity(): Promise<unknown>;
  profile(): Promise<DoctorProfile | null>;
  credential(): Promise<DoctorCredentialRecord | null>;
  create(record: DoctorCredentialRecord): void;
  replace(record: DoctorCredentialRecord): void;
}
export interface CredentialDependencies {
  now(): DomainTimestamp;
  newId(): string;
  transact<T>(uid: string, id: string, action: (tx: CredentialTransaction) => Promise<T>): Promise<T>;
  inspect(path: string): Promise<ObservedCredential>;
  assertUnchanged(path: string, observed: ObservedCredential): Promise<void>;
}
function credentialResult(record: DoctorCredentialRecord) {
  return { credentialId: record.credentialId, storagePath: record.storagePath, state: record.state,
    expiresAt: timestamp(record.expiresAt), generation: record.generation, checksum: record.checksum,
    sizeBytes: record.sizeBytes, contentType: record.contentType };
}
function owned(record: DoctorCredentialRecord | null, uid: string, id: string): DoctorCredentialRecord {
  if (!record) return fail("missing-credential");
  validateCredentialRecord(record);
  if (record.doctorUid !== uid || record.credentialId !== id || record.storagePath !== credentialPath(uid, id)) fail("ownership");
  if (!['prepared', 'ready'].includes(record.state) || record.requestId !== null) fail("credential-locked");
  return record;
}
function unexpired(record: DoctorCredentialRecord, now: DomainTimestamp) {
  atOrAfter(now, record.updatedAt);
  if (now.seconds > record.expiresAt.seconds || (now.seconds === record.expiresAt.seconds && now.nanoseconds >= record.expiresAt.nanoseconds))
    fail("expired-slot");
}
function sameDeclaration(a: DoctorCredentialRecord, b: DoctorCredentialRecord) {
  return ["credentialId", "doctorUid", "storagePath", "category", "contentType", "sizeBytes", "schemaVersion"]
    .every(key => a[key as keyof DoctorCredentialRecord] === b[key as keyof DoctorCredentialRecord])
    && JSON.stringify(timestamp(a.createdAt)) === JSON.stringify(timestamp(b.createdAt))
    && JSON.stringify(timestamp(a.expiresAt)) === JSON.stringify(timestamp(b.expiresAt));
}
export function createCredentialHandlers(deps: CredentialDependencies) {
  async function run<T>(auth: { uid: string } | undefined, action: (uid: string,
    authorize: (tx: CredentialTransaction) => Promise<void>) => Promise<T>): Promise<T> {
    const uid = requireAuthenticated(auth);
    let denied: HttpsError | undefined;
    try {
      return await action(uid, async tx => {
        const identity = await createAuthorization(() => tx.identity()).requireActive({ uid }).catch(() => {
          denied = new HttpsError("permission-denied", "Active eligible doctor required."); throw denied;
        });
        if (identity.role !== "doctor" || !["pending", "rejected"].includes(identity.verificationStatus!)) {
          denied = new HttpsError("permission-denied", "Active eligible doctor required."); throw denied;
        }
        const profile = await tx.profile();
        if (profile) {
          validateDoctorProfile(profile);
          if (profile.uid !== uid || profile.activeRequestId !== null || profile.approvedRequestId !== null) fail("draft-locked");
        } else if (identity.verificationStatus === "rejected") fail("missing-rejected-draft");
      });
    } catch (error) {
      if (error === denied) throw error;
      if (error instanceof DomainValidationError) throw new HttpsError("failed-precondition", "Credential state or stored object does not permit this operation.");
      throw new HttpsError("internal", "Credential operation could not be completed. Please retry later.");
    }
  }
  async function prepare(request: { auth?: { uid: string }; data: unknown }) {
    requireAuthenticated(request.auth);
    let input;
    try { input = validateCredentialUploadInput(request.data); }
    catch { throw new HttpsError("invalid-argument", "Provide category, contentType and sizeBytes only."); }
    const declared = input;
    return run(request.auth, async (uid, authorize) => {
      const id = safeId(deps.newId()); // Stable through Firestore retries; never client-selected.
      return deps.transact(uid, id, async tx => {
        await authorize(tx);
        if (await tx.credential()) fail("id-collision");
        const now = timestamp(deps.now());
        const record: DoctorCredentialRecord = { ...declared, credentialId: id, doctorUid: uid,
          storagePath: credentialPath(uid, id), state: "prepared", generation: null, checksum: null, requestId: null,
          schemaVersion: 1, createdAt: now, updatedAt: now,
          expiresAt: { seconds: now.seconds + UPLOAD_TTL_SECONDS, nanoseconds: now.nanoseconds } };
        validateCredentialRecord(record); tx.create(record); return credentialResult(record);
      });
    });
  }
  async function finalize(request: { auth?: { uid: string }; data: unknown }) {
    requireAuthenticated(request.auth);
    let id: string;
    try { id = safeId(strictRecord(request.data, ["credentialId"], ["credentialId"]).credentialId); }
    catch { throw new HttpsError("invalid-argument", "Provide only the backend-issued credentialId."); }
    return run(request.auth, async (uid, authorize) => {
      const before = await deps.transact(uid, id, async tx => {
        await authorize(tx);
        const record = owned(await tx.credential(), uid, id);
        if (record.state === "prepared") unexpired(record, deps.now());
        return record;
      });
      const observed = await deps.inspect(before.storagePath);
      if (!/^[0-9]{1,30}$/.test(observed.generation) || !/^[a-f0-9]{64}$/.test(observed.checksum)
        || observed.sizeBytes !== before.sizeBytes || observed.contentType !== before.contentType) fail("object-mismatch");
      if (before.state === "ready" && (before.generation !== observed.generation || before.checksum !== observed.checksum))
        fail("changed-finalized-object");
      return deps.transact(uid, id, async tx => {
        await authorize(tx);
        const record = owned(await tx.credential(), uid, id);
        if (!sameDeclaration(before, record)) fail("changed-declaration");
        if (before.state === "ready" && record.state !== "ready") fail("state-regression");
        // A final live metadata check narrows the cross-service race. Clients
        // cannot mutate uploaded objects; privileged replacement is outside this boundary.
        await deps.assertUnchanged(record.storagePath, observed);
        if (record.state === "ready") {
          if (record.generation !== observed.generation || record.checksum !== observed.checksum) fail("changed-object");
          return credentialResult(record);
        }
        const now = timestamp(deps.now()); unexpired(record, now);
        const ready: DoctorCredentialRecord = { ...record, ...observed, contentType: record.contentType, state: "ready", updatedAt: now };
        validateCredentialRecord(ready); tx.replace(ready); return credentialResult(ready);
      });
    });
  }
  return { prepare, finalize };
}
