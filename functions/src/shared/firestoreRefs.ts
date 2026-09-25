//import { initializeApp, getApps } from "firebase-admin/app";
//import { getFirestore } from "firebase-admin/firestore";
//import { getStorage } from "firebase-admin/storage";

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const storage = getStorage();
export const usersCol = db.collection("users");
export const availabilityCol = db.collection("availabilitySlots");
export const appointmentsCol = db.collection("appointments");
export const consultationsCol = db.collection("consultations");
export const prescriptionsCol = db.collection("prescriptions");
export const ratingsCol = db.collection("ratings");
export const chatbotInteractionsCol = db.collection("chatbotInteractions");
