import React from "react";
import { View, Text, StyleSheet } from "react-native";

// Sprint: 1
// Email/password login via Firebase Authentication.
export default function LoginScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>LoginScreen</Text>
      <Text style={styles.desc}>Email/password login via Firebase Authentication.</Text>
      {/* TODO: implement screen per Supervisor Development Guide, Section 7 (workflows) */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 8 },
  desc: { fontSize: 14, color: "#555" },
});
