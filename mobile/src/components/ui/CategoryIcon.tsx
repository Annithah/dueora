import { View } from 'react-native';

import { categoryVisual, useTheme } from '@/theme';

export interface CategoryIconProps {
  /** Icon key from the category (e.g. "server", "globe", "wifi", "house"). */
  icon: string;
  size?: number;
  /** Optional custom colour (custom categories); used as icon colour on a 14% tint. */
  color?: string | null;
}

/** Colourful rounded badge for a category. */
export function CategoryIcon({ icon, size = 42, color }: CategoryIconProps) {
  const { scheme } = useTheme();
  const v = categoryVisual(icon);
  const Icon = v.icon;
  const fg = color ?? (scheme === 'dark' ? v.fgDark : v.fgLight);
  const bg = color ? `${color}24` : scheme === 'dark' ? v.bgDark : v.bgLight;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.31),
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={Math.round(size * 0.48)} color={fg} strokeWidth={2} />
    </View>
  );
}
