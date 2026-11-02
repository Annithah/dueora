import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { fontFamily, palette, useTheme } from '@/theme';

import { Text } from './Text';

export interface LogoProps {
  /** Mark size in px; the wordmark scales with it. */
  size?: number;
  /** White version for teal backgrounds (splash). */
  inverse?: boolean;
  /** Mark only, no "DueOra" wordmark. */
  markOnly?: boolean;
}

/** DueOra brand mark: an open ring with an amber check and dot. */
export function Logo({ size = 44, inverse = false, markOnly = false }: LogoProps) {
  const { colors } = useTheme();
  const ink = inverse ? '#FFFFFF' : colors.primaryStrong;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="DueOra"
      style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.18 }}
    >
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Path
          d="M37 30.5A15 15 0 1 1 36.5 17"
          stroke={ink}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="m18 24 5 5 9-10"
          stroke={palette.amber}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Circle cx={37} cy={10} r={3.5} fill={palette.amber} />
      </Svg>
      {markOnly ? null : (
        <Text
          color={ink}
          allowFontScaling={false}
          style={{
            fontFamily: fontFamily.bold,
            fontSize: size * 0.68,
            letterSpacing: -size * 0.034,
          }}
        >
          DueOra
        </Text>
      )}
    </View>
  );
}
