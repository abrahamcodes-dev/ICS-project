/** Backend identity contract. Contains no profile or Firebase runtime dependencies. */
export type UserRole = "patient" | "doctor" | "administrator";
export type PublicRegistrationRole = Exclude<UserRole, "administrator">;
export type AccountStatus = "active" | "disabled";
export type DoctorVerificationStatus = "pending" | "approved" | "rejected";

interface IdentityFields {
  uid: string;
  email: string;
  fullName: string;
  status: AccountStatus;
  /** Canonical UTC ISO strings, supplied by the backend clock, never the client. */
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
}

export type CallADocIdentity = IdentityFields & (
  | { role: "patient" | "administrator"; verificationStatus?: never }
  | { role: "doctor"; verificationStatus: DoctorVerificationStatus }
);

export interface PublicRegistrationRequest {
  role: PublicRegistrationRole;
  fullName: string;
}

export interface TrustedRegistrationContext {
  uid: string;
  email: string;
  timestamp: string;
}
