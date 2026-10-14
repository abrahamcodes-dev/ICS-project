import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HealthProfileScreen from "../screens/patient/HealthProfileScreen";
import BookAppointmentScreen from "../screens/patient/BookAppointmentScreen";
import ConsultationScreen from "../screens/patient/ConsultationScreen";
import PrescriptionsScreen from "../screens/patient/PrescriptionsScreen";
import RateDoctorScreen from "../screens/patient/RateDoctorScreen";
import ChatbotScreen from "../screens/shared/ChatbotScreen";
import NotificationsScreen from "../screens/shared/NotificationsScreen";

import type {PatientStackParams} from "./types";
import {PatientAppointmentsScreen} from "../screens/shared/AppointmentsScreen";
const Stack = createNativeStackNavigator<PatientStackParams>();

export default function PatientNavigator() {
  return (
    <Stack.Navigator initialRouteName="HealthProfile">
      <Stack.Screen name="Appointments" component={PatientAppointmentsScreen} />
      <Stack.Screen name="HealthProfile" component={HealthProfileScreen} />
      <Stack.Screen name="BookAppointment" component={BookAppointmentScreen} />
      <Stack.Screen name="Consultation" component={ConsultationScreen} />
      <Stack.Screen name="Prescriptions" component={PrescriptionsScreen} />
      <Stack.Screen name="RateDoctor" component={RateDoctorScreen} />
      <Stack.Screen name="Chatbot" component={ChatbotScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}
