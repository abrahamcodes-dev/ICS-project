import React from "react";
import { View, Text, StyleSheet, Button } from "react-native";
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {PatientStackParams} from '../../navigation/types';

// Sprint: 2
// Create/edit the patient health profile.
export default function HealthProfileScreen({navigation}: NativeStackScreenProps<PatientStackParams,'HealthProfile'>) {
  return (
    <View style={styles.container}>
      <Button title="My appointments" onPress={()=>navigation.navigate('Appointments')}/>
      <Text style={styles.title}>HealthProfileScreen</Text>
      <Text style={styles.desc}>Create/edit the patient health profile.</Text>
      {/* TODO: implement screen per Supervisor Development Guide, Section 7 (workflows) */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 8 },
  desc: { fontSize: 14, color: "#555" },
});
