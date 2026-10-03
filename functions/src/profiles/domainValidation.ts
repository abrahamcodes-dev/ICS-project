import type { DomainTimestamp, PatientProfileInput, PatientHealthProfileInput, DoctorDraftInput } from "../../../shared/types/profiles";
import type { CredentialUploadInput, CredentialCategory, CredentialContentType, VerificationReviewInput } from "../../../shared/types/verification";

export const LIMITS = Object.freeze({ name: 200, phone: 32, gender: 50, specialty: 120,
  registrationNumber: 120, authority: 200, listItems: 20, healthItem: 200, rejectionReason: 1000,
  credentialBytes: 5 * 1024 * 1024, credentials: 5 });
export class DomainValidationError extends Error {
  constructor(public readonly code: string) { super(code); this.name = "DomainValidationError"; }
}
export function fail(code = "invalid-input"): never { throw new DomainValidationError(code); }
export function strictRecord(value: unknown, allowed: readonly string[], required: readonly string[] = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail();
  const data = value as Record<string, unknown>;
  if (Reflect.ownKeys(data).some(key => typeof key !== "string" || !allowed.includes(key))
    || required.some(key => !Object.prototype.hasOwnProperty.call(data, key))) return fail();
  return data;
}
export function text(value: unknown, max: number): string {
  if (typeof value !== "string") return fail();
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) return fail();
  return normalized;
}
export function safeId(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 128 || value !== value.trim()
    || /[\/\\\u0000-\u001f\u007f]/.test(value) || value === "." || value === ".."
    || /%2f|%5c/i.test(value)) return fail("invalid-id");
  return value;
}
export function timestamp(value: DomainTimestamp): DomainTimestamp {
  if (!value || !Number.isSafeInteger(value.seconds) || value.seconds < -62135596800 || value.seconds > 253402300799
    || !Number.isInteger(value.nanoseconds) || value.nanoseconds < 0 || value.nanoseconds > 999999999) return fail("invalid-timestamp");
  return Object.freeze({ seconds: value.seconds, nanoseconds: value.nanoseconds });
}
export function atOrAfter(later: DomainTimestamp, earlier: DomainTimestamp) {
  timestamp(later); timestamp(earlier);
  if (later.seconds < earlier.seconds || (later.seconds === earlier.seconds && later.nanoseconds < earlier.nanoseconds)) fail("timestamp-order");
}
function optionalText(data: Record<string, unknown>, key: string, max: number, out: Record<string, unknown>) {
  if (Object.prototype.hasOwnProperty.call(data, key)) out[key] = text(data[key], max);
}
function phone(value: unknown) {
  const result = text(value, LIMITS.phone);
  if (!/^\+?[0-9 ()-]{3,32}$/.test(result) || (result.match(/[0-9]/g)?.length ?? 0) < 3) return fail();
  return result;
}
/** Inputs replace editable fields: omission clears a previously optional value.
 * No input accepts timestamps, UID, status, role, revision or workflow references. */
export function validatePatientProfileInput(value: unknown): PatientProfileInput {
  const data = strictRecord(value, ["displayName", "phoneNumber"]);
  const result: PatientProfileInput = {};
  if ("displayName" in data) result.displayName = text(data.displayName, LIMITS.name);
  if ("phoneNumber" in data) result.phoneNumber = phone(data.phoneNumber);
  return result;
}
function calendarDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail();
  const parsed = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) return fail();
  return value;
}
export function validatePatientHealthInput(value: unknown, today: string): PatientHealthProfileInput {
  calendarDate(today);
  const data = strictRecord(value, ["dateOfBirth", "gender", "knownConditions", "allergies", "currentMedications"]);
  const result: PatientHealthProfileInput = {};
  if ("dateOfBirth" in data) {
    result.dateOfBirth = calendarDate(data.dateOfBirth);
    if (result.dateOfBirth > today) fail();
  }
  if ("gender" in data) result.gender = text(data.gender, LIMITS.gender);
  for (const key of ["knownConditions", "allergies", "currentMedications"] as const) {
    if (key in data) {
      const list = data[key];
      if (!Array.isArray(list) || list.length > LIMITS.listItems) return fail();
      result[key] = list.map(item => text(item, LIMITS.healthItem));
    }
  }
  return result;
}
export function validateDoctorDraftInput(value: unknown): DoctorDraftInput {
  const data = strictRecord(value, ["professionalName", "specialty", "phoneNumber", "registrationNumber", "issuingAuthority"]);
  const out: Record<string, unknown> = {};
  optionalText(data, "professionalName", LIMITS.name, out);
  optionalText(data, "specialty", LIMITS.specialty, out);
  optionalText(data, "registrationNumber", LIMITS.registrationNumber, out);
  optionalText(data, "issuingAuthority", LIMITS.authority, out);
  if ("phoneNumber" in data) out.phoneNumber = phone(data.phoneNumber);
  return out as DoctorDraftInput;
}
export function validateCredentialUploadInput(value: unknown): CredentialUploadInput {
  const data = strictRecord(value, ["category", "contentType", "sizeBytes"], ["category", "contentType", "sizeBytes"]);
  if (!["medical_license", "professional_certificate", "identity_document", "other_supporting_document"].includes(data.category as string)
    || !["application/pdf", "image/jpeg", "image/png"].includes(data.contentType as string)
    || !Number.isSafeInteger(data.sizeBytes) || (data.sizeBytes as number) <= 0 || (data.sizeBytes as number) > LIMITS.credentialBytes) return fail();
  return { category: data.category as CredentialCategory, contentType: data.contentType as CredentialContentType, sizeBytes: data.sizeBytes as number };
}
export function credentialPath(doctorUid: string, credentialId: string) {
  return "doctorCredentials/" + safeId(doctorUid) + "/" + safeId(credentialId) + "/document";
}
export function validateCredentialPath(path: unknown, doctorUid: string, credentialId: string) {
  if (path !== credentialPath(doctorUid, credentialId)) fail("invalid-path");
}
export function validateReviewInput(value: unknown): VerificationReviewInput {
  const data = strictRecord(value, ["decision", "rejectionReason"], ["decision"]);
  if (data.decision === "approved" && !Object.prototype.hasOwnProperty.call(data, "rejectionReason")) return { decision: "approved" };
  if (data.decision === "rejected") return { decision: "rejected", rejectionReason: text(data.rejectionReason, LIMITS.rejectionReason) };
  return fail("invalid-decision");
}
