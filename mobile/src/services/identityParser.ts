import type { CallADocIdentity } from "@shared/types/identity";

/** Client parsing is for safe UI behavior; backend authorization remains authoritative. */
export function parseIdentity(value: unknown, uid: string): CallADocIdentity {
  const fail = (): never => { throw new Error("Invalid CallADoc identity."); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const data = value as Record<string, unknown>;
  const fields = ["uid", "email", "fullName", "role", "status", "createdAt", "updatedAt", "schemaVersion"];
  if (data.role === "doctor") fields.push("verificationStatus");
  const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
  const timestamp = (v: unknown): v is string => {
    if (typeof v !== "string") return false;
    const date = new Date(v);
    return Number.isFinite(date.getTime()) && date.toISOString() === v;
  };
  if (Object.keys(data).length !== fields.length || !fields.every(key => Object.prototype.hasOwnProperty.call(data, key))
    || data.uid !== uid || !text(data.uid) || !text(data.email) || !text(data.fullName)
    || data.fullName !== data.fullName.trim() || data.fullName.length > 200
    || !["patient", "doctor", "administrator"].includes(data.role as string)
    || !["active", "disabled"].includes(data.status as string) || data.schemaVersion !== 1
    || !timestamp(data.createdAt) || !timestamp(data.updatedAt) || data.updatedAt < data.createdAt
    || (data.role === "doctor" && !["pending", "approved", "rejected"].includes(data.verificationStatus as string))) return fail();
  return { ...data } as unknown as CallADocIdentity;
}
