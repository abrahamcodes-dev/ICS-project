import { collection, addDoc, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "./firebaseConfig";

// Sprint 3: availability + booking.
export async function setAvailability(doctorId: string, startTime: string, endTime: string) {
  return addDoc(collection(db, "availabilitySlots"), {
    doctorId,
    startTime,
    endTime,
    isBooked: false,
  });
}

export async function getAvailableSlots(doctorId: string) {
  const q = query(
    collection(db, "availabilitySlots"),
    where("doctorId", "==", doctorId),
    where("isBooked", "==", false)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function bookAppointment(patientId: string, doctorId: string, slotId: string) {
  await updateDoc(doc(db, "availabilitySlots", slotId), { isBooked: true });
  return addDoc(collection(db, "appointments"), {
    patientId,
    doctorId,
    slotId,
    status: "booked",
    createdAt: new Date().toISOString(),
  });
  // TODO: trigger FCM notification — see functions/src/notifications
}
