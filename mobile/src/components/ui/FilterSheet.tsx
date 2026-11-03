import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { formatDate, type ISODate } from '@/lib/dates';
import { radius, spacing, useTheme } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Chip } from './Chip';
import { DatePickerField } from './DatePickerField';
import { Text } from './Text';

/** One group of multi-select chips (status, company, category, frequency...). */
export interface ChipSection {
  key: string;
  title: string;
  options: readonly { value: string; label: string }[];
}

export interface FilterState {
  /** Selected values per chip section key. */
  selections: Record<string, string[]>;
  from?: ISODate;
  to?: ISODate;
}

export const EMPTY_FILTERS: FilterState = { selections: {} };

export function countFilters(f: FilterState): number {
  return Object.values(f.selections).reduce((n, v) => n + v.length, 0) + (f.from || f.to ? 1 : 0);
}

export interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  sections: readonly ChipSection[];
  /** Title for the date-range block; omit to hide it. */
  dateRangeTitle?: string;
  value: FilterState;
  onApply: (value: FilterState) => void;
}

/** Bottom sheet with chip groups and an optional date range; changes apply on "Show results". */
export function FilterSheet({ visible, onClose, sections, dateRangeTitle, value, onApply }: FilterSheetProps) {
  const [draft, setDraft] = useState<FilterState>(value);
  // Start from the applied filters each time the sheet opens.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(value);
  }

  const toggle = (key: string, v: string) =>
    setDraft((d) => {
      const current = d.selections[key] ?? [];
      const next = current.includes(v) ? current.filter((x) => x !== v) : [...current, v];
      return { ...d, selections: { ...d.selections, [key]: next } };
    });

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filter">
      <View style={{ gap: 20 }}>
        {sections.map((s) =>
          s.options.length === 0 ? null : (
            <View key={s.key} style={{ gap: 10 }}>
              <Text variant="label">{s.title}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {s.options.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    showCheck
                    selected={(draft.selections[s.key] ?? []).includes(o.value)}
                    onPress={() => toggle(s.key, o.value)}
                  />
                ))}
              </View>
            </View>
          ),
        )}
        {dateRangeTitle ? (
          <View style={{ gap: 10 }}>
            <Text variant="label">{dateRangeTitle}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <DatePickerField
                label="From"
                value={draft.from}
                placeholder="Any"
                maximumDate={draft.to}
                onChange={(from) => setDraft((d) => ({ ...d, from }))}
              />
              <DatePickerField
                label="To"
                value={draft.to}
                placeholder="Any"
                minimumDate={draft.from}
                onChange={(to) => setDraft((d) => ({ ...d, to }))}
              />
            </View>
            {draft.from || draft.to ? (
              <Pressable accessibilityRole="button" onPress={() => setDraft((d) => ({ ...d, from: undefined, to: undefined }))}>
                <Text variant="smallStrong" tone="primary">
                  Clear dates
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10, paddingTop: 4 }}>
          <Button variant="secondary" style={{ flex: 1 }} onPress={() => setDraft(EMPTY_FILTERS)}>
            Reset
          </Button>
          <Button
            style={{ flex: 2 }}
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          >
            Show results
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}

export interface ActiveFiltersProps {
  sections: readonly ChipSection[];
  value: FilterState;
  onChange: (value: FilterState) => void;
}

/** Removable chips for every active filter, shown under the search bar. */
export function ActiveFilters({ sections, value, onChange }: ActiveFiltersProps) {
  const { colors } = useTheme();
  const chips: { id: string; label: string; remove: () => void }[] = [];
  for (const s of sections) {
    for (const v of value.selections[s.key] ?? []) {
      const label = s.options.find((o) => o.value === v)?.label ?? v;
      chips.push({
        id: `${s.key}:${v}`,
        label,
        remove: () =>
          onChange({ ...value, selections: { ...value.selections, [s.key]: (value.selections[s.key] ?? []).filter((x) => x !== v) } }),
      });
    }
  }
  if (value.from || value.to) {
    const label = value.from && value.to ? `${formatDate(value.from)} – ${formatDate(value.to)}` : value.from ? `From ${formatDate(value.from)}` : `Until ${formatDate(value.to!)}`;
    chips.push({ id: 'dates', label, remove: () => onChange({ ...value, from: undefined, to: undefined }) });
  }
  if (chips.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -spacing.screen }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.screen }}
    >
      {chips.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`Remove filter ${c.label}`}
          onPress={c.remove}
          style={({ pressed }) => ({
            minHeight: 36,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingLeft: 14,
            paddingRight: 10,
            borderRadius: radius.pill,
            backgroundColor: colors.primarySoft,
            borderWidth: 1,
            borderColor: colors.primaryTint,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text variant="smallStrong" tone="primary">
            {c.label}
          </Text>
          <X size={14} color={colors.primaryStrong} />
        </Pressable>
      ))}
      {chips.length > 1 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(EMPTY_FILTERS)}
          style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 6 }}
        >
          <Text variant="smallStrong" tone="muted">
            Clear all
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
