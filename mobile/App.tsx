import React from "react";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/context/AuthContext";
import RootNavigator from "./src/navigation/RootNavigator";
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {LanguageProvider} from './src/i18n/react';

export default function App() {
  return (
    <SafeAreaProvider><LanguageProvider><AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider></LanguageProvider></SafeAreaProvider>
  );
}
