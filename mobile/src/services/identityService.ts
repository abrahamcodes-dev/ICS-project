import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebaseConfig";
import { parseIdentity } from "./identityParser";

export async function loadOwnIdentity(uid: string) {
  if (!auth.currentUser || auth.currentUser.uid !== uid) throw new Error("Current authentication required.");
  const snapshot = await getDoc(doc(db, "users", uid));
  if (auth.currentUser?.uid !== uid) throw new Error("Authentication changed.");
  return snapshot.exists() ? parseIdentity(snapshot.data(), uid) : null;
}
