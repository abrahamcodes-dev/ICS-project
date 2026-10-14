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
import {PatientHomeScreen,PatientAppointments,DoctorsScreen,DoctorProfileScreen,PatientProfileScreen} from '../screens/patient/PatientExperience';
import {usePalette} from '../ui/design';
const Stack = createNativeStackNavigator<PatientStackParams>();

export default function PatientNavigator() {
  const colors=usePalette();
  return (
    <Stack.Navigator initialRouteName="Home" screenOptions={{headerStyle:{backgroundColor:colors.background},headerTintColor:colors.text,contentStyle:{backgroundColor:colors.background}}}>
      <Stack.Screen name="Home" component={PatientHomeScreen} />
      <Stack.Screen name="Doctors" component={DoctorsScreen} />
      <Stack.Screen name="DoctorProfile" component={DoctorProfileScreen} options={{title:'Doctor profile'}} />
      <Stack.Screen name="Profile" component={PatientProfileScreen} />
      <Stack.Screen name="Appointments" component={PatientAppointments} />
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
