import React from "react";
import { View, Text, StyleSheet } from "react-native";

// Sprint: 2
// Administrator reviews pending doctor verification submissions.
export default function VerificationQueueScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>VerificationQueueScreen</Text>
      <Text style={styles.desc}>Administrator reviews pending doctor verification submissions.</Text>
      {/* TODO: implement screen per Supervisor Development Guide, Section 7 (workflows) */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 8 },
  desc: { fontSize: 14, color: "#555" },
});
