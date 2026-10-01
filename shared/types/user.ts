import type { UserRole } from "./identity";
export type { UserRole } from "./identity";

export interface BaseUser {
  uid: string;               // Firebase Auth UID
  role: UserRole;
  email: string;
  fullName: string;
  phoneNumber?: string;
  createdAt: string;         // ISO timestamp
}
