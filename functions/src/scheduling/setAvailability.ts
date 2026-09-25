import { onCall, HttpsError } from "firebase-functions/v2/https";
import { availabilityCol } from "../shared/firestoreRefs";
import { requireFields } from "../shared/validation";
import { toHttpsError } from "../shared/errorHandler";

// Sprint 3
export const setAvailability = onCall(async (request) => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    requireFields(request.data, ["startTime", "endTime"]);

    const ref = await availabilityCol.add({
      doctorId: request.auth.uid,
      startTime: request.data.startTime,
      endTime: request.data.endTime,
      isBooked: false,
    });

    return { id: ref.id };
  } catch (err) {
    throw toHttpsError(err);
  }
});
