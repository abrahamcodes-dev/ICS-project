import React from 'react';
import { View, Pressable, Text } from 'react-native';
import { usePalette } from '../ui/design';
export default function RatingStars({ value, onChange, disabled = false }: { value: number | null; onChange?(value: number): void; disabled?: boolean }) {
  const colors = usePalette();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {[0,1,2,3,4,5].map(n => <Pressable key={n} accessibilityRole="radio" accessibilityLabel={`${n} out of 5`}
      accessibilityState={{ selected: value === n, disabled }} disabled={disabled || !onChange} onPress={() => onChange?.(n)}
      style={{ minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
        borderRadius: 12, borderColor: value === n ? colors.accent : colors.border }}>
      <Text style={{ color: colors.text }}>{n}</Text>
    </Pressable>)}
  </View>;
}
