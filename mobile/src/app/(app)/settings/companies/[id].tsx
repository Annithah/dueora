import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Archive, ArchiveRestore, ListChecks, Tags, Trash2, Users } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/api';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Avatar, BottomSheet, Button, Card, CategoryIcon, ListItem, SectionHeader, Segmented, Text, toast } from '@/components/ui';
import {
  archiveCompany,
  deleteCompany,
  unarchiveCompany,
  categoryTree,
  updateCompany,
  useCategories,
  useCompany,
  type CompanyDetail,
} from '@/features/catalog/api';
import { CompanyForm } from '@/features/catalog/CompanyForm';
import { hourLabel } from '@/features/notifications/reminderOptions';
import { ROLE_LABELS, usePermissions } from '@/features/workspaces/api';
import { formatUSD } from '@/lib/money';
import { useSelectCompany } from '@/state/companyFilter';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

type Tab = 'overview' | 'categories' | 'members' | 'settings';

const offsetText = (d: number) => (d === 0 ? 'on the day' : d > 0 ? `${d}d before` : `${-d}d after`);

/** One company: overview, who can see it, and (for admins) its settings. */
export default function CompanyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const company = useCompany(id);
  return (
    <Screen header={<TopBar title={company.data?.name ?? 'Company'} />} contentStyle={{ gap: 20, paddingBottom: 32 }}>
      <QueryState query={company}>{(c) => <Body c={c} />}</QueryState>
    </Screen>
  );
}

function Body({ c }: { c: CompanyDetail }) {
  const { colors } = useTheme();
  const can = usePermissions();
  const queryClient = useQueryClient();
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  const selectCompany = useSelectCompany();
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);

  const refresh = () =>
    Promise.all(
      ['companies', 'workspace', 'bills', 'dashboard'].map((k) => queryClient.invalidateQueries({ queryKey: [k, workspaceId] })),
    );
  const fail = (e: unknown) => toast.error('Could not save', e instanceof ApiError ? e.message : undefined);
  const run = async (fn: () => Promise<unknown>, done: string, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast.success(done);
      after?.();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const tabs: { value: Tab; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'categories', label: 'Categories' },
    { value: 'members', label: 'Members' },
    ...(can.manageCompanies ? [{ value: 'settings' as const, label: 'Settings' }] : []),
  ];

  return (
    <>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Avatar name={c.shortName || c.name} color={c.color} size={64} />
        <Text variant="title" align="center" accessibilityRole="header">
          {c.name}
        </Text>
        {c.description ? (
          <Text variant="body" tone="muted" align="center">
            {c.description}
          </Text>
        ) : null}
        {c.archived ? (
          <Text variant="smallStrong" tone="muted">
            Archived · hidden from pickers, history kept
          </Text>
        ) : null}
      </View>

      <Segmented accessibilityLabel="Company sections" value={tab} onChange={setTab} options={tabs} />

      {tab === 'overview' ? (
        <View style={{ gap: 16 }}>
          <Card style={{ gap: 10 }}>
            <Row label="Bills" value={String(c.billCount)} />
            <Row label="Your role" value={c.myRole ? ROLE_LABELS[c.myRole] : '—'} />
            <Row label="Monthly budget" value={c.monthlyBudgetCents != null ? formatUSD(c.monthlyBudgetCents) : 'Not set'} />
            <Row label="Reminders" value={c.reminderOffsets?.length ? c.reminderOffsets.map(offsetText).join(', ') : 'Workspace default'} />
            <Row label="Reminder time" value={c.reminderHour != null ? hourLabel(c.reminderHour) : 'Workspace default'} />
          </Card>
          <Button
            full
            variant="secondary"
            icon={<ListChecks size={18} color={colors.primaryStrong} />}
            onPress={() => {
              selectCompany(c.id);
              router.push('/bills');
            }}
          >
            View this company’s bills
          </Button>
        </View>
      ) : null}

      {tab === 'categories' ? <CompanyCategories companyId={c.id} /> : null}

      {tab === 'members' ? (
        <View>
          <SectionHeader title={`${c.members.length} with access`} />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {c.members.map((m, i) => (
              <ListItem
                key={m.membershipId}
                divider={i > 0}
                leading={<Avatar name={m.name} size={36} />}
                title={m.name}
                subtitle={`${ROLE_LABELS[m.role]}${m.allCompanies && m.role !== 'ADMIN' ? ' · all companies' : ''}`}
              />
            ))}
          </Card>
          {can.manageTeam ? (
            <Button variant="ghost" icon={<Users size={18} color={colors.primaryStrong} />} onPress={() => router.push('/team')} style={{ marginTop: 8 }}>
              Manage access in Team
            </Button>
          ) : null}
        </View>
      ) : null}

      {tab === 'settings' && can.manageCompanies ? (
        <View style={{ gap: 16 }}>
          <Card>
            <CompanyForm
              key={c.id}
              initial={c}
              submitLabel="Save"
              loading={busy}
              onSubmit={(fields) => void run(() => updateCompany({ id: c.id, ...fields }), 'Company saved')}
            />
          </Card>
          {c.archived ? (
            <Button full variant="secondary" icon={<ArchiveRestore size={18} color={colors.primaryStrong} />} loading={busy} onPress={() => void run(() => unarchiveCompany(c.id), `${c.name} restored`)}>
              Restore company
            </Button>
          ) : (
            <Button full variant="secondary" icon={<Archive size={18} color={colors.primaryStrong} />} onPress={() => setConfirm('archive')}>
              Archive company
            </Button>
          )}
          {c.billCount === 0 ? (
            <Button full variant="ghost" icon={<Trash2 size={18} color={colors.red} />} onPress={() => setConfirm('delete')}>
              Delete company
            </Button>
          ) : (
            <Text variant="small" tone="muted" align="center">
              A company with bills can’t be deleted. Archive it to hide it and keep its history.
            </Text>
          )}
        </View>
      ) : null}

      <BottomSheet visible={!!confirm} onClose={() => setConfirm(null)} title={confirm === 'delete' ? `Delete ${c.name}?` : `Archive ${c.name}?`}>
        <View style={{ gap: 14 }}>
          <Text variant="body" tone="muted">
            {confirm === 'delete'
              ? 'It has no bills, so it will be removed for good.'
              : 'It will be hidden from pickers and the company switcher. Every bill and payment is kept, and you can restore it any time.'}
          </Text>
          <Button
            full
            variant="danger"
            loading={busy}
            onPress={() =>
              confirm === 'delete'
                ? void run(() => deleteCompany(c.id), 'Company deleted', () => router.back())
                : void run(() => archiveCompany(c.id), 'Company archived')
            }
          >
            {confirm === 'delete' ? 'Delete' : 'Archive'}
          </Button>
        </View>
      </BottomSheet>
    </>
  );
}

function CompanyCategories({ companyId }: { companyId: string }) {
  const { colors } = useTheme();
  const categories = useCategories({ companyId });
  const list = categories.data ?? [];
  return (
    <View style={{ gap: 12 }}>
      {list.length ? (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          {categoryTree(list).map(({ category: k, depth }, i) => (
            <ListItem
              key={k.id}
              divider={i > 0}
              leading={<View style={{ paddingLeft: depth ? 18 : 0 }}><CategoryIcon icon={k.icon} size={depth ? 28 : 34} /></View>}
              title={k.name}
              subtitle={`${k.billCount} bill${k.billCount === 1 ? '' : 's'}`}
            />
          ))}
        </Card>
      ) : (
        <Text variant="body" tone="muted">
          No categories yet.
        </Text>
      )}
      <Button
        full
        variant="secondary"
        icon={<Tags size={18} color={colors.primaryStrong} />}
        onPress={() => router.push({ pathname: '/settings/categories', params: { companyId } })}
      >
        Manage categories and custom fields
      </Button>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text variant="body" tone="muted">
        {label}
      </Text>
      <Text variant="bodyStrong" style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}
