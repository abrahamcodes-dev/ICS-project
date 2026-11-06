import React from "react";
import {useColorScheme} from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/context/AuthContext";
import RootNavigator from "./src/navigation/RootNavigator";
import {SafeAreaProvider} from 'react-native-safe-area-context';

export default function App() {
  const dark=useColorScheme()==='dark';
  return (
    <SafeAreaProvider><AuthProvider>
      <StatusBar style={dark?"light":"dark"} />
      <RootNavigator />
    </AuthProvider></SafeAreaProvider>
  );
}
