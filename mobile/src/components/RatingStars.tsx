import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";

interface Props {
  value: number;
  onChange?: (value: number) => void;
}

// Used by RateDoctorScreen (Sprint 5).
export default function RatingStars({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange?.(n)}>
          <Text style={styles.star}>{n <= value ? "★" : "☆"}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  star: { fontSize: 28, marginRight: 4, color: "#F5A623" },
});
