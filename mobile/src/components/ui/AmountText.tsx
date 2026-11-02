import { formatMoney, type FormatMoneyOptions } from '@/lib/money';
import type { TypographyVariant } from '@/theme';

import { Text, type TextProps } from './Text';

export interface AmountTextProps extends Omit<TextProps, 'children'> {
  amountMinor: number;
  currency: string;
  variant?: TypographyVariant;
  options?: FormatMoneyOptions;
}

/** Formats integer minor units for the given ISO 4217 currency ("$1,523", "18,880 RWF"). */
export function AmountText({
  amountMinor,
  currency,
  variant = 'bodyStrong',
  options,
  ...rest
}: AmountTextProps) {
  const text = formatMoney(amountMinor, currency, options);
  return (
    <Text variant={variant} accessibilityLabel={text} {...rest}>
      {text}
    </Text>
  );
}
