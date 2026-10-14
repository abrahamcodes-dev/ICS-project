import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SubmitVerificationScreen from "../screens/doctor/SubmitVerificationScreen";
import SetAvailabilityScreen from "../screens/doctor/SetAvailabilityScreen";
import ConsultationRoomScreen from "../screens/doctor/ConsultationRoomScreen";
import IssuePrescriptionScreen from "../screens/doctor/IssuePrescriptionScreen";
import NotificationsScreen from "../screens/shared/NotificationsScreen";

import type {DoctorStackParams} from "./types";
import {DoctorAppointmentsScreen} from "../screens/shared/AppointmentsScreen";
import DoctorWorkspace from '../screens/doctor/DoctorWorkspace';
import {usePalette} from '../ui/design';
const Stack = createNativeStackNavigator<DoctorStackParams>();

export default function DoctorNavigator() {
  const colors=usePalette();
  return (
    <Stack.Navigator initialRouteName="DoctorWorkspace" screenOptions={{headerStyle:{backgroundColor:colors.background},headerTintColor:colors.text,contentStyle:{backgroundColor:colors.background}}}>
      <Stack.Screen name="DoctorWorkspace" component={DoctorWorkspace} options={{headerShown:false}} />
      <Stack.Screen name="Appointments" component={DoctorAppointmentsScreen} />
      <Stack.Screen name="SubmitVerification" component={SubmitVerificationScreen} />
      <Stack.Screen name="SetAvailability" component={SetAvailabilityScreen} />
      <Stack.Screen name="ConsultationRoom" component={ConsultationRoomScreen} />
      <Stack.Screen name="IssuePrescription" component={IssuePrescriptionScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}
