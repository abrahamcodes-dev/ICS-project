import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { useAuth } from "../hooks/useAuth";
import GuestNavigator from "./GuestNavigator";
import PatientNavigator from "./PatientNavigator";
import DoctorNavigator from "./DoctorNavigator";
import AdminNavigator from "./AdminNavigator";

// Routes to the correct role-based navigator once auth state is known.
// Sprint 1 deliverable: Guest -> Login/Register -> role-specific stack.
export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) return null; // TODO: splash/loading screen

  if (!user) return <NavigationContainer><GuestNavigator /></NavigationContainer>;

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
