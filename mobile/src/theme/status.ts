import {
  CircleAlert,
  CircleCheck,
  CircleDollarSign,
  Clock3,
  Archive,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

import { statusBrand, type ColorScheme } from './tokens';

/** Mirrors the backend's computeStatus() result. */
export type PaymentStatus =
  'UPCOMING' | 'DUE_SOON' | 'DUE_TODAY' | 'OVERDUE' | 'PARTIALLY_PAID' | 'PAID' | 'ARCHIVED';

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'OVERDUE',
  'DUE_TODAY',
  'DUE_SOON',
  'PARTIALLY_PAID',
  'UPCOMING',
  'PAID',
  'ARCHIVED',
];

export interface StatusStyle {
  label: string;
  icon: LucideIcon;
  /** Brand colour for dots, chart marks and icons on neutral surfaces. */
  brand: string;
  /** Text/icon colour used on `soft`. */
  text: string;
  soft: string;
}

export function statusStyle(status: PaymentStatus, colors: ColorScheme): StatusStyle {
  switch (status) {
    case 'PAID':
      return {
        label: 'Paid',
        icon: CircleCheck,
        brand: statusBrand.paid,
        text: colors.green,
        soft: colors.greenSoft,
      };
    case 'UPCOMING':
      return {
        label: 'Upcoming',
        icon: Clock3,
        brand: statusBrand.upcoming,
        text: colors.blue,
        soft: colors.blueSoft,
      };
    case 'DUE_SOON':
      return {
        label: 'Due soon',
        icon: CircleAlert,
        brand: statusBrand.dueSoon,
        text: colors.amberText,
        soft: colors.amberTextSoft,
      };
    case 'DUE_TODAY':
      return {
        label: 'Due today',
        icon: Zap,
        brand: statusBrand.dueToday,
        text: colors.orange,
        soft: colors.orangeSoft,
      };
    case 'OVERDUE':
      return {
        label: 'Overdue',
        icon: CircleAlert,
        brand: statusBrand.overdue,
        text: colors.red,
        soft: colors.redSoft,
      };
    case 'PARTIALLY_PAID':
      return {
        label: 'Partially paid',
        icon: CircleDollarSign,
        brand: statusBrand.partiallyPaid,
        text: colors.purple,
        soft: colors.purpleSoft,
      };
    case 'ARCHIVED':
      return {
        label: 'Archived',
        icon: Archive,
        brand: colors.muted,
        text: colors.muted,
        soft: colors.line,
      };
  }
}
