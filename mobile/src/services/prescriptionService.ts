import { collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "./firebaseConfig";

// Sprint 5
export async function issuePrescription(
  consultationId: string,
  doctorId: string,
  patientId: string,
  notes: string,
  medications: { name: string; dosage: string; instructions?: string }[]
) {
  return addDoc(collection(db, "prescriptions"), {
    consultationId,
    doctorId,
    patientId,
    notes,
    medications,
    issuedAt: new Date().toISOString(),
  });
}

export async function getPrescriptionsForPatient(patientId: string) {
  const q = query(collection(db, "prescriptions"), where("patientId", "==", patientId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}
