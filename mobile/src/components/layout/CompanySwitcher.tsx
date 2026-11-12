import { Check, ChevronDown, Layers } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, BottomSheet, Text } from '@/components/ui';
import { useCompanies } from '@/features/catalog/api';
import { ROLE_LABELS } from '@/features/workspaces/api';
import { useSelectCompany, useSelectedCompanyId } from '@/state/companyFilter';
import { radius, useTheme } from '@/theme';

/**
 * The global company switcher (Home, Bills, Calendar, Reports): "All companies" or one
 * company, remembered on this device. Hidden when the user can see only one company.
 */
export function CompanySwitcher() {
  const { colors } = useTheme();
  const companies = useCompanies();
  const selectedId = useSelectedCompanyId();
  const select = useSelectCompany();
  const [open, setOpen] = useState(false);
  const list = companies.data ?? [];
  const selected = list.find((c) => c.id === selectedId);

  // A remembered company that was archived, or that the user lost access to, falls back to all.
  useEffect(() => {
    if (selectedId && companies.data && !selected) select(null);
  }, [selectedId, companies.data, selected, select]);

  if (list.length < 2) return null;

  const row = (key: string, active: boolean, onPress: () => void, leading: React.ReactNode, title: string, subtitle?: string) => (
    <Pressable
      key={key}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={title}
      onPress={() => {
        setOpen(false);
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        minHeight: 56,
        borderRadius: radius.sm,
        backgroundColor: active || pressed ? colors.primarySoft : 'transparent',
      })}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text variant="small" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {active ? <Check size={18} color={colors.primaryStrong} /> : null}
    </Pressable>
  );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Showing ${selected?.name ?? 'all companies'}. Change company`}
        onPress={() => setOpen(true)}
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          minHeight: 36,
          paddingHorizontal: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.surface,
        }}
      >
        {selected ? (
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: selected.color }} />
        ) : (
          <Layers size={15} color={colors.muted} />
        )}
        <Text variant="smallStrong" numberOfLines={1} style={{ maxWidth: 200 }}>
          {selected?.name ?? 'All companies'}
        </Text>
        <ChevronDown size={15} color={colors.muted} />
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Show bills for">
        {row(
          'all',
          !selected,
          () => select(null),
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }}>
            <Layers size={18} color={colors.primaryStrong} />
          </View>,
          'All companies',
          `${list.length} companies`,
        )}
        {list.map((c) =>
          row(
            c.id,
            c.id === selected?.id,
            () => select(c.id),
            <Avatar name={c.shortName || c.name} color={c.color} size={40} />,
            c.name,
            `${c.billCount} bill${c.billCount === 1 ? '' : 's'}${c.myRole ? ` · ${ROLE_LABELS[c.myRole]}` : ''}`,
          ),
        )}
      </BottomSheet>
    </>
  );
}
