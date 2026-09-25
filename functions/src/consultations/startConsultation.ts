import { onCall, HttpsError } from "firebase-functions/v2/https";
import { consultationsCol } from "../shared/firestoreRefs";
import { requireFields } from "../shared/validation";
import { toHttpsError } from "../shared/errorHandler";

// Sprint 4 — creates the consultation record. This does NOT set up the
// WebRTC media session itself; see signaling.ts for why.
export const startConsultation = onCall(async (request) => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    requireFields(request.data, ["appointmentId", "doctorId", "mode"]);

    const ref = await consultationsCol.add({
      appointmentId: request.data.appointmentId,
      patientId: request.auth.uid,
      doctorId: request.data.doctorId,
      mode: request.data.mode, // "chat" | "voice" | "video"
      status: "in_progress",
      startedAt: new Date().toISOString(),
    });

    return { consultationId: ref.id };
  } catch (err) {
    throw toHttpsError(err);
  }
});
