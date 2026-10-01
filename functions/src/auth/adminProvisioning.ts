import { validIdentity, MAX_FULL_NAME_LENGTH } from "./registrationPolicy";
import type { CallADocIdentity } from "../../../shared/types/identity";
export interface ProvisionOptions { projectId: string; uid: string; fullName: string; operator: string; dryRun: boolean }
export interface TargetAccount { uid: string; email?: string; emailVerified: boolean; disabled: boolean }
export interface ProvisionPlan { action: "create" | "existing"; identity: CallADocIdentity }
export interface ProvisionDependencies {
  getUser(uid: string): Promise<TargetAccount>;
  // Adapter reads, decides and creates identity + audit atomically.
  transact(uid: string, decide: (existing: unknown) => ProvisionPlan, dryRun: boolean,
    audit: { event: string; projectId: string; targetUid: string; operator: string; timestamp: string }): Promise<ProvisionPlan>;
  now(): string;
}
export async function provisionAdministrator(options: ProvisionOptions, deps: ProvisionDependencies) {
  if (!options || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(options.projectId || "")) throw new Error("Explicit valid project ID required.");
  if (typeof options.uid !== "string" || !options.uid.trim() || options.uid.includes("/") || options.uid.length > 128) throw new Error("Explicit target UID required.");
  if (typeof options.fullName !== "string" || !options.fullName.trim() || options.fullName.trim().length > MAX_FULL_NAME_LENGTH) throw new Error("Valid full name required.");
  if (typeof options.operator !== "string" || !options.operator.trim()) throw new Error("Operator attribution required.");
  if (typeof options.dryRun !== "boolean") throw new Error("Explicit dry-run mode required.");
  const account = await deps.getUser(options.uid);
  if (!account || account.uid !== options.uid || account.disabled || !account.emailVerified
    || typeof account.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email))
    throw new Error("Target must be enabled with a verified usable Auth email.");
  const timestamp = deps.now();
  const identity: CallADocIdentity = { uid: options.uid, email: account.email, fullName: options.fullName.trim(),
    role: "administrator", status: "active", schemaVersion: 1, createdAt: timestamp, updatedAt: timestamp };
  if (!validIdentity(identity)) throw new Error("Invalid identity or timestamp.");
  return deps.transact(options.uid, existing => {
    if (existing === null) return { action: "create", identity };
    if (!validIdentity(existing) || existing.uid !== options.uid || existing.role !== "administrator"
      || existing.status !== "active" || existing.email !== account.email || existing.fullName !== identity.fullName)
      throw new Error("Existing identity conflicts; promotion or repair requires a separate reviewed operation.");
    return { action: "existing", identity: existing };
  }, options.dryRun, { event: "administrator.provisioned", projectId: options.projectId,
    targetUid: options.uid, operator: options.operator.trim(), timestamp });
}
