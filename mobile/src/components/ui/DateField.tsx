import { ScrollView, View } from 'react-native';

import type { ISODate } from '@/lib/dates';
import { DATE_QUICK_PICKS } from '@/lib/schedule';

import { Chip } from './Chip';
import { DatePickerField, type DatePickerFieldProps } from './DatePickerField';
import { Text } from './Text';

export interface DateFieldProps extends DatePickerFieldProps {
  /** "Today" in the workspace timezone; quick picks are relative to it. */
  today: ISODate;
  /** Hide the quick-pick chips (e.g. for date-range filters). */
  quickPicks?: boolean;
  /** Small helper line under the field (e.g. "Calculated from the start date"). */
  hint?: string;
}

/** Date field with quick-pick chips: Today, +1 week, +1 month, +3 months, +1 year. */
export function DateField({ today, quickPicks = true, hint, ...field }: DateFieldProps) {
  return (
    <View style={{ gap: 8 }}>
      <DatePickerField {...field} />
      {hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
      {quickPicks ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {DATE_QUICK_PICKS.map((p) => {
            const date = p.apply(today);
            const disabled = (field.minimumDate && date < field.minimumDate) || (field.maximumDate && date > field.maximumDate);
            return (
              <Chip
                key={p.key}
                label={p.label}
                selected={field.value === date}
                disabled={!!disabled}
                accessibilityHint={`Sets ${field.label ?? 'the date'} to ${date}`}
                onPress={() => field.onChange(date)}
                style={{ opacity: disabled ? 0.4 : 1 }}
              />
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
