import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, type CollectionReference } from "firebase-admin/firestore";
import type { DoctorProfile, DoctorPublicProfile } from "../../../shared/types/profiles";
import type { DoctorCredentialRecord, VerificationRequest, VerificationAudit } from "../../../shared/types/verification";
import { getStorage } from "firebase-admin/storage";

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const storage = getStorage();
export const usersCol = db.collection("users");
export const doctorProfilesCol = db.collection("doctorProfiles") as CollectionReference<DoctorProfile>;
export const doctorCredentialsCol = db.collection("doctorCredentials") as CollectionReference<DoctorCredentialRecord>;
export const verificationRequestsCol = db.collection("verificationRequests") as CollectionReference<VerificationRequest>;
export const verificationAuditCol = db.collection("verificationAudit") as CollectionReference<VerificationAudit>;
export const doctorPublicProfilesCol = db.collection("doctorPublicProfiles") as CollectionReference<DoctorPublicProfile>;
export const availabilityCol = db.collection("availabilitySlots");
export const appointmentsCol = db.collection("appointments");
export const consultationsCol = db.collection("consultations");
export const prescriptionsCol = db.collection("prescriptions");
export const ratingsCol = db.collection("ratings");
export const chatbotInteractionsCol = db.collection("chatbotInteractions");
