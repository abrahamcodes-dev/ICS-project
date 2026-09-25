export type UserRole = "patient" | "doctor" | "administrator";

export interface BaseUser {
  uid: string;               // Firebase Auth UID
  role: UserRole;
  email: string;
  fullName: string;
  phoneNumber?: string;
  createdAt: string;         // ISO timestamp
}
