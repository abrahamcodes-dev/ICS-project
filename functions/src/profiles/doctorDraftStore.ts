import { Timestamp, type Firestore, type CollectionReference } from "firebase-admin/firestore";
import type { DoctorProfile } from "../../../shared/types/profiles";
import type { DoctorDraftDependencies } from "./doctorDraftHandler";
import { fail } from "./domainValidation";

/** No SDK initialization here; dependencies also permit local-emulator tests. */
export function createDoctorDraftStore(db: Firestore, profiles: CollectionReference<DoctorProfile>): DoctorDraftDependencies {
  return {
    now: () => Timestamp.now(),
    transact: (uid, action) => db.runTransaction(async transaction => {
      const ref = profiles.doc(uid);
      return action({
        readIdentity: async () => {
          const snapshot = await transaction.get(db.collection("users").doc(uid));
          return snapshot.exists ? snapshot.data() : null;
        },
        readProfile: async () => {
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists) return null;
          const data = snapshot.data();
          // Structural timestamp maps are not legitimate persisted documents.
          if (!data || !(data.createdAt instanceof Timestamp) || !(data.updatedAt instanceof Timestamp))
            return fail("invalid-stored-timestamp");
          return data;
        },
        writeProfile: profile => transaction.set(ref, { ...profile,
          createdAt: new Timestamp(profile.createdAt.seconds, profile.createdAt.nanoseconds),
          updatedAt: new Timestamp(profile.updatedAt.seconds, profile.updatedAt.nanoseconds) }),
      });
    }),
  };
}
