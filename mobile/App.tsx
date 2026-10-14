import React from "react";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/context/AuthContext";
import RootNavigator from "./src/navigation/RootNavigator";
import {SafeAreaProvider} from 'react-native-safe-area-context';

export default function App() {
  return (
    <SafeAreaProvider><AuthProvider>
      <StatusBar style="auto" />
      <RootNavigator />
    </AuthProvider></SafeAreaProvider>
  );
}
