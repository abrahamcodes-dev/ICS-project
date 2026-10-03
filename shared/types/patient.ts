/** Legacy UI scaffold only. Persist new domain data using profiles.d.ts; never embed it in users/{uid}. */
import { BaseUser } from "./user";

// TODO: attributes below are inferred (Section 11, "Derived from document") —
// not specified in the original proposal. Confirm/extend before Sprint 2.
export interface HealthProfile {
  patientId: string;
  dateOfBirth?: string;
  gender?: string;
  knownConditions?: string[];
  allergies?: string[];
  currentMedications?: string[];
  updatedAt: string;
}

export interface Patient extends BaseUser {
  role: "patient";
  healthProfile?: HealthProfile;
}
