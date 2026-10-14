import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LoginScreen from "../screens/auth/LoginScreen";
import RegisterScreen from "../screens/auth/RegisterScreen";
import ChatbotScreen from "../screens/shared/ChatbotScreen";

export type GuestStackParams={Login:undefined;Register:undefined;Chatbot:undefined};
const Stack = createNativeStackNavigator<GuestStackParams>();

// Unauthenticated stack. Guests can reach the chatbot without registering
// (per proposal: chatbot is guest-accessible).
export default function GuestNavigator() {
  return (
    <Stack.Navigator initialRouteName="Login" screenOptions={{headerShown:false}}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Chatbot" component={ChatbotScreen} />
    </Stack.Navigator>
  );
}
