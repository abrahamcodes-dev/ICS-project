import { HttpsError } from "firebase-functions/v2/https";
import type { CallADocIdentity } from "../../../shared/types/identity";
import { planRegistration, RegistrationPolicyError, validateRegistrationRequest } from "./registrationPolicy";

export interface RegistrationDependencies {
  getUser(uid: string): Promise<{ uid: string; email?: string; disabled: boolean }>;
  now(): string;
  transact(uid: string, decide: (existing: unknown) => ReturnType<typeof planRegistration>): Promise<CallADocIdentity>;
}

export function createRegistrationHandler(deps: RegistrationDependencies) {
  return async (request: { auth?: { uid: string }; data: unknown }): Promise<CallADocIdentity> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in before registering.");
    // Only errors deliberately created here are returned to the client.
    const allowedErrors = new Set<HttpsError>();
    const fail = (code: "permission-denied" | "failed-precondition", message: string): never => {
      const error = new HttpsError(code, message);
      allowedErrors.add(error);
      throw error;
    };
    try {
      const input = validateRegistrationRequest(request.data);
      const user = await deps.getUser(uid);
      if (user.uid !== uid) throw new Error("Auth identity mismatch");
      if (user.disabled) fail("permission-denied", "This account is disabled.");
      const email = user.email;
      if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fail("failed-precondition", "An account email is required to register.");
      }
      const context = { uid, email: email as string, timestamp: deps.now() };
      return await deps.transact(uid, existing => planRegistration(context, input, existing));
    } catch (error) {
      if (error instanceof HttpsError && allowedErrors.has(error)) throw error;
      if (error instanceof RegistrationPolicyError) {
        switch (error.code) {
          case "invalid-request":
            throw new HttpsError("invalid-argument", "Provide only a patient or doctor role and a nonempty fullName of at most 200 characters.");
          case "administrator-protected":
          case "account-disabled":
            throw new HttpsError("permission-denied", "Public registration is not permitted for this identity.");
          case "role-conflict":
            throw new HttpsError("failed-precondition", "An existing identity cannot change roles through registration.");
          case "invalid-existing-identity":
            throw new HttpsError("failed-precondition", "The existing identity requires administrator assistance.");
        }
      }
      throw new HttpsError("internal", "Registration could not be completed. Please retry later.");
    }
  };
}
