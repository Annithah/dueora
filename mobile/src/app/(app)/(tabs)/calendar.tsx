import { addDays } from 'date-fns';
import { router } from 'expo-router';
import { ArrowLeft, ArrowRight, CalendarDays } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { monthShort } from '@/components/charts/Charts';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Screen } from '@/components/layout/Screen';
import { PaymentRow } from '@/components/payments/PaymentRow';
import { Card, IconButton, SectionHeader, Segmented, Skeleton, Text } from '@/components/ui';
import { useCalendar, type CalendarEvent } from '@/features/insights/api';
import {
  monthGrid,
  rangeFor,
  shift,
  titleFor,
  type CalendarView,
} from '@/features/insights/calendarMath';
import { formatDate, parseISODate, toISODate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { statusBrand, statusStyle, useTheme, type PaymentStatus } from '@/theme';

const DOT_ORDER: PaymentStatus[] = [
  'OVERDUE',
  'DUE_TODAY',
  'DUE_SOON',
  'PARTIALLY_PAID',
  'UPCOMING',
  'PAID',
];

function groupByDate(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) map.set(e.date, [...(map.get(e.date) ?? []), e]);
  return map;
}

function EventList({ events, emptyText }: { events: CalendarEvent[]; emptyText: string }) {
  const { colors } = useTheme();
  if (!events.length) {
    return (
      <View
        style={{
          minHeight: 96,
          borderRadius: 15,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.line,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
        }}
      >
        <CalendarDays size={24} color={colors.muted} />
        <Text variant="small" tone="muted">
          {emptyText}
        </Text>
      </View>
    );
  }
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      {events.map((e, i) => (
        <PaymentRow
          key={`${e.obligationId}-${e.date}-${e.kind}`}
          divider={i > 0}
          onPress={() => router.push(`/payments/${e.obligationId}`)}
          item={{
            id: e.obligationId,
            name: e.name,
            provider: e.provider,
            icon: e.icon,
            amountMinor: e.amountMinor,
            currency: e.currency,
            date: e.date,
            status: e.status,
            subtitle: e.platform ? `${e.platform} · ${e.provider}` : e.provider,
          }}
        />
      ))}
    </Card>
  );
}

function MonthGrid({
  focus,
  selected,
  onSelect,
  byDate,
  today,
}: {
  focus: string;
  selected: string;
  onSelect: (d: string) => void;
  byDate: Map<string, CalendarEvent[]>;
  today: string;
}) {
  const { colors } = useTheme();
  const month = focus.slice(0, 7);
  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text
            key={i}
            variant="captionStrong"
            tone="muted"
            align="center"
            style={{ flex: 1, paddingVertical: 8 }}
          >
            {d}
          </Text>
        ))}
      </View>
      {monthGrid(focus).map((row) => (
        <View key={row[0]} style={{ flexDirection: 'row' }}>
          {row.map((date) => {
            const events = byDate.get(date) ?? [];
            const statuses = DOT_ORDER.filter((s) => events.some((e) => e.status === s)).slice(
              0,
              3,
            );
            const isSelected = date === selected;
            const outside = date.slice(0, 7) !== month;
            const label = `${formatDate(date)}${events.length ? `, ${events.length} payment${events.length > 1 ? 's' : ''}` : ''}`;
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelect(date)}
                style={{
                  flex: 1,
                  height: 46,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  opacity: outside ? 0.35 : 1,
                }}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isSelected ? colors.primary : 'transparent',
                    borderWidth: date === today && !isSelected ? 1 : 0,
                    borderColor: colors.primaryStrong,
                  }}
                >
                  <Text
                    variant={isSelected ? 'smallStrong' : 'small'}
                    color={isSelected ? colors.onPrimary : undefined}
                  >
                    {Number(date.slice(8))}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 2, height: 5 }}>
                  {statuses.map((s) => (
                    <View
                      key={s}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: statusStyle(s, colors).brand,
                      }}
                    />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function CalendarTab() {
  const { colors } = useTheme();
  const todayIso = toISODate(new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [focus, setFocus] = useState(todayIso);
  const [selected, setSelected] = useState(todayIso);
  const { from, to } = rangeFor(view, focus);
  const query = useCalendar(from, to);
  const events = useMemo(() => query.data?.events ?? [], [query.data]);
  const byDate = useMemo(() => groupByDate(events), [events]);

  const move = (step: number) => {
    const next = shift(view, focus, step);
    setFocus(next);
    if (view !== 'month') setSelected(next);
  };

  const legend: [string, string][] = [
    ['Overdue', statusBrand.overdue],
    ['Due soon', statusBrand.dueSoon],
    ['Upcoming', statusBrand.upcoming],
    ['Paid', statusBrand.paid],
  ];

  return (
    <Screen edges={['top']} contentStyle={{ gap: 18, paddingBottom: 32 }}>
      <PageHeader eyebrow="Plan ahead" title="Calendar" />
      <Segmented
        accessibilityLabel="Calendar view"
        value={view}
        onChange={(v) => {
          setView(v);
          setFocus(selected);
        }}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
      />
      <OfflineBanner />
      <Card padding={12}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 48,
          }}
        >
          <IconButton accessibilityLabel="Previous" onPress={() => move(-1)}>
            <ArrowLeft size={18} color={colors.ink} />
          </IconButton>
          <Text variant="bodyStrong" accessibilityRole="header" accessibilityLiveRegion="polite">
            {titleFor(view, focus)}
          </Text>
          <IconButton accessibilityLabel="Next" onPress={() => move(1)}>
            <ArrowRight size={18} color={colors.ink} />
          </IconButton>
        </View>

        {!query.data ? (
          <Skeleton height={view === 'month' ? 260 : 120} radius={12} />
        ) : view === 'month' ? (
          <MonthGrid
            focus={focus}
            selected={selected}
            onSelect={setSelected}
            byDate={byDate}
            today={todayIso}
          />
        ) : view === 'week' ? (
          <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
            {Array.from({ length: 7 }, (_, i) => {
              const date = toISODate(addDays(parseISODate(from), i));
              const n = byDate.get(date)?.length ?? 0;
              const isSel = date === selected;
              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDate(date)}, ${n} payments`}
                  onPress={() => setSelected(date)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    gap: 4,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: isSel ? colors.primary : 'transparent',
                  }}
                >
                  <Text variant="captionStrong" color={isSel ? colors.onPrimary : colors.muted}>
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
                  </Text>
                  <Text variant="bodyStrong" color={isSel ? colors.onPrimary : undefined}>
                    {Number(date.slice(8))}
                  </Text>
                  <Text variant="caption" color={isSel ? colors.onPrimary : colors.muted}>
                    {n ? `${n}` : '·'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : view === 'year' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
            {Array.from({ length: 12 }, (_, i) => {
              const key = `${focus.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`;
              const monthEvents = events.filter((e) => e.date.startsWith(key));
              const overdue = monthEvents.some((e) => e.status === 'OVERDUE');
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${monthShort(key)}: ${monthEvents.length} payments`}
                  onPress={() => {
                    setView('month');
                    setFocus(`${key}-01`);
                    setSelected(`${key}-01`);
                  }}
                  style={{ width: '33.33%', padding: 4 }}
                >
                  <View
                    style={{
                      minHeight: 70,
                      borderRadius: 12,
                      padding: 10,
                      gap: 4,
                      backgroundColor:
                        key === todayIso.slice(0, 7) ? colors.primarySoft : colors.canvas,
                    }}
                  >
                    <Text variant="smallStrong">{monthShort(key)}</Text>
                    <Text variant="caption" tone="muted">
                      {monthEvents.length} due
                    </Text>
                    {overdue ? (
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: statusBrand.overdue,
                        }}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {view === 'month' ? (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: 14,
              marginTop: 6,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: colors.line,
            }}
          >
            {legend.map(([label, color]) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                <Text variant="caption" tone="muted">
                  {label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {view === 'year' ? (
        <View>
          <SectionHeader title={`Total due in ${focus.slice(0, 4)}`} />
          <Text variant="small" tone="muted">
            {events.length} payments ·{' '}
            {[...new Set(events.map((e) => e.currency))]
              .map((c) =>
                formatMoney(
                  events.filter((e) => e.currency === c).reduce((s, e) => s + e.amountMinor, 0),
                  c,
                  { compact: true },
                ),
              )
              .join(' + ') || 'nothing scheduled'}
          </Text>
        </View>
      ) : (
        <View>
          <SectionHeader
            title={
              view === 'week' || view === 'day' || view === 'month' ? formatDate(selected) : ''
            }
            action={`${byDate.get(selected)?.length ?? 0} payment${(byDate.get(selected)?.length ?? 0) === 1 ? '' : 's'}`}
          />
          <EventList events={byDate.get(selected) ?? []} emptyText="Nothing due on this day" />
        </View>
      )}
    </Screen>
  );
}
