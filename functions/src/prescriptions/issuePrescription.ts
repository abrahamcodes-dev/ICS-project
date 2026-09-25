import { onCall, HttpsError } from "firebase-functions/v2/https";
import { consultationsCol, prescriptionsCol } from "../shared/firestoreRefs";
import { requireFields } from "../shared/validation";
import { toHttpsError } from "../shared/errorHandler";

// Sprint 5 — only callable once the linked consultation is completed,
// per the workflow in Supervisor Development Guide, Section 7.
export const issuePrescription = onCall(async (request) => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    requireFields(request.data, ["consultationId", "patientId", "medications"]);

    const consultSnap = await consultationsCol.doc(request.data.consultationId).get();
    if (!consultSnap.exists) {
      throw new HttpsError("not-found", "Consultation not found.");
    }
    if (consultSnap.data()?.status !== "completed") {
      throw new HttpsError(
        "failed-precondition",
        "Prescriptions can only be issued for completed consultations."
      );
    }

    const ref = await prescriptionsCol.add({
      consultationId: request.data.consultationId,
      doctorId: request.auth.uid,
      patientId: request.data.patientId,
      notes: request.data.notes ?? "",
      medications: request.data.medications,
      issuedAt: new Date().toISOString(),
    });

    return { prescriptionId: ref.id };
  } catch (err) {
    throw toHttpsError(err);
  }
});
