import type { DoctorProfile, DoctorDraftInput, DoctorProfessionalSnapshot, DomainTimestamp, DoctorPublicProfile } from "../../../shared/types/profiles";
import type { DoctorVerificationStatus } from "../../../shared/types/identity";
import type { DoctorCredentialRecord, VerificationRequest, VerificationAudit, FinalizedCredentialReference } from "../../../shared/types/verification";
import { fail, safeId, timestamp, atOrAfter, strictRecord, text, LIMITS, validateDoctorDraftInput,
  validateCredentialUploadInput, validateCredentialPath, validateReviewInput } from "./domainValidation";

const professionalKeys = ["professionalName", "specialty", "registrationNumber", "issuingAuthority"] as const;
function status(value: DoctorVerificationStatus) {
  if (!["pending", "approved", "rejected"].includes(value)) fail("invalid-identity-state");
}
export function requireProfessionalSnapshot(input: DoctorDraftInput): DoctorProfessionalSnapshot {
  const fields = validateDoctorDraftInput(input);
  for (const key of professionalKeys) if (!fields[key]) fail("incomplete-professional-profile");
  return Object.freeze({ professionalName: fields.professionalName!, specialty: fields.specialty!,
    registrationNumber: fields.registrationNumber!, issuingAuthority: fields.issuingAuthority! });
}
export function validateDoctorProfile(profile: DoctorProfile) {
  const data = strictRecord(profile, ["uid", ...professionalKeys, "phoneNumber", "revision", "activeRequestId",
    "approvedRequestId", "schemaVersion", "createdAt", "updatedAt"],
    ["uid", "revision", "activeRequestId", "approvedRequestId", "schemaVersion", "createdAt", "updatedAt"]);
  safeId(profile.uid);
  if (data.schemaVersion !== 1 || !Number.isSafeInteger(profile.revision) || profile.revision < 1) fail("invalid-profile");
  for (const ref of [profile.activeRequestId, profile.approvedRequestId]) if (ref !== null) safeId(ref);
  if (profile.activeRequestId && profile.approvedRequestId) fail("invalid-profile");
  atOrAfter(profile.updatedAt, profile.createdAt);
  const fields: Record<string, unknown> = {};
  for (const key of [...professionalKeys, "phoneNumber"]) if (Object.prototype.hasOwnProperty.call(data,key)) fields[key] = data[key];
  const normalized = validateDoctorDraftInput(fields);
  if (Object.keys(fields).some(key => fields[key] !== (normalized as Record<string, unknown>)[key])) fail("invalid-profile");
  if (profile.activeRequestId || profile.approvedRequestId) requireProfessionalSnapshot(normalized);
}
/** Caller supplies backend-resolved identity status and clock. This is not authorization. */
export function planDoctorDraft(
  uid: string, existing: DoctorProfile | null, input: unknown, expectedRevision: number,
  identityStatus: DoctorVerificationStatus, now: DomainTimestamp
): DoctorProfile {
  safeId(uid); status(identityStatus); const time = timestamp(now);
  const fields = validateDoctorDraftInput(input);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail("stale-revision");
  if (!existing) {
    if (expectedRevision !== 0 || identityStatus !== "pending") fail("invalid-transition");
    return { uid, ...fields, revision: 1, activeRequestId: null, approvedRequestId: null,
      schemaVersion: 1, createdAt: time, updatedAt: time };
  }
  validateDoctorProfile(existing);
  if (existing.uid !== uid) fail("uid-mismatch");
  if (existing.revision !== expectedRevision) fail("stale-revision");
  atOrAfter(time, existing.updatedAt);
  if (existing.activeRequestId) fail("submitted-draft-locked");
  if ((identityStatus === "approved") !== (existing.approvedRequestId !== null)) fail("invalid-transition");
  if (identityStatus === "approved") {
    if (professionalKeys.some(key => fields[key] !== existing[key])) fail("approved-professional-fields-locked");
    // Private contact edits do not change the approved professional revision.
    const { phoneNumber: _oldPhone, ...rest } = existing;
    return { ...rest, ...fields, updatedAt: time };
  }
  if (!Number.isSafeInteger(existing.revision + 1)) fail("invalid-revision");
  return { uid, ...fields, revision: existing.revision + 1, activeRequestId: null, approvedRequestId: null,
    schemaVersion: 1, createdAt: timestamp(existing.createdAt), updatedAt: time };
}
export function validateCredentialRecord(record: DoctorCredentialRecord) {
  strictRecord(record, ["credentialId", "doctorUid", "storagePath", "state", "generation", "checksum", "requestId", "expiresAt",
    "category", "contentType", "sizeBytes", "schemaVersion", "createdAt", "updatedAt"],
    ["credentialId", "doctorUid", "storagePath", "state", "generation", "checksum", "requestId", "expiresAt",
    "category", "contentType", "sizeBytes", "schemaVersion", "createdAt", "updatedAt"]);
  safeId(record.credentialId); safeId(record.doctorUid);
  validateCredentialPath(record.storagePath, record.doctorUid, record.credentialId);
  validateCredentialUploadInput({category:record.category, contentType:record.contentType, sizeBytes:record.sizeBytes});
  if (record.schemaVersion !== 1 || !["prepared","ready","attached","invalid"].includes(record.state)) fail("invalid-credential");
  if (record.requestId !== null) safeId(record.requestId);
  if (record.generation !== null && (typeof record.generation !== "string" || !/^[0-9]{1,30}$/.test(record.generation))) fail("invalid-credential");
  if (record.checksum !== null && (typeof record.checksum !== "string" || !/^[a-f0-9]{64}$/.test(record.checksum))) fail("invalid-credential");
  atOrAfter(record.updatedAt, record.createdAt); atOrAfter(record.expiresAt,record.createdAt);
  if (record.state === "prepared" && (record.generation !== null || record.checksum !== null || record.requestId !== null)) fail("invalid-credential");
  if (record.state === "ready" || record.state === "attached") {
    if (typeof record.generation !== "string" || !/^[0-9]{1,30}$/.test(record.generation)
      || typeof record.checksum !== "string" || !/^[a-f0-9]{64}$/.test(record.checksum)) fail("invalid-credential");
    if (record.state === "ready" && record.requestId !== null) fail("invalid-credential");
    if (record.state === "attached") safeId(record.requestId);
  }
}
export function validateRequest(request: VerificationRequest) {
  const required = ["requestId","doctorUid","profileRevision","professional","credentials","previousRequestId","submittedAt",
    "schemaVersion","createdAt","updatedAt","state","reviewedAt","reviewerUid"];
  const extra = request.state === "rejected" ? ["rejectionReason"] : request.state === "invalidated" ? ["invalidatedAt"] : [];
  strictRecord(request, [...required,...extra], [...required,...extra]);
  safeId(request.requestId); safeId(request.doctorUid);
  if (request.previousRequestId !== null) { safeId(request.previousRequestId); if (request.previousRequestId === request.requestId) fail("invalid-request"); }
  if (request.schemaVersion !== 1 || !Number.isSafeInteger(request.profileRevision) || request.profileRevision < 1) fail("invalid-request");
  strictRecord(request.professional, professionalKeys, professionalKeys);
  const normalized = requireProfessionalSnapshot(request.professional);
  if (professionalKeys.some(key => normalized[key] !== request.professional[key])) fail("invalid-request");
  atOrAfter(request.submittedAt,request.createdAt); atOrAfter(request.updatedAt,request.submittedAt);
  if (!Array.isArray(request.credentials) || request.credentials.length < 1 || request.credentials.length > LIMITS.credentials) fail("invalid-credentials");
  const ids = new Set<string>();
  for (const ref of request.credentials) {
    strictRecord(ref,["credentialId","category","generation","checksum"],["credentialId","category","generation","checksum"]);
    safeId(ref.credentialId);
    validateCredentialUploadInput({category:ref.category,contentType:"application/pdf",sizeBytes:1});
    if (ids.has(ref.credentialId) || typeof ref.generation !== "string" || !/^[0-9]{1,30}$/.test(ref.generation)
      || typeof ref.checksum !== "string" || !/^[a-f0-9]{64}$/.test(ref.checksum)) fail("invalid-credentials");
    ids.add(ref.credentialId);
  }
  if (!request.credentials.some(ref=>ref.category==="medical_license")) fail("medical-license-required");
  if (request.state === "submitted") { if(request.reviewedAt !== null || request.reviewerUid !== null) fail("invalid-request"); }
  else if (["approved","rejected","invalidated"].includes(request.state)) {
    safeId(request.reviewerUid);
    if (!request.reviewedAt) fail("invalid-request");
    atOrAfter(request.reviewedAt!,request.submittedAt); atOrAfter(request.updatedAt,request.reviewedAt!);
    if(request.state==="rejected") text(request.rejectionReason,LIMITS.rejectionReason);
    if(request.state==="invalidated") { atOrAfter(request.invalidatedAt,request.reviewedAt!); atOrAfter(request.updatedAt,request.invalidatedAt); }
  } else fail("invalid-request");
}
export function planVerificationSubmission(args: {
  profile: DoctorProfile; identityStatus: DoctorVerificationStatus; expectedRevision: number;
  requestId: string; credentials: readonly DoctorCredentialRecord[]; previousRequest: VerificationRequest | null; now: DomainTimestamp;
}) {
  const { profile, identityStatus, expectedRevision, requestId, credentials, previousRequest } = args;
  validateDoctorProfile(profile); status(identityStatus); safeId(requestId);
  const now = timestamp(args.now); atOrAfter(now,profile.updatedAt);
  if(profile.revision !== expectedRevision) fail("stale-revision");
  if(profile.activeRequestId || profile.approvedRequestId || identityStatus==="approved") fail("invalid-transition");
  if (identityStatus==="rejected") {
    if(!previousRequest) fail("previous-rejection-required");
    validateRequest(previousRequest!);
    if(previousRequest!.state!=="rejected" || previousRequest!.doctorUid!==profile.uid
      || previousRequest!.requestId===requestId || profile.revision<=previousRequest!.profileRevision) fail("invalid-resubmission");
    atOrAfter(now,previousRequest!.updatedAt);
  } else if(previousRequest!==null) fail("invalid-transition");
  if(!Array.isArray(credentials)||credentials.length<1||credentials.length>LIMITS.credentials) fail("invalid-credentials");
  const ids=new Set<string>();
  const references: FinalizedCredentialReference[]=[];
  for(const credential of credentials) {
    validateCredentialRecord(credential);
    if(credential.doctorUid!==profile.uid || credential.state!=="ready" || ids.has(credential.credentialId)) fail("invalid-credentials");
    atOrAfter(now,credential.updatedAt);
    ids.add(credential.credentialId);
    references.push(Object.freeze({credentialId:credential.credentialId,category:credential.category,generation:credential.generation!,checksum:credential.checksum!}));
  }
  if(!references.some(ref=>ref.category==="medical_license")) fail("medical-license-required");
  const request: VerificationRequest = Object.freeze({
    requestId,doctorUid:profile.uid,profileRevision:profile.revision,professional:requireProfessionalSnapshot(profileFields(profile)),
    credentials:Object.freeze(references),previousRequestId:previousRequest?.requestId??null,state:"submitted",reviewedAt:null,reviewerUid:null,
    schemaVersion:1,createdAt:now,updatedAt:now,submittedAt:now,
  });
  return { request, profile: {...profile,activeRequestId:requestId,updatedAt:now},
    credentials:credentials.map(record=>({...record,state:"attached" as const,requestId,updatedAt:now})),
    identityVerificationStatus:"pending" as const };
}
function profileFields(profile: DoctorProfile): DoctorDraftInput {
  const fields: DoctorDraftInput={};
  for(const key of professionalKeys) if(profile[key]!==undefined) fields[key]=profile[key];
  return fields;
}
export function planVerificationReview(args: {
  profile: DoctorProfile; request: VerificationRequest; identityStatus: DoctorVerificationStatus;
  expectedRevision: number; input: unknown; reviewerUid: string; eventId: string; now: DomainTimestamp;
}) {
  const {profile,request}=args;
  validateDoctorProfile(profile); validateRequest(request); status(args.identityStatus);
  const decision=validateReviewInput(args.input); safeId(args.reviewerUid);safeId(args.eventId);
  if(args.reviewerUid===profile.uid) fail("self-review");
  if(request.state!=="submitted" || args.identityStatus!=="pending" || profile.activeRequestId!==request.requestId
    || profile.approvedRequestId!==null || request.doctorUid!==profile.uid) fail("invalid-transition");
  if(args.expectedRevision!==profile.revision || request.profileRevision!==profile.revision) fail("stale-revision");
  if(professionalKeys.some(key=>request.professional[key]!==profile[key])) fail("snapshot-conflict");
  const now=timestamp(args.now); atOrAfter(now,request.updatedAt); atOrAfter(now,profile.updatedAt);
  const reviewed: VerificationRequest = decision.decision==="approved"
    ? {...request,state:"approved",reviewedAt:now,reviewerUid:args.reviewerUid,updatedAt:now}
    : {...request,state:"rejected",reviewedAt:now,reviewerUid:args.reviewerUid,updatedAt:now,rejectionReason:decision.rejectionReason};
  const publicProfile: DoctorPublicProfile|null=decision.decision==="approved"?{
    uid:profile.uid,professionalName:request.professional.professionalName,specialty:request.professional.specialty,
    approvedRevision:request.profileRevision,approvedRequestId:request.requestId,schemaVersion:1,publishedAt:now,updatedAt:now,
  }:null;
  const audit: VerificationAudit={eventId:args.eventId,requestId:request.requestId,doctorUid:profile.uid,actorUid:args.reviewerUid,
    action:decision.decision,occurredAt:now,schemaVersion:1};
  return { request:reviewed, profile:{...profile,activeRequestId:null,approvedRequestId:decision.decision==="approved"?request.requestId:null,updatedAt:now},
    identityVerificationStatus:decision.decision,publicProfile,audit };
}
