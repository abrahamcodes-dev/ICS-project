import {systemMessage} from '../i18n/translate';
import {tr} from "../i18n/translate";
import {useLocale} from "../i18n/react";
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import VerificationQueueScreen from "../screens/admin/VerificationQueueScreen";

import {usePalette} from '../ui/design';
const Stack = createNativeStackNavigator();

export default function AdminNavigator() {
  useLocale();
  const colors=usePalette();
  return (
    <Stack.Navigator initialRouteName="VerificationQueue" screenOptions={({route})=>({title:systemMessage(route.name),headerStyle:{backgroundColor:colors.background},headerTintColor:colors.text,contentStyle:{backgroundColor:colors.background}})}>
      <Stack.Screen name="VerificationQueue" component={VerificationQueueScreen} options={{title:tr("Verification review")}} />
    </Stack.Navigator>
  );
}
