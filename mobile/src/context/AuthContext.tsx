import React, { createContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../services/firebaseConfig";
import { loadOwnIdentity } from "../services/identityService";
import { onIdentityRefresh, logoutUser } from "../services/authService";
import { AuthState, initialAuthState, createAuthStateController } from "./authState";

interface AuthContextValue extends AuthState {
  loading: boolean;
  refreshIdentity(): Promise<void>;
  logout(): Promise<void>;
}
export const AuthContext = createContext<AuthContextValue>({
  ...initialAuthState, loading: true, refreshIdentity: async () => {}, logout: logoutUser,
});
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(initialAuthState);
  const controller = useRef<ReturnType<typeof createAuthStateController> | null>(null);
  useEffect(() => {
    const current = createAuthStateController({
      observeAuth: (next, error) => onAuthStateChanged(auth, user => next(user?.uid ?? null), error),
      observeIdentityRefresh: onIdentityRefresh,
      currentUid: () => auth.currentUser?.uid ?? null,
      loadIdentity: loadOwnIdentity,
    }, setState);
    controller.current = current;
    return () => { current.stop(); controller.current = null; };
  }, []);
  return <AuthContext.Provider value={{
    ...state, loading: state.status === "initializing" || state.status === "loadingIdentity",
    refreshIdentity: async () => { await controller.current?.refresh(); }, logout: logoutUser,
  }}>{children}</AuthContext.Provider>;
}
