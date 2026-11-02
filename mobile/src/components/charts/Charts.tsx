import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Text } from '@/components/ui';
import { palette, useTheme } from '@/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthShort = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? key;

function useWidth() {
  const [width, setWidth] = useState(0);
  return { width, onLayout: (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width) };
}

export interface ChartPoint {
  label: string;
  value: number;
}

/** Bar chart from the prototype: soft teal bars, the highlighted one in amber. */
export function BarChart({
  data,
  highlightIndex,
  height = 96,
  accessibilityLabel,
}: {
  data: ChartPoint[];
  highlightIndex?: number;
  height?: number;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const { width, onLayout } = useWidth();
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = 6;
  const barW = data.length ? (width - gap * (data.length - 1)) / data.length : 0;
  const labels =
    data.length > 6
      ? [0, 3, 6, 9, data.length - 1].filter((i) => i < data.length)
      : data.map((_, i) => i);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={onLayout}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {data.map((d, i) => {
            const h = Math.max(6, (d.value / max) * (height - 4));
            return (
              <Rect
                key={d.label + i}
                x={i * (barW + gap)}
                y={height - h}
                width={barW}
                height={h}
                rx={5}
                fill={
                  i === (highlightIndex ?? data.length - 1) ? palette.amber : colors.primaryTint
                }
              />
            );
          })}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        {labels.map((i) => (
          <Text key={i} variant="caption" tone="muted">
            {data[i]?.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Smooth area line chart (12-month forecast). */
export function LineChart({
  data,
  height = 130,
  accessibilityLabel,
}: {
  data: ChartPoint[];
  height?: number;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const { width, onLayout } = useWidth();
  const max = Math.max(1, ...data.map((d) => d.value));
  const pad = 6;
  const pts = data.map((d, i) => ({
    x: data.length > 1 ? (i / (data.length - 1)) * width : width / 2,
    y: pad + (1 - d.value / max) * (height - pad * 2),
  }));
  let line = '';
  pts.forEach((p, i) => {
    if (i === 0) line = `M${p.x} ${p.y}`;
    else {
      const prev = pts[i - 1]!;
      const cx = (prev.x + p.x) / 2;
      line += ` C${cx} ${prev.y} ${cx} ${p.y} ${p.x} ${p.y}`;
    }
  });
  const area = pts.length ? `${line} L${width} ${height} L0 ${height} Z` : '';
  const labels = [0, 3, 6, 9, data.length - 1].filter((i) => i < data.length);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onLayout={onLayout}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Path d={area} fill={colors.primaryTint} opacity={0.6} />
          <Path
            d={line}
            stroke={colors.primaryStrong}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        {labels.map((i) => (
          <Text key={i} variant="caption" tone="muted">
            {data[i]?.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const DONUT_COLORS = [palette.teal800, palette.amber, '#3B82F6', '#7C3AED', '#22A06B', '#EA580C'];

/** Category donut with a centre label and a legend. */
export function DonutChart({
  slices,
  size = 116,
  centerLabel,
  centerValue,
  formatValue,
}: {
  slices: { label: string; value: number }[];
  size?: number;
  centerLabel: string;
  centerValue: string;
  formatValue: (v: number) => string;
}) {
  const { colors } = useTheme();
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const lengths = slices.map((s) => (s.value / total) * c);
  const offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${centerValue} ${centerLabel}`}
        style={{ width: size, height: size }}
      >
        <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.line}
            strokeWidth={stroke}
            fill="none"
          />
          {slices.map((s, i) => {
            const len = lengths[i]!;
            return (
              <Circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offsets[i]!}
              />
            );
          })}
        </Svg>
        <View
          style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text variant="section">{centerValue}</Text>
          <Text
            variant="caption"
            tone="muted"
            numberOfLines={1}
            style={{ maxWidth: size - stroke * 2 }}
          >
            {centerLabel}
          </Text>
        </View>
      </View>
      <View style={{ flex: 1, gap: 10 }}>
        {slices.map((s, i) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length],
              }}
            />
            <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>
              {s.label}
            </Text>
            <Text variant="smallStrong">{formatValue(s.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
