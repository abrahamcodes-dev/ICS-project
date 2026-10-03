import { HttpsError } from "firebase-functions/v2/https";
import type { DoctorDraftInput, DoctorProfile, DomainTimestamp } from "../../../shared/types/profiles";
import { createAuthorization, requireAuthenticated } from "../shared/authorization";
import { DomainValidationError, validateDoctorDraftInput } from "./domainValidation";
import { planDoctorDraft, validateDoctorProfile } from "./verificationPolicy";

const professional = ["professionalName", "specialty", "registrationNumber", "issuingAuthority"] as const;
const editable = [...professional, "phoneNumber"] as const;
export interface DraftTransaction {
  readIdentity(): Promise<unknown>;
  readProfile(): Promise<DoctorProfile | null>;
  writeProfile(profile: DoctorProfile): void;
}
export interface DoctorDraftDependencies {
  now(): DomainTimestamp;
  transact<T>(uid: string, action: (transaction: DraftTransaction) => Promise<T>): Promise<T>;
}

export function createDoctorDraftHandler(deps: DoctorDraftDependencies) {
  return async (request: { auth?: { uid: string }; data: unknown }) => {
    const uid = requireAuthenticated(request.auth);
    let input: DoctorDraftInput;
    try { input = validateDoctorDraftInput(request.data); }
    catch { throw new HttpsError("invalid-argument", "Supply only valid editable doctor profile fields."); }
    // Only errors produced deliberately here can cross the callable boundary.
    const safeErrors = new Set<Error>();
    const reject = (code: "permission-denied" | "failed-precondition", message: string): never => {
      const error = new HttpsError(code, message); safeErrors.add(error); throw error;
    };
    try {
      return await deps.transact(uid, async transaction => {
        // These reads run again on every Firestore transaction attempt.
        const authorization = createAuthorization(() => transaction.readIdentity());
        const identity = await authorization.requireActive({ uid }).catch(() =>
          reject("permission-denied", "Active doctor identity required."));
        if (identity.role !== "doctor") reject("permission-denied", "Active doctor identity required.");
        try {
          const existing = await transaction.readProfile();
          if (existing) validateDoctorProfile(existing);
          const fields = { ...input };
          if (identity.verificationStatus === "approved" && existing) {
            // Approved callers may omit locked fields; explicitly supplied changes
            // are still compared by the 3B transition policy and rejected.
            for (const key of professional) if (!(key in fields)) fields[key] = existing[key];
          }
          const planned = planDoctorDraft(uid, existing, fields, existing?.revision ?? 0,
            identity.verificationStatus!, deps.now());
          // State/lock validation precedes this no-op check. Normalized retries
          // cannot unlock submitted drafts or increment a revision repeatedly.
          if (existing && editable.every(key => existing[key] === planned[key])) {
            return { revision: existing.revision, changed: false };
          }
          transaction.writeProfile(planned);
          return { revision: planned.revision, changed: true };
        } catch (error) {
          if (error instanceof DomainValidationError) reject("failed-precondition", "Doctor draft state does not permit this save.");
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof Error && safeErrors.has(error)) throw error;
      throw new HttpsError("internal", "Doctor draft could not be saved. Please retry later.");
    }
  };
}
