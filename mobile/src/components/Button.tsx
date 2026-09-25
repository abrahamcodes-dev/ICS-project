import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export default function Button({ label, onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: "#2E5C8A", padding: 12, borderRadius: 8, alignItems: "center" },
  disabled: { opacity: 0.5 },
  label: { color: "#fff", fontWeight: "600" },
});
