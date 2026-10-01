import { getAuth } from "firebase-admin/auth";
import { onCall } from "firebase-functions/v2/https";
import { db, usersCol } from "../shared/firestoreRefs";
import { createRegistrationHandler } from "./registrationHandler";

export const completeRegistration = onCall(createRegistrationHandler({
  getUser: uid => getAuth().getUser(uid),
  now: () => new Date().toISOString(),
  transact: (uid, decide) => {
    const ref = usersCol.doc(uid);
    return db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      // Existing but unreadable data must fail validation, never look absent.
      const decision = decide(snapshot.exists ? (snapshot.data() ?? {}) : null);
      if (decision.action === "create") transaction.create(ref, decision.identity);
      return decision.identity;
    });
  },
}));
