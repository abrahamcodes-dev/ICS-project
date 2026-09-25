// Auth onCreate is still a 1st-gen-only trigger (no v2 equivalent as of
// firebase-functions v7 — v2 only offers *blocking* auth functions, which
// behave differently). Importing from the /v1 subpath explicitly.
import * as functionsV1 from "firebase-functions/v1";
import { usersCol } from "../shared/firestoreRefs";

// Sprint 1 — safety net that mirrors basic auth account info into Firestore
// in case client-side profile creation (mobile authService.ts) fails partway.
export const onUserCreate = functionsV1.auth.user().onCreate(async (user) => {
  const existing = await usersCol.doc(user.uid).get();
  if (existing.exists) return;

  await usersCol.doc(user.uid).set({
    uid: user.uid,
    email: user.email ?? "",
    fullName: user.displayName ?? "",
    role: "patient", // default; overwritten by client registration flow for doctors
    createdAt: new Date().toISOString(),
  });
});
