import type {
  CallADocIdentity,
  PublicRegistrationRequest,
  TrustedRegistrationContext,
} from "../../../shared/types/identity";

export const MAX_FULL_NAME_LENGTH = 200;
export type RegistrationPolicyErrorCode =
  | "invalid-request" | "invalid-trusted-context" | "invalid-existing-identity"
  | "role-conflict" | "administrator-protected" | "account-disabled";

export class RegistrationPolicyError extends Error {
  constructor(public readonly code: RegistrationPolicyErrorCode) {
    super(code);
    this.name = "RegistrationPolicyError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function validName(value: unknown): value is string {
  return nonEmpty(value) && value === value.trim() && value.length <= MAX_FULL_NAME_LENGTH;
}

export function validateRegistrationRequest(input: unknown): PublicRegistrationRequest {
  if (!record(input) || Reflect.ownKeys(input).length !== 2
    || !Object.hasOwnProperty.call(input, "role") || !Object.hasOwnProperty.call(input, "fullName")
    || (input.role !== "patient" && input.role !== "doctor")
    || typeof input.fullName !== "string") {
    throw new RegistrationPolicyError("invalid-request");
  }
  const fullName = input.fullName.trim();
  if (!validName(fullName)) throw new RegistrationPolicyError("invalid-request");
  return { role: input.role, fullName };
}

export function validIdentity(value: unknown): value is CallADocIdentity {
  if (!record(value)) return false;
  const fields = ["uid", "email", "fullName", "role", "status", "createdAt", "updatedAt", "schemaVersion"];
  if (value.role === "doctor") fields.push("verificationStatus");
  if (Reflect.ownKeys(value).length !== fields.length || !fields.every(key => Object.hasOwnProperty.call(value, key))) return false;
  return nonEmpty(value.uid) && nonEmpty(value.email) && validName(value.fullName)
    && typeof value.role === "string" && ["patient", "doctor", "administrator"].includes(value.role)
    && (value.status === "active" || value.status === "disabled")
    && value.schemaVersion === 1 && timestamp(value.createdAt) && timestamp(value.updatedAt)
    && value.updatedAt >= value.createdAt
    && (value.role !== "doctor" || (typeof value.verificationStatus === "string"
      && ["pending", "approved", "rejected"].includes(value.verificationStatus)));
}

export type RegistrationDecision =
  | { action: "create"; identity: CallADocIdentity }
  | { action: "existing"; identity: CallADocIdentity };

/** Pure policy only. The future callable must authenticate context and run this in a transaction.
 * `null` means the document is absent; all other invalid records fail closed.
 * Profile fields and their editable access model are deferred to Checkpoint 3.
 */
export function planRegistration(
  context: TrustedRegistrationContext,
  input: unknown,
  existing: unknown = null
): RegistrationDecision {
  if (!context || !nonEmpty(context.uid) || !nonEmpty(context.email) || !timestamp(context.timestamp)) {
    throw new RegistrationPolicyError("invalid-trusted-context");
  }
  const request = validateRegistrationRequest(input);
  if (existing !== null) {
    if (!validIdentity(existing) || existing.uid !== context.uid) {
      throw new RegistrationPolicyError("invalid-existing-identity");
    }
    if (existing.role === "administrator") throw new RegistrationPolicyError("administrator-protected");
    if (existing.role !== request.role) throw new RegistrationPolicyError("role-conflict");
    if (existing.status !== "active") throw new RegistrationPolicyError("account-disabled");
    return { action: "existing", identity: { ...existing } };
  }
  const base = {
    uid: context.uid, email: context.email, fullName: request.fullName,
    status: "active" as const, createdAt: context.timestamp, updatedAt: context.timestamp,
    schemaVersion: 1 as const,
  };
  return {
    action: "create",
    identity: request.role === "doctor"
      ? { ...base, role: "doctor", verificationStatus: "pending" }
      : { ...base, role: "patient" },
  };
}
