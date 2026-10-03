/** Legacy UI scaffold only. New contracts live in profiles.d.ts and verification.d.ts; this is not a users/{uid} schema. */
import { BaseUser } from "./user";

export type { DoctorVerificationStatus as VerificationStatus } from "./identity";
import type { DoctorVerificationStatus as VerificationStatus } from "./identity";

export interface DoctorCredential {
  fileUrl: string;           // Firebase Storage path
  uploadedAt: string;
  reviewedBy?: string;       // administrator uid
  reviewedAt?: string;
}

export interface Doctor extends BaseUser {
  role: "doctor";
  specialty?: string;
  verificationStatus: VerificationStatus;
  credentials: DoctorCredential[];
  averageRating?: number;
}
