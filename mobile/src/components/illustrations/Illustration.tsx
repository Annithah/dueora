import {
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CircleAlert,
  CloudOff,
  PartyPopper,
  Plus,
  ReceiptText,
  Search,
  UsersRound,
  type LucideIcon,
} from 'lucide-react-native';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { palette, useTheme } from '@/theme';

export type IllustrationName =
  | 'add'
  | 'remind'
  | 'track'
  | 'empty-bills'
  | 'all-caught-up'
  | 'empty-calendar'
  | 'no-results'
  | 'offline'
  | 'error'
  | 'notifications'
  | 'team';

interface Scene {
  icon: LucideIcon;
  /** Badge in the card's corner. */
  badge: 'check' | 'alert' | 'none';
  /** Optional decoration drawn behind/around the card. */
  decoration?: 'confetti' | 'waves' | 'sparkle' | 'dots';
  tone: 'teal' | 'amber' | 'red';
}

const SCENES: Record<IllustrationName, Scene> = {
  add: { icon: Plus, badge: 'check', tone: 'teal', decoration: 'sparkle' },
  remind: { icon: Bell, badge: 'check', tone: 'teal', decoration: 'waves' },
  track: { icon: BarChart3, badge: 'check', tone: 'teal', decoration: 'dots' },
  'empty-bills': { icon: ReceiptText, badge: 'check', tone: 'teal' },
  'all-caught-up': { icon: PartyPopper, badge: 'check', tone: 'teal', decoration: 'confetti' },
  'empty-calendar': { icon: CalendarDays, badge: 'none', tone: 'teal', decoration: 'dots' },
  'no-results': { icon: Search, badge: 'none', tone: 'teal' },
  offline: { icon: CloudOff, badge: 'alert', tone: 'amber' },
  error: { icon: CircleAlert, badge: 'alert', tone: 'red' },
  notifications: { icon: Bell, badge: 'check', tone: 'teal', decoration: 'waves' },
  team: { icon: UsersRound, badge: 'check', tone: 'teal', decoration: 'sparkle' },
};

export interface IllustrationProps {
  name: IllustrationName;
  /** Overall height; width scales with it. Default 220 (onboarding); empty states use ~160. */
  size?: number;
}

const CONFETTI: [number, number, number, string][] = [
  [30, 40, 0, '#F2A33A'],
  [208, 52, 30, '#3B82F6'],
  [40, 160, -20, '#7C3AED'],
  [214, 150, 15, '#22A06B'],
  [120, 18, 45, '#DC2626'],
  [70, 196, 60, '#F2A33A'],
  [180, 196, -40, '#0F5C5C'],
];

/** Original, brand-coloured scene: soft orbs, a tilted card with an icon tile, and a badge. */
export function Illustration({ name, size = 220 }: IllustrationProps) {
  const { colors, scheme } = useTheme();
  const scene = SCENES[name];
  const Icon = scene.icon;
  const s = size / 220; // design grid is 240×220
  const width = 240 * s;

  const tileBg =
    scene.tone === 'amber'
      ? colors.accentSoft
      : scene.tone === 'red'
        ? colors.redSoft
        : colors.primaryTint;
  const tileFg =
    scene.tone === 'amber' ? colors.amberText : scene.tone === 'red' ? colors.red : colors.primary;
  const lineMuted = colors.line;
  const lineAccent = scheme === 'dark' ? '#4A3A20' : palette.amberSoft;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Background orbs + decorations */}
      <Svg width={width} height={size} viewBox="0 0 240 220" style={{ position: 'absolute' }}>
        <Circle cx={120} cy={110} r={80} fill={colors.primarySoft} />
        <Circle cx={188} cy={52} r={27} fill={colors.accentSoft} />
        {scene.decoration === 'confetti'
          ? CONFETTI.map(([x, y, rot, fill], i) => (
              <Rect
                key={i}
                x={x}
                y={y}
                width={10}
                height={5}
                rx={2}
                fill={fill}
                transform={`rotate(${rot} ${x + 5} ${y + 2.5})`}
              />
            ))
          : null}
        {scene.decoration === 'waves' ? (
          <>
            <Path
              d="M30 86 a40 40 0 0 1 0 48"
              stroke={colors.primaryStrong}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
              opacity={0.35}
            />
            <Path
              d="M16 74 a56 56 0 0 1 0 72"
              stroke={colors.primaryStrong}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
              opacity={0.2}
            />
            <Path
              d="M210 86 a40 40 0 0 0 0 48"
              stroke={colors.primaryStrong}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
              opacity={0.35}
            />
            <Path
              d="M224 74 a56 56 0 0 0 0 72"
              stroke={colors.primaryStrong}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
              opacity={0.2}
            />
          </>
        ) : null}
        {scene.decoration === 'sparkle' ? (
          <>
            <Path
              d="M44 54 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4z"
              fill={palette.amber}
            />
            <Path
              d="M206 168 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3z"
              fill={colors.primaryStrong}
              opacity={0.6}
            />
          </>
        ) : null}
        {scene.decoration === 'dots' ? (
          <>
            <Circle cx={36} cy={70} r={5} fill={palette.amber} />
            <Circle cx={52} cy={176} r={4} fill={colors.primaryStrong} opacity={0.5} />
            <Circle cx={212} cy={160} r={6} fill="#3B82F6" opacity={0.6} />
          </>
        ) : null}
      </Svg>

      {/* Tilted card */}
      <View
        style={{
          width: 178 * s,
          height: 132 * s,
          borderRadius: 25 * s,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.line,
          padding: 24 * s,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 15 * s,
          transform: [{ rotate: '-3deg' }],
          shadowColor: palette.teal800,
          shadowOpacity: 0.15,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 20 },
          elevation: 8,
        }}
      >
        <View
          style={{
            width: 58 * s,
            height: 58 * s,
            borderRadius: 18 * s,
            backgroundColor: tileBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={30 * s} color={tileFg} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, gap: 9 * s }}>
          <View style={{ height: 7 * s, borderRadius: 5, backgroundColor: lineMuted }} />
          <View
            style={{ height: 7 * s, width: '70%', borderRadius: 5, backgroundColor: lineAccent }}
          />
          <View style={{ height: 7 * s, borderRadius: 5, backgroundColor: lineMuted }} />
        </View>

        {scene.badge !== 'none' ? (
          <View
            style={{
              position: 'absolute',
              right: -12 * s,
              bottom: -12 * s,
              width: 36 * s,
              height: 36 * s,
              borderRadius: 18 * s,
              backgroundColor:
                scene.badge === 'alert' && scene.tone === 'red' ? colors.red : palette.amber,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: palette.amber,
              shadowOpacity: 0.3,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 8 },
              elevation: 4,
            }}
          >
            {scene.badge === 'check' ? (
              <Check size={16 * s} color={colors.onAccent} strokeWidth={3} />
            ) : (
              <CircleAlert
                size={16 * s}
                color={scene.tone === 'red' ? '#FFFFFF' : colors.onAccent}
                strokeWidth={2.5}
              />
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}
