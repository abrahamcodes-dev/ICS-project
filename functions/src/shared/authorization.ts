import { HttpsError } from "firebase-functions/v2/https";
import { validIdentity } from "../auth/registrationPolicy";
export function requireAuthenticated(auth: { uid: string } | undefined | null): string {
  if (!auth || typeof auth.uid !== "string" || !auth.uid.trim() || auth.uid.includes("/"))
    throw new HttpsError("unauthenticated", "Authentication required.");
  return auth.uid;
}
/** Reader must use trusted backend storage, never request data or token roles. */
export function createAuthorization(readIdentity: (uid: string) => Promise<unknown>) {
  async function requireIdentity(auth: { uid: string } | undefined | null) {
    const uid = requireAuthenticated(auth);
    const identity = await readIdentity(uid);
    if (!validIdentity(identity) || identity.uid !== uid)
      throw new HttpsError("permission-denied", "Valid identity required.");
    return identity;
  }
  async function requireActive(auth: { uid: string } | undefined | null) {
    const identity = await requireIdentity(auth);
    if (identity.status !== "active") throw new HttpsError("permission-denied", "Active identity required.");
    return identity;
  }
  async function requireAdministrator(auth: { uid: string } | undefined | null) {
    const identity = await requireActive(auth);
    if (identity.role !== "administrator") throw new HttpsError("permission-denied", "Administrator required.");
    return identity;
  }
  async function requireApprovedDoctor(auth: { uid: string } | undefined | null) {
    const identity = await requireActive(auth);
    if (identity.role !== "doctor" || identity.verificationStatus !== "approved")
      throw new HttpsError("permission-denied", "Approved doctor required.");
    return identity;
  }
  return { requireIdentity, requireActive, requireAdministrator, requireApprovedDoctor };
}
export const authorization = createAuthorization(async uid => {
  const { usersCol } = await import("./firestoreRefs");
  const snapshot = await usersCol.doc(uid).get();
  return snapshot.exists ? snapshot.data() : null;
});
