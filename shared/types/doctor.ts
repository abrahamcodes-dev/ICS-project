import { BaseUser } from "./user";

export type VerificationStatus = "pending" | "approved" | "rejected";

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
