/**
 * DueOra design tokens — the single source of truth for colour, spacing, radius,
 * elevation and typography. Values follow the Figma prototype (design/prototype-styles.css)
 * and the brand brief. See DECISIONS.md D5 for the two-tone status colours.
 */

export const palette = {
  teal950: '#093F3F',
  teal800: '#0F5C5C', // primary
  teal700: '#147070',
  teal100: '#DFF1EF',
  teal50: '#EDF7F6',
  amber: '#F2A33A', // accent
  amberSoft: '#FFF2DC',
  white: '#FFFFFF',
  black: '#000000',
} as const;

/** Brand status colours (dots, icons, charts). */
export const statusBrand = {
  paid: '#22A06B',
  upcoming: '#3B82F6',
  dueSoon: '#F59E0B',
  dueToday: '#EA580C',
  overdue: '#DC2626',
  partiallyPaid: '#7C3AED',
} as const;

export interface ColorScheme {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  ink: string;
  muted: string;
  placeholder: string;
  line: string;
  dashed: string;
  primary: string;
  primaryStrong: string;
  onPrimary: string;
  primarySoft: string;
  primaryTint: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  switchOff: string;
  scrim: string;
  /** Text-on-soft-background status tones (≥ 4.5:1) and their soft backgrounds. */
  green: string;
  greenSoft: string;
  blue: string;
  blueSoft: string;
  amberText: string;
  amberTextSoft: string;
  orange: string;
  orangeSoft: string;
  red: string;
  redSoft: string;
  purple: string;
  purpleSoft: string;
  /** Solid count badge (unread alerts) and the text on it. */
  badge: string;
  onBadge: string;
  shadow: string;
}

export const lightColors: ColorScheme = {
  canvas: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  ink: '#172121',
  muted: '#667373',
  placeholder: '#7D8989',
  line: '#E7EBEB',
  dashed: '#AEBABA',
  primary: palette.teal800,
  primaryStrong: palette.teal700,
  onPrimary: palette.white,
  primarySoft: palette.teal50,
  primaryTint: palette.teal100,
  accent: palette.amber,
  accentSoft: palette.amberSoft,
  onAccent: '#583600',
  switchOff: '#C5CECD',
  scrim: 'rgba(8, 25, 25, 0.55)',
  green: '#157A53',
  greenSoft: '#E4F5EE',
  blue: '#2469CF',
  blueSoft: '#E8F1FF',
  amberText: '#A35900',
  amberTextSoft: '#FFF0D5',
  orange: '#BB4109',
  orangeSoft: '#FFEADF',
  red: '#C82020',
  redSoft: '#FFE8E7',
  purple: '#6D36CC',
  purpleSoft: '#F0EAFF',
  badge: '#C82020',
  onBadge: palette.white,
  shadow: '#143131',
};

export const darkColors: ColorScheme = {
  canvas: '#0E1414',
  surface: '#172121',
  surfaceRaised: '#1C2828',
  ink: '#EDF5F4',
  muted: '#A5B2B1',
  placeholder: '#7F8C8B',
  line: '#2A3737',
  dashed: '#3D4D4D',
  // Teal-800 on near-black is too dark for text, so interactive teal lifts in dark mode.
  primary: '#1C7A78',
  primaryStrong: '#5CC4BC',
  onPrimary: palette.white,
  primarySoft: '#17302F',
  primaryTint: '#1B3C3A',
  accent: palette.amber,
  accentSoft: '#3B2C17',
  onAccent: '#2B1A00',
  switchOff: '#3D4D4D',
  scrim: 'rgba(0, 0, 0, 0.6)',
  green: '#4CC78F',
  greenSoft: '#15352A',
  blue: '#7FB0FF',
  blueSoft: '#182C47',
  amberText: '#F5B556',
  amberTextSoft: '#3B2C17',
  orange: '#FF8F5A',
  orangeSoft: '#3D2416',
  red: '#FF7A72',
  redSoft: '#3A1F1F',
  purple: '#B497FF',
  purpleSoft: '#2A2045',
  badge: '#D33A3A',
  onBadge: palette.white,
  shadow: '#000000',
};

/** 8pt grid. `space(2)` → 16. */
export const space = (units: number): number => units * 8;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  screen: 20, // horizontal screen padding
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  input: 13,
  md: 14,
  card: 16,
  lg: 20,
  sheet: 26,
  pill: 999,
} as const;

/** Minimum touch target (WCAG / HIG). */
export const HIT_SIZE = 44;

export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

/**
 * Type scale. The prototype's hierarchy is kept, but nothing goes below 11px
 * (DECISIONS.md D5).
 */
export const typography = {
  display: { fontFamily: fontFamily.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.8 },
  pageTitle: {
    fontFamily: fontFamily.extrabold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.6,
  },
  amountXL: { fontFamily: fontFamily.extrabold, fontSize: 32, lineHeight: 38, letterSpacing: -1 },
  title: { fontFamily: fontFamily.extrabold, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  section: { fontFamily: fontFamily.bold, fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  bodyStrong: { fontFamily: fontFamily.bold, fontSize: 14, lineHeight: 20 },
  body: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 21 },
  label: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 18 },
  small: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 17 },
  smallStrong: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 17 },
  caption: { fontFamily: fontFamily.medium, fontSize: 11, lineHeight: 15 },
  captionStrong: { fontFamily: fontFamily.extrabold, fontSize: 11, lineHeight: 15 },
  eyebrow: { fontFamily: fontFamily.extrabold, fontSize: 11, lineHeight: 15, letterSpacing: 1.2 },
} as const;

export type TypographyVariant = keyof typeof typography;

export const elevation = {
  soft: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  raised: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  primary: {
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 6,
  },
} as const;

export const motion = {
  fast: 150,
  base: 220,
  slow: 360,
} as const;
