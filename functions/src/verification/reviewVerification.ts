import { onCall, HttpsError } from "firebase-functions/v2/https";
import { usersCol } from "../shared/firestoreRefs";
import { requireFields } from "../shared/validation";
import { toHttpsError } from "../shared/errorHandler";

// Sprint 2 — administrator approves or rejects a doctor.
// TODO: rejection/appeal flow is an open decision (Supervisor Guide, Section 18) —
// this only records a status, it does not notify or allow resubmission yet.
export const reviewVerification = onCall(async (request) => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    requireFields(request.data, ["doctorId", "decision"]);

    if (!["approved", "rejected"].includes(request.data.decision)) {
      throw new HttpsError("invalid-argument", "decision must be approved|rejected");
    }

    // TODO: verify request.auth.uid actually belongs to an administrator
    // (requires custom claims or a Firestore role check — not yet implemented).

    await usersCol.doc(request.data.doctorId).update({
      verificationStatus: request.data.decision,
      reviewedBy: request.auth.uid,
      reviewedAt: new Date().toISOString(),
    });

    return { success: true };
  } catch (err) {
    throw toHttpsError(err);
  }
});
