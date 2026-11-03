import { formatUSD, type FormatUSDOptions } from '@/lib/money';
import type { TypographyVariant } from '@/theme';

import { Text, type TextProps } from './Text';

export interface AmountTextProps extends Omit<TextProps, 'children'> {
  /** US dollars in integer cents. */
  amountCents: number;
  variant?: TypographyVariant;
  options?: FormatUSDOptions;
}

/** Formats integer cents as US dollars: "$1,234.56". */
export function AmountText({ amountCents, variant = 'bodyStrong', options, ...rest }: AmountTextProps) {
  const text = formatUSD(amountCents, options);
  return (
    <Text variant={variant} accessibilityLabel={text} {...rest}>
      {text}
    </Text>
  );
}
