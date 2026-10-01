import type { CallADocIdentity } from "@shared/types/identity";
export type AuthState = {
  status: "initializing" | "signedOut" | "loadingIdentity" | "identityMissing" | "ready" | "identityError";
  firebaseUid: string | null;
  user: CallADocIdentity | null;
  error: string | null;
};
export const initialAuthState: AuthState = { status: "initializing", firebaseUid: null, user: null, error: null };
export interface AuthStateDependencies {
  observeAuth(next: (uid: string | null) => void, error: () => void): () => void;
  observeIdentityRefresh(next: () => void): () => void;
  currentUid(): string | null;
  loadIdentity(uid: string): Promise<CallADocIdentity | null>;
}
/** Generation checks prevent old reads from restoring a signed-out/previous account. */
export function createAuthStateController(deps: AuthStateDependencies, emit: (state: AuthState) => void) {
  let generation = 0;
  let stopped = false;
  async function refresh() {
    const version = ++generation;
    const uid = deps.currentUid();
    if (stopped) return;
    if (!uid) {
      emit({ status: "signedOut", firebaseUid: null, user: null, error: null });
      return;
    }
    emit({ status: "loadingIdentity", firebaseUid: uid, user: null, error: null });
    try {
      const identity = await deps.loadIdentity(uid);
      if (stopped || version !== generation || deps.currentUid() !== uid) return;
      emit({ status: identity ? "ready" : "identityMissing", firebaseUid: uid, user: identity, error: null });
    } catch {
      if (stopped || version !== generation || deps.currentUid() !== uid) return;
      emit({ status: "identityError", firebaseUid: uid, user: null, error: "Unable to load a valid CallADoc identity. Retry loading or contact support." });
    }
  }
  const unsubscribe = deps.observeAuth(() => { void refresh(); }, () => {
    ++generation;
    if (!stopped) emit({ status: "identityError", firebaseUid: deps.currentUid(), user: null, error: "Unable to observe authentication." });
  });
  const stopRefresh = deps.observeIdentityRefresh(() => { void refresh(); });
  return { refresh, stop() { stopped = true; ++generation; unsubscribe(); stopRefresh(); } };
}
