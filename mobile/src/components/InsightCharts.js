import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../constants/theme';

// Compact vertical bar chart for a small series (e.g. weekly demand).
// Pure RN Views — crisp and responsive on web, no SVG scaling quirks.
// data: [{ label, value }]. The last bar is highlighted as "current".
export function BarChart({ data, height = 104, color = colors.primary }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 6 }}>
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max(4, (d.value / max) * (height - 16)) : 2;
          const on = i === data.length - 1;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
              <Text style={{ fontSize: 9, color: on ? colors.primary : colors.textSecondary, fontWeight: '700', marginBottom: 2 }}>
                {d.value ? d.value : ''}
              </Text>
              <View style={{ width: '72%', height: h, borderRadius: 4, backgroundColor: on ? color : colors.goldLight }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 5 }}>
        {data.map((d, i) => {
          const on = i === data.length - 1;
          return (
            <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: on ? colors.primary : colors.textSecondary, fontWeight: on ? '800' : '600' }}>
              {d.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

// Horizontal bar row — label, a proportional track, and a value on the right.
export function HBar({ label, value, max, right, color = colors.primary }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '600', flex: 1 }} numberOfLines={1}>{label}</Text>
        <Text style={{ fontSize: 13, color: colors.textPrimary, fontWeight: '800' }}>{right}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}
