import {systemMessage} from '../i18n/translate';
import {tr} from "../i18n/translate";
import {useLocale} from "../i18n/react";
import ConsultationDetailsScreen from '../screens/doctor/ConsultationDetailsScreen';
import React from "react";
import ConsultationHistoryScreen from "../screens/shared/ConsultationHistoryScreen";
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
  useLocale();
  const colors=usePalette();
  return (
    <Stack.Navigator initialRouteName="DoctorWorkspace" screenOptions={({route})=>({title:systemMessage(route.name),headerStyle:{backgroundColor:colors.background},headerTintColor:colors.text,contentStyle:{backgroundColor:colors.background}})}>
      <Stack.Screen name="DoctorWorkspace" component={DoctorWorkspace} options={{headerShown:false}} />
      <Stack.Screen name="Appointments" component={DoctorAppointmentsScreen} />
      <Stack.Screen name="SubmitVerification" component={SubmitVerificationScreen} />
      <Stack.Screen name="SetAvailability" component={SetAvailabilityScreen} options={{headerShown:false,gestureEnabled:false}} />
      <Stack.Screen name="ConsultationDetails" component={ConsultationDetailsScreen} options={{headerShown:false}} />
      <Stack.Screen name="ConsultationRoom" component={ConsultationRoomScreen} options={{title:tr('Consultation')}} />
      <Stack.Screen name="IssuePrescription" component={IssuePrescriptionScreen} options={{title:tr("Digital prescriptions"),headerTitleAlign:"center"}} />
      <Stack.Screen name="ConsultationHistory" component={ConsultationHistoryScreen} options={{title:tr("Consultation history")}} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{headerShown:false}} />
    </Stack.Navigator>
  );
}
