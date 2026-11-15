import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LoginScreen from "../screens/auth/LoginScreen";
import RegisterScreen from "../screens/auth/RegisterScreen";
import ChatbotScreen from "../screens/shared/ChatbotScreen";

import {WelcomeScreen,AccountAccessScreen,RoleSelectionScreen} from '../screens/auth/OnboardingScreens';
export type GuestStackParams={Welcome:undefined;AccountAccess:undefined;RoleSelection:undefined;Login:undefined;Register:{role:'patient'|'doctor'}|undefined;Chatbot:undefined};
const Stack = createNativeStackNavigator<GuestStackParams>();

// Unauthenticated stack. Guests can reach the chatbot without registering
// (per proposal: chatbot is guest-accessible).
export default function GuestNavigator() {
  return (
    <Stack.Navigator initialRouteName="Welcome" screenOptions={{headerShown:false}}>
      <Stack.Screen name="Welcome" component={WelcomeScreen}/>
      <Stack.Screen name="AccountAccess" component={AccountAccessScreen}/>
      <Stack.Screen name="RoleSelection" component={RoleSelectionScreen}/>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Chatbot" component={ChatbotScreen} />
    </Stack.Navigator>
  );
}
