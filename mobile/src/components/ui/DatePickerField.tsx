import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { formatDate, parseISODate, toISODate, type ISODate } from '@/lib/dates';
import { radius, useTheme } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Text } from './Text';

export interface DatePickerFieldProps {
  label?: string;
  value: ISODate | null | undefined;
  onChange: (value: ISODate) => void;
  placeholder?: string;
  error?: string;
  minimumDate?: ISODate;
  maximumDate?: ISODate;
}

/** Date-only field. Android uses the native dialog; iOS shows an inline calendar in a sheet. */
export function DatePickerField({
  label,
  value,
  onChange,
  placeholder = 'Select a date',
  error,
  minimumDate,
  maximumDate,
}: DatePickerFieldProps) {
  const { colors, scheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => (value ? parseISODate(value) : new Date()));

  const pickerProps = {
    value: draft,
    mode: 'date' as const,
    minimumDate: minimumDate ? parseISODate(minimumDate) : undefined,
    maximumDate: maximumDate ? parseISODate(maximumDate) : undefined,
  };

  const openPicker = () => {
    setDraft(value ? parseISODate(value) : new Date());
    setOpen(true);
  };

  const onAndroidChange = (event: DateTimePickerEvent, date?: Date) => {
    setOpen(false);
    if (event.type === 'set' && date) onChange(toISODate(date));
  };

  return (
    <View style={{ gap: 8, flex: 1 }}>
      {label ? <Text variant="label">{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Date'}: ${value ? formatDate(value) : placeholder}`}
        accessibilityHint="Opens a date picker"
        onPress={openPicker}
        style={({ pressed }) => ({
          minHeight: 48,
          borderRadius: radius.input,
          borderWidth: 1,
          borderColor: error ? colors.red : colors.line,
          backgroundColor: colors.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <CalendarDays size={18} color={colors.muted} />
        <Text variant="body" tone={value ? 'ink' : 'muted'} numberOfLines={1}>
          {value ? formatDate(value) : placeholder}
        </Text>
      </Pressable>
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : null}

      {open && Platform.OS === 'android' ? (
        <DateTimePicker {...pickerProps} onChange={onAndroidChange} />
      ) : null}

      {Platform.OS !== 'android' ? (
        <BottomSheet
          visible={open}
          onClose={() => setOpen(false)}
          title={label ?? 'Select a date'}
          scrollable={false}
        >
          <DateTimePicker
            {...pickerProps}
            display="inline"
            themeVariant={scheme}
            accentColor={colors.primary}
            onChange={(_e, date) => date && setDraft(date)}
          />
          <Button
            full
            onPress={() => {
              onChange(toISODate(draft));
              setOpen(false);
            }}
          >
            Done
          </Button>
        </BottomSheet>
      ) : null}
    </View>
  );
}
