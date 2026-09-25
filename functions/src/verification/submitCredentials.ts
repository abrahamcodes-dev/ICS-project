import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { usersCol } from "../shared/firestoreRefs";
import { requireFields } from "../shared/validation";
import { toHttpsError } from "../shared/errorHandler";

// Sprint 2 — doctor submits credential documents (already uploaded to
// Storage by the client) and is flagged pending review.
export const submitCredentials = onCall(async (request) => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    requireFields(request.data, ["fileUrl"]);

    const doctorRef = usersCol.doc(request.auth.uid);
    await doctorRef.update({
      verificationStatus: "pending",
      credentials: FieldValue.arrayUnion({
        fileUrl: request.data.fileUrl,
        uploadedAt: new Date().toISOString(),
      }),
    });

    return { success: true };
  } catch (err) {
    throw toHttpsError(err);
  }
});
