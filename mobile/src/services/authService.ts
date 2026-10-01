import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { PublicRegistrationRole, PublicRegistrationRequest, CallADocIdentity } from "@shared/types/identity";
import { auth, app } from "./firebaseConfig";
import { loadOwnIdentity } from "./identityService";
import { parseIdentity } from "./identityParser";

const identityListeners = new Set<() => void>();
export function onIdentityRefresh(listener: () => void) {
  identityListeners.add(listener);
  return () => { identityListeners.delete(listener); };
}
function currentUid() { return auth.currentUser?.uid; }
function notifyIdentityRefresh() { identityListeners.forEach(listener => listener()); }
function registrationInput(fullName: string, role: PublicRegistrationRole): PublicRegistrationRequest {
  if ((role !== "patient" && role !== "doctor") || typeof fullName !== "string"
    || !fullName.trim() || fullName.trim().length > 200) throw new Error("A patient or doctor role and valid full name are required.");
  return { role, fullName: fullName.trim() };
}
export class RegistrationIncompleteError extends Error {
  readonly code = "registration-incomplete";
  constructor() { super("Account setup could not be confirmed. Retry completion with the existing Auth account; do not create another account."); }
}
/** Retry after login or a partial registration; never creates another Auth account. */
export async function completeUserRegistration(fullName: string, role: PublicRegistrationRole): Promise<CallADocIdentity> {
  const input = registrationInput(fullName, role);
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in before completing registration.");
  try {
    const complete = httpsCallable<PublicRegistrationRequest, unknown>(getFunctions(app), "completeRegistration");
    const result = await complete(input);
    if (auth.currentUser?.uid !== uid) throw new Error("Authentication changed.");
    parseIdentity(result.data, uid);
    const identity = await loadOwnIdentity(uid);
    if (!identity || identity.role !== role) throw new Error("Identity setup not confirmed.");
    return identity;
  } catch {
    throw new RegistrationIncompleteError();
  } finally {
    notifyIdentityRefresh();
  }
}
export async function registerUser(email: string, password: string, fullName: string, role: PublicRegistrationRole) {
  const input = registrationInput(fullName, role);
  if (auth.currentUser) throw new Error("Already signed in; use registration completion instead.");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (currentUid() !== credential.user.uid) throw new RegistrationIncompleteError();
  return completeUserRegistration(input.fullName, input.role);
}
export function loginUser(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}
export async function logoutUser() {
  await signOut(auth);
  notifyIdentityRefresh();
}
