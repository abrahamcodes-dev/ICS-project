import { onCall, HttpsError } from "firebase-functions/v2/https";
import { availabilityCol, appointmentsCol } from "../shared/firestoreRefs";
import { requireFields } from "../shared/validation";
import { toHttpsError } from "../shared/errorHandler";

// Sprint 3 — books a slot transactionally so two patients cannot double-book it,
// then hands off to notifications (see functions/src/notifications).
export const bookAppointment = onCall(async (request) => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    requireFields(request.data, ["doctorId", "slotId"]);

    const slotRef = availabilityCol.doc(request.data.slotId);

    const appointmentId = await slotRef.firestore.runTransaction(async (tx) => {
      const slotSnap = await tx.get(slotRef);
      if (!slotSnap.exists) throw new HttpsError("not-found", "Slot not found.");
      if (slotSnap.data()?.isBooked) {
        throw new HttpsError("failed-precondition", "Slot already booked.");
      }

      tx.update(slotRef, { isBooked: true });

      const apptRef = appointmentsCol.doc();
      tx.set(apptRef, {
        patientId: request.auth!.uid,
        doctorId: request.data.doctorId,
        slotId: request.data.slotId,
        status: "booked",
        createdAt: new Date().toISOString(),
      });
      return apptRef.id;
    });

    // TODO: call the notification module to alert both parties (Sprint 3 deliverable).

    return { appointmentId };
  } catch (err) {
    throw toHttpsError(err);
  }
});
