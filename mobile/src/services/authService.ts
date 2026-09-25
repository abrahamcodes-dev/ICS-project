import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import { UserRole } from "@shared/types";

// Sprint 1: registration + login. Doctors are written with
// verificationStatus="pending" and must wait for admin approval
// (see functions/src/verification and screens/admin/VerificationQueueScreen).
export async function registerUser(
  email: string,
  password: string,
  fullName: string,
  role: UserRole
) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  await setDoc(doc(db, "users", credential.user.uid), {
    uid: credential.user.uid,
    email,
    fullName,
    role,
    createdAt: serverTimestamp(),
    ...(role === "doctor" ? { verificationStatus: "pending", credentials: [] } : {}),
  });

  return credential.user;
}

export function loginUser(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logoutUser() {
  return signOut(auth);
}
