import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ratingsCol, usersCol } from "../shared/firestoreRefs";
import { requireFields } from "../shared/validation";
import { toHttpsError } from "../shared/errorHandler";

// Sprint 5. Aggregation strategy (recompute average on write) is a
// reasonable default — the source document does not specify one
// (see Section 7, workflow 7: "aggregation/moderation logic not specified").
export const rateDoctor = onCall(async (request) => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    requireFields(request.data, ["consultationId", "doctorId", "score"]);

    if (request.data.score < 1 || request.data.score > 5) {
      throw new HttpsError("invalid-argument", "score must be between 1 and 5");
    }

    await ratingsCol.add({
      consultationId: request.data.consultationId,
      doctorId: request.data.doctorId,
      patientId: request.auth.uid,
      score: request.data.score,
      comment: request.data.comment ?? "",
      createdAt: new Date().toISOString(),
    });

    const snapshot = await ratingsCol.where("doctorId", "==", request.data.doctorId).get();
    const scores = snapshot.docs.map((d) => d.data().score as number);
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;

    await usersCol.doc(request.data.doctorId).update({ averageRating: average });

    return { success: true, averageRating: average };
  } catch (err) {
    throw toHttpsError(err);
  }
});
