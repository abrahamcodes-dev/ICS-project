import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import { parseIdentity } from "./identityParser";
import {isHostedAcademicDemo} from './academicDemo';

export async function loadOwnIdentity(uid: string) {
  if (!auth.currentUser || auth.currentUser.uid !== uid) throw new Error("Current authentication required.");
  // An invited Auth account may precede verification/enrollment. Show the existing
  // recovery form; the server still denies expired/revoked membership and role changes.
  const snapshot = await getDoc(doc(db, "users", uid)).catch(error=>{
    if(isHostedAcademicDemo()&&error?.code==='permission-denied'&&auth.currentUser?.uid===uid)return null;
    throw error;
  });
  if (auth.currentUser?.uid !== uid) throw new Error("Authentication changed.");
  return snapshot?.exists() ? parseIdentity(snapshot.data(), uid) : null;
}
