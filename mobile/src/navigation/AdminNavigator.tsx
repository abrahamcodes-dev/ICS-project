import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import VerificationQueueScreen from "../screens/admin/VerificationQueueScreen";

import {usePalette} from '../ui/design';
const Stack = createNativeStackNavigator();

export default function AdminNavigator() {
  const colors=usePalette();
  return (
    <Stack.Navigator initialRouteName="VerificationQueue" screenOptions={{headerStyle:{backgroundColor:colors.background},headerTintColor:colors.text,contentStyle:{backgroundColor:colors.background}}}>
      <Stack.Screen name="VerificationQueue" component={VerificationQueueScreen} options={{title:'Verification review'}} />
    </Stack.Navigator>
  );
}
