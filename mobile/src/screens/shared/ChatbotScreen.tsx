import React from "react";
import { View, Text, StyleSheet } from "react-native";

// Sprint: 5
// Rule-based health chatbot. Accessible to guests and patients.
export default function ChatbotScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ChatbotScreen</Text>
      <Text style={styles.desc}>Rule-based health chatbot. Accessible to guests and patients.</Text>
      {/* TODO: implement screen per Supervisor Development Guide, Section 7 (workflows) */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 8 },
  desc: { fontSize: 14, color: "#555" },
});
