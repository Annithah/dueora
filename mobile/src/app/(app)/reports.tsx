import { router } from 'expo-router';
import { ArrowLeft, ArrowRight, Download, FileText } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { BreakdownBars } from '@/components/charts/BreakdownBars';
import { DonutChart, LineChart, monthShort } from '@/components/charts/Charts';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { CompanySwitcher } from '@/components/layout/CompanySwitcher';
import { TopBar } from '@/components/layout/TopBar';
import { BillRow } from '@/components/bills/BillRow';
import {
  Button,
  Card,
  IconButton,
  SectionHeader,
  Segmented,
  Skeleton,
  Text,
  toast,
} from '@/components/ui';
import { useCompanies } from '@/features/catalog/api';
import { downloadAndShare, useReport, type Report } from '@/features/insights/api';
import { formatUSD } from '@/lib/money';
import { useSelectedCompanyId } from '@/state/companyFilter';
import { palette, spacing, useTheme } from '@/theme';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function Body({ r }: { r: Report }) {
  const { colors } = useTheme();
  const m = (v: number) => formatUSD(v, { compact: true });
  const committed = r.totals.committed;

  return (
    <>
      <View
        style={{
          marginHorizontal: -spacing.screen,
          paddingHorizontal: spacing.screen,
          paddingVertical: 24,
          backgroundColor: palette.teal800,
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Text variant="eyebrow" color="rgba(255,255,255,0.75)">
          TOTAL COMMITTED ·{' '}
          {r.period === 'year' ? r.year : `${MONTHS[(r.month ?? 1) - 1]!.toUpperCase()} ${r.year}`}
        </Text>
        <Text variant="amountXL" color="#FFFFFF">
          {formatUSD(committed.amountCents)}
        </Text>
        <Text variant="small" color="rgba(255,255,255,0.75)">
          {committed.count} due date{committed.count === 1 ? '' : 's'} · all amounts in USD
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignSelf: 'stretch',
            marginTop: 14,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.2)',
          }}
        >
          {(
            [
              ['Paid', r.totals.paid, '#55D39C'],
              ['Outstanding', r.totals.outstanding, '#FF8F86'],
              ['Overdue now', r.totals.overdue, palette.amber],
            ] as const
          ).map(([label, block, dot]) => (
            <View key={label} style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
                <Text variant="caption" color="rgba(255,255,255,0.8)">
                  {label}
                </Text>
              </View>
              <Text variant="bodyStrong" color="#FFFFFF">
                {m(block.amountCents)}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View>
        <SectionHeader title="12-month forecast" action="USD" />
        <Card>
          <LineChart
            accessibilityLabel={`Expected payments for the next 12 months, ${r.forecast.map((f) => `${monthShort(f.month)} ${m(f.amountCents)}`).join(', ')}`}
            data={r.forecast.map((f) => ({ label: monthShort(f.month), value: f.amountCents }))}
          />
        </Card>
      </View>

      {r.byCategory.length ? (
        <View>
          <SectionHeader title="By category" />
          <Card>
            <DonutChart
              centerValue={`${Math.round(r.byCategory[0]!.share)}%`}
              centerLabel={r.byCategory[0]!.name}
              slices={r.byCategory
                .slice(0, 5)
                .map((c) => ({ label: c.name, value: c.amountCents }))}
              formatValue={m}
            />
          </Card>
        </View>
      ) : null}

      {r.byCompany.length ? (
        <View>
          <SectionHeader title="By company" />
          <Card>
            <BreakdownBars items={r.byCompany} />
          </Card>
        </View>
      ) : null}

      {r.period === 'year' ? (
        <View>
          <SectionHeader title="Month by month" />
          <Card style={{ paddingVertical: 4 }}>
            {r.months.map((row, i) => (
              <View
                key={row.month}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: 40,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: colors.line,
                }}
              >
                <Text variant="small" style={{ flex: 1 }}>
                  {monthShort(row.month)}
                </Text>
                <Text
                  variant="smallStrong"
                  color={colors.green}
                  style={{ width: 90, textAlign: 'right' }}
                >
                  {m(row.paidCents)}
                </Text>
                <Text variant="small" tone="muted" style={{ width: 90, textAlign: 'right' }}>
                  {row.outstandingCents ? m(row.outstandingCents) : '—'}
                </Text>
              </View>
            ))}
          </Card>
          <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
            Paid · still due
          </Text>
        </View>
      ) : null}

      {r.overdue.length ? (
        <View>
          <SectionHeader title="Overdue now" action={`${r.overdue.length}`} />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {r.overdue.map((o, i) => (
              <BillRow
                key={o.id}
                compact
                divider={i > 0}
                onPress={() => router.push(`/bills/${o.id}`)}
                item={{
                  id: o.id,
                  name: o.name,
                  icon: o.category.icon,
                  amountCents: o.remainingCents,
                  date: o.nextDueDate,
                  status: 'OVERDUE',
                  subtitle: `${o.company.name} · ${o.frequencyLabel}`,
                }}
              />
            ))}
          </Card>
        </View>
      ) : null}
    </>
  );
}

export default function Reports() {
  const { colors } = useTheme();
  const now = new Date();
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const query = useReport(period, year, period === 'month' ? month : undefined);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);
  // Exports follow the company switcher too.
  const companyId = useSelectedCompanyId();
  const companies = useCompanies();
  const companySlug = (companies.data?.find((c) => c.id === companyId)?.name ?? 'company').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const step = (dir: number) => {
    if (period === 'year') return setYear((y) => y + dir);
    const index = year * 12 + month - 1 + dir;
    setYear(Math.floor(index / 12));
    setMonth((index % 12) + 1);
  };

  const exportAs = async (format: 'pdf' | 'xlsx') => {
    setExporting(format);
    try {
      const qs = `format=${format}&period=${period}&year=${year}${period === 'month' ? `&month=${month}` : ''}${companyId ? `&companyId=${companyId}` : ''}`;
      const name = `dueora-report-${companyId ? `${companySlug}-` : ''}${year}${period === 'month' ? `-${String(month).padStart(2, '0')}` : ''}.${format}`;
      await downloadAndShare(
        `/reports/export?${qs}`,
        name,
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } catch {
      toast.error('Could not export the report', 'Check your connection and try again.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <Screen header={<TopBar title="Reports" />} contentStyle={{ gap: 20, paddingBottom: 32 }}>
      <CompanySwitcher />
      <Segmented
        accessibilityLabel="Report period"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'month', label: 'Monthly' },
          { value: 'year', label: 'Annual' },
        ]}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton accessibilityLabel="Previous period" onPress={() => step(-1)}>
          <ArrowLeft size={18} color={colors.ink} />
        </IconButton>
        <Text variant="bodyStrong" accessibilityLiveRegion="polite">
          {period === 'year' ? year : `${MONTHS[month - 1]} ${year}`}
        </Text>
        <IconButton accessibilityLabel="Next period" onPress={() => step(1)}>
          <ArrowRight size={18} color={colors.ink} />
        </IconButton>
      </View>
      <QueryState query={query} loading={<Skeleton height={320} radius={16} />}>
        {(r) => <Body r={r} />}
      </QueryState>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          variant="secondary"
          style={{ flex: 1 }}
          loading={exporting === 'pdf'}
          icon={<FileText size={18} color={colors.primaryStrong} />}
          onPress={() => void exportAs('pdf')}
        >
          Export PDF
        </Button>
        <Button
          variant="secondary"
          style={{ flex: 1 }}
          loading={exporting === 'xlsx'}
          icon={<Download size={18} color={colors.primaryStrong} />}
          onPress={() => void exportAs('xlsx')}
        >
          Export Excel
        </Button>
      </View>
    </Screen>
  );
}
