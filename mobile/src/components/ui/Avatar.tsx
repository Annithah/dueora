import { Image, View } from 'react-native';

import { fontFamily } from '@/theme';

import { Text } from './Text';

/** Teal, blue, purple, amber, green, orange — readable with white initials. */
const AVATAR_COLORS = ['#0F5C5C', '#256CD5', '#6D36CC', '#A85C00', '#168258', '#C7450A'];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return (first + last).toUpperCase();
}

/** Stable colour per name so a teammate always gets the same avatar. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

export interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: number;
  /** Override the generated colour (e.g. workspace avatars use brand teal). */
  color?: string;
}

export function Avatar({ name, imageUrl, size = 42, color }: AvatarProps) {
  const radius = Math.round(size / 3);
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        accessibilityLabel={name}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: color ?? avatarColor(name),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        color="#FFFFFF"
        style={{ fontFamily: fontFamily.extrabold, fontSize: Math.max(11, Math.round(size * 0.3)) }}
        allowFontScaling={false}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}
