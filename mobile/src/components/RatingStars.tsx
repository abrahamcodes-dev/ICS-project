import {tr} from "../i18n/translate";
import {useLocale} from "../i18n/react";
import React from 'react';
import { View, Pressable, Text } from 'react-native';
import { usePalette } from '../ui/design';
export default function RatingStars({ value, onChange, disabled = false }: { value: number | null; onChange?(value: number): void; disabled?: boolean }) {
  useLocale();
  const colors = usePalette();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {[0,1,2,3,4,5].map(n => <Pressable key={n} accessibilityRole="radio" accessibilityLabel={tr("{0} out of 5", {"0": n})}
      accessibilityState={{ selected: value === n, disabled }} disabled={disabled || !onChange} onPress={() => onChange?.(n)}
      style={{ minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
        borderRadius: 12, borderColor: value === n ? colors.accent : colors.border }}>
      <Text style={{ color: colors.text }}>{n}</Text>
    </Pressable>)}
  </View>;
}
