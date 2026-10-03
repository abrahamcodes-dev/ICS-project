import { randomUUID, createHash } from "crypto";
import { Timestamp, type Firestore, type CollectionReference } from "firebase-admin/firestore";
import type { Bucket, FileMetadata } from "@google-cloud/storage";
import type { DoctorCredentialRecord } from "../../../shared/types/verification";
import type { DoctorProfile, DomainTimestamp } from "../../../shared/types/profiles";
import type { CredentialDependencies, ObservedCredential } from "./credentialHandlers";
import { fail, LIMITS, validateCredentialUploadInput } from "./domainValidation";

const sdkTime = (value: DomainTimestamp) => new Timestamp(value.seconds, value.nanoseconds);
function storedTimes(data: { createdAt: DomainTimestamp; updatedAt: DomainTimestamp; expiresAt?: DomainTimestamp }) {
  if (!(data.createdAt instanceof Timestamp) || !(data.updatedAt instanceof Timestamp)
    || ('expiresAt' in data && !(data.expiresAt instanceof Timestamp))) fail("stored-timestamp");
}
function objectFacts(meta: FileMetadata) {
  const sizeBytes = Number(meta.size), contentType = meta.contentType ?? '', generation = String(meta.generation ?? '');
  validateCredentialUploadInput({ category: "medical_license", contentType, sizeBytes });
  if (!/^[0-9]{1,30}$/.test(generation) || (meta.contentEncoding && meta.contentEncoding !== "identity")) fail("object-metadata");
  return { sizeBytes, contentType, generation };
}
export function createCredentialStore(db: Firestore, credentials: CollectionReference<DoctorCredentialRecord>, bucket: Bucket): CredentialDependencies {
  async function facts(path: string) {
    try { return objectFacts((await bucket.file(path).getMetadata())[0]); }
    catch (error) { if ((error as { code?: number }).code === 404) return fail("object-missing"); throw error; }
  }
  return {
    now: () => Timestamp.now(), newId: () => randomUUID(),
    transact: (uid, id, action) => db.runTransaction(async transaction => {
      const ref = credentials.doc(id);
      const encode = (record: DoctorCredentialRecord) => ({ ...record, createdAt: sdkTime(record.createdAt),
        updatedAt: sdkTime(record.updatedAt), expiresAt: sdkTime(record.expiresAt) });
      return action({
        identity: async () => (await transaction.get(db.collection('users').doc(uid))).data() ?? null,
        profile: async () => {
          const snap = await transaction.get(db.collection('doctorProfiles').doc(uid));
          if (!snap.exists) return null;
          const data = snap.data() as DoctorProfile; storedTimes(data); return data;
        },
        credential: async () => {
          const snap = await transaction.get(ref); if (!snap.exists) return null;
          const data = snap.data()!; storedTimes(data); return data;
        },
        create: record => { transaction.create(ref, encode(record)); },
        replace: record => { transaction.set(ref, encode(record)); },
      });
    }),
    inspect: async path => {
      const metadata = await facts(path);
      const stream = bucket.file(path, { generation: metadata.generation }).createReadStream({ decompress: false });
      const hash = createHash('sha256'); let size = 0;
      for await (const chunk of stream) {
        size += chunk.length;
        if (size > LIMITS.credentialBytes) { stream.destroy(); fail('object-too-large'); }
        hash.update(chunk);
      }
      if (size !== metadata.sizeBytes) fail('object-size');
      const latest = await facts(path);
      if (JSON.stringify(latest) !== JSON.stringify(metadata)) fail('object-changed');
      return { ...metadata, checksum: hash.digest('hex') };
    },
    assertUnchanged: async (path: string, observed: ObservedCredential) => {
      const latest = await facts(path);
      if (latest.generation !== observed.generation || latest.sizeBytes !== observed.sizeBytes || latest.contentType !== observed.contentType)
        fail('object-changed');
    },
  };
}
