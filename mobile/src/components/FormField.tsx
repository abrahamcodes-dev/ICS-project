import {usePalette} from '../ui/design';
import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";

interface Props {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
}

export default function FormField({ label, value, onChangeText, secureTextEntry, keyboardType }: Props) {
  const p=usePalette();
  return (
    <View style={styles.container}>
      <Text style={[styles.label,{color:p.text}]}>{label}</Text>
      <TextInput
        placeholderTextColor={p.textMuted} selectionColor={p.accent} style={[styles.input,{color:p.text,backgroundColor:p.inputBackground,borderColor:p.inputBorder}]}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  label: { fontSize: 13, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 6, padding: 10 },
});
