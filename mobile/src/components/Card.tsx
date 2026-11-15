import {usePalette} from '../ui/design';
import React from "react";
import { View, StyleSheet } from "react-native";

export default function Card({ children }: { children: React.ReactNode }) {
  const p=usePalette();
  return <View style={[styles.card,{backgroundColor:p.surfaceElevated,shadowColor:p.shadow}]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {

    borderRadius: 10,
    padding: 14,
    marginVertical: 6,

    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
});
