import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SubmitVerificationScreen from "../screens/doctor/SubmitVerificationScreen";
import SetAvailabilityScreen from "../screens/doctor/SetAvailabilityScreen";
import ConsultationRoomScreen from "../screens/doctor/ConsultationRoomScreen";
import IssuePrescriptionScreen from "../screens/doctor/IssuePrescriptionScreen";
import NotificationsScreen from "../screens/shared/NotificationsScreen";

const Stack = createNativeStackNavigator();

export default function DoctorNavigator() {
  return (
    <Stack.Navigator initialRouteName="SetAvailability">
      <Stack.Screen name="SubmitVerification" component={SubmitVerificationScreen} />
      <Stack.Screen name="SetAvailability" component={SetAvailabilityScreen} />
      <Stack.Screen name="ConsultationRoom" component={ConsultationRoomScreen} />
      <Stack.Screen name="IssuePrescription" component={IssuePrescriptionScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}
