import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { useAuth } from "../hooks/useAuth";
import GuestNavigator from "./GuestNavigator";
import PatientNavigator from "./PatientNavigator";
import DoctorNavigator from "./DoctorNavigator";
import AdminNavigator from "./AdminNavigator";
import AccountStatusScreen from '../screens/auth/AccountStatusScreen';

// Routes to the correct role-based navigator once auth state is known.
// Sprint 1 deliverable: Guest -> Login/Register -> role-specific stack.
export default function RootNavigator() {
  const { user, loading, status } = useAuth();

  if (loading) return <AccountStatusScreen />;

  if (status === "signedOut") return <NavigationContainer><GuestNavigator /></NavigationContainer>;
  // Recovery/status screens preserve the existing clinical-route eligibility guards.
  if (status !== "ready" || !user || user.status !== "active") return <AccountStatusScreen />;
  if (user.role === "doctor" && user.verificationStatus !== "approved") return <AccountStatusScreen />;

  switch (user.role) {
    case "patient":
      return <NavigationContainer><PatientNavigator /></NavigationContainer>;
    case "doctor":
      return <NavigationContainer><DoctorNavigator /></NavigationContainer>;
    case "administrator":
      return <NavigationContainer><AdminNavigator /></NavigationContainer>;
    default:
      return <NavigationContainer><GuestNavigator /></NavigationContainer>;
  }
}
