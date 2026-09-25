import { createContext } from "react";
import { UserRole } from "@shared/types";

// Convenience context if screens need the active role without the full
// user object. Populated from AuthContext at the navigation root.
export const RoleContext = createContext<UserRole | null>(null);
