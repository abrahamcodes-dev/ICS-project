import React from "react";
import { View, Text, StyleSheet } from "react-native";

// Sprint: 4
// Join a real-time chat/voice/video consultation. WebRTC wiring is a placeholder (open decision, Section 8).
export default function ConsultationScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ConsultationScreen</Text>
      <Text style={styles.desc}>Join a real-time chat/voice/video consultation. WebRTC wiring is a placeholder (open decision, Section 8).</Text>
      {/* TODO: implement screen per Supervisor Development Guide, Section 7 (workflows) */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 8 },
  desc: { fontSize: 14, color: "#555" },
});
