import {
  BadgeDollarSign,
  Building2,
  Cloud,
  Cpu,
  Globe,
  House,
  Lightbulb,
  Megaphone,
  Package,
  Server,
  Share2,
  ShieldCheck,
  Sparkles,
  Tag,
  Wifi,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * Category badge styles. Each icon key gets its own colourful rounded badge
 * (hosting = teal server, domain = blue globe, internet = purple wifi, rent = amber house).
 * `fg` is used for the icon on `bgLight` / `bgDark`.
 */
export interface CategoryVisual {
  icon: LucideIcon;
  fgLight: string;
  bgLight: string;
  fgDark: string;
  bgDark: string;
}

const visuals = {
  server: {
    icon: Server,
    fgLight: '#0F5C5C',
    bgLight: '#DFF1EF',
    fgDark: '#5CC4BC',
    bgDark: '#1B3C3A',
  },
  cloud: {
    icon: Cloud,
    fgLight: '#0F5C5C',
    bgLight: '#EDF7F6',
    fgDark: '#5CC4BC',
    bgDark: '#17302F',
  },
  globe: {
    icon: Globe,
    fgLight: '#256CD5',
    bgLight: '#E8F1FF',
    fgDark: '#7FB0FF',
    bgDark: '#182C47',
  },
  wifi: {
    icon: Wifi,
    fgLight: '#6D36CC',
    bgLight: '#F0EAFF',
    fgDark: '#B497FF',
    bgDark: '#2A2045',
  },
  house: {
    icon: House,
    fgLight: '#A85C00',
    bgLight: '#FFF2DC',
    fgDark: '#F5B556',
    bgDark: '#3B2C17',
  },
  cpu: { icon: Cpu, fgLight: '#147070', bgLight: '#E4F5EE', fgDark: '#4CC78F', bgDark: '#15352A' },
  building: {
    icon: Building2,
    fgLight: '#475569',
    bgLight: '#EEF2F6',
    fgDark: '#CBD5E1',
    bgDark: '#243040',
  },
  shield: {
    icon: ShieldCheck,
    fgLight: '#168258',
    bgLight: '#E4F5EE',
    fgDark: '#4CC78F',
    bgDark: '#15352A',
  },
  megaphone: {
    icon: Megaphone,
    fgLight: '#C7450A',
    bgLight: '#FFEADF',
    fgDark: '#FF8F5A',
    bgDark: '#3D2416',
  },
  bulb: {
    icon: Lightbulb,
    fgLight: '#A85C00',
    bgLight: '#FFF0D5',
    fgDark: '#F5B556',
    bgDark: '#3B2C17',
  },
  sparkles: {
    icon: Sparkles,
    fgLight: '#A85C00',
    bgLight: '#FFF2DC',
    fgDark: '#F5B556',
    bgDark: '#3B2C17',
  },
  money: {
    icon: BadgeDollarSign,
    fgLight: '#168258',
    bgLight: '#E4F5EE',
    fgDark: '#4CC78F',
    bgDark: '#15352A',
  },
  package: {
    icon: Package,
    fgLight: '#6D36CC',
    bgLight: '#F0EAFF',
    fgDark: '#B497FF',
    bgDark: '#2A2045',
  },
  share: {
    icon: Share2,
    fgLight: '#BE185D',
    bgLight: '#FCE7F3',
    fgDark: '#F9A8D4',
    bgDark: '#3D1A2E',
  },
  tag: { icon: Tag, fgLight: '#667373', bgLight: '#EEF1F1', fgDark: '#A5B2B1', bgDark: '#243030' },
} satisfies Record<string, CategoryVisual>;

export type CategoryIconKey = keyof typeof visuals;

export const CATEGORY_ICON_KEYS = Object.keys(visuals) as CategoryIconKey[];

export function categoryVisual(key: string): CategoryVisual {
  return key in visuals ? visuals[key as CategoryIconKey] : visuals.tag;
}

/** Icon keys for the seeded default categories (backend seeds the same keys). */
export const DEFAULT_CATEGORY_ICONS: Record<string, CategoryIconKey> = {
  'Technology & software': 'cpu',
  'Hosting & domains': 'server',
  'Communication & internet': 'wifi',
  'Social media': 'share',
  'Office & rent': 'house',
  Insurance: 'shield',
  Marketing: 'megaphone',
  Utilities: 'bulb',
  Other: 'tag',
};
