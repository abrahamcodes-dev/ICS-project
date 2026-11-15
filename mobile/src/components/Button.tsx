import {usePalette} from '../ui/design';
import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export default function Button({ label, onPress, disabled }: Props) {
  const p=usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button,{backgroundColor:disabled?p.disabled:p.primary},disabled&&styles.disabled]}
    >
      <Text style={[styles.label,{color:disabled?p.onDisabled:p.onPrimary}]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 12, borderRadius: 8, alignItems: "center" },
  disabled: { opacity: 0.5 },
  label: { fontWeight: "600" },
});
