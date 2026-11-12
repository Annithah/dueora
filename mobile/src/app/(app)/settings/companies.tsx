import { router } from 'expo-router';
import { Archive, ArchiveRestore, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ApiError } from '@/api';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Avatar, BottomSheet, Card, Chip, EmptyState, ListItem, SectionHeader, Segmented, Select, Text, toast } from '@/components/ui';
import { createCompany, unarchiveCompany, useCategorySuggestions, useCompanies, useListMutation } from '@/features/catalog/api';
import { CompanyForm } from '@/features/catalog/CompanyForm';
import { ROLE_LABELS, usePermissions } from '@/features/workspaces/api';
import { formatUSD } from '@/lib/money';
import { useTheme } from '@/theme';

export default function CompaniesSettings() {
  const { colors } = useTheme();
  const can = usePermissions();
  const companies = useCompanies({ includeArchived: true });
  const create = useListMutation('companies', createCompany);
  const restore = useListMutation('companies', unarchiveCompany);
  const [adding, setAdding] = useState(false);
  // How the new company's categories start (Finalize brief, Part 3).
  const [start, setStart] = useState<'suggestions' | 'empty' | 'copy'>('suggestions');
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const suggestions = useCategorySuggestions();
  const [picked, setPicked] = useState<string[] | null>(null);
  const pickedNames = picked ?? (suggestions.data ?? []).map((s) => s.name);
  const fail = (e: unknown) => toast.error('Could not save', e instanceof ApiError ? e.message : undefined);

  return (
    <Screen header={<TopBar title="Companies" />} contentStyle={{ gap: 20, paddingBottom: 32 }}>
      <Text variant="body" tone="muted">
        Every bill belongs to one company — each brand, site or business you pay for.
        {can.manageCompanies ? ' Only admins add, edit and archive companies.' : ''}
      </Text>
      <QueryState query={companies}>
        {(list) => {
          const active = list.filter((c) => !c.archived);
          const archived = list.filter((c) => c.archived);
          return (
            <>
              <View>
                <SectionHeader
                  title="Companies"
                  action={can.manageCompanies ? 'Add' : undefined}
                  onAction={can.manageCompanies ? () => setAdding(true) : undefined}
                />
                {active.length ? (
                  <Card padding={0} style={{ overflow: 'hidden' }}>
                    {active.map((c, i) => (
                      <ListItem
                        key={c.id}
                        divider={i > 0}
                        leading={<Avatar name={c.shortName || c.name} color={c.color} size={36} />}
                        title={c.name}
                        subtitle={[
                          `${c.billCount} bill${c.billCount === 1 ? '' : 's'}`,
                          c.monthlyBudgetCents != null ? `budget ${formatUSD(c.monthlyBudgetCents, { compact: true })}/mo` : null,
                          c.myRole && c.myRole !== 'ADMIN' ? ROLE_LABELS[c.myRole] : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        onPress={() => router.push(`/settings/companies/${c.id}`)}
                        trailing={<ChevronRight size={18} color={colors.muted} />}
                      />
                    ))}
                  </Card>
                ) : (
                  <EmptyState
                    compact
                    illustration="team"
                    title="No companies yet"
                    message={can.manageCompanies ? 'Add one to start adding bills.' : 'Ask an admin to add one or give you access.'}
                  />
                )}
              </View>
              {archived.length ? (
                <View>
                  <SectionHeader title="Archived" />
                  <Card padding={0} style={{ overflow: 'hidden' }}>
                    {archived.map((c, i) => (
                      <ListItem
                        key={c.id}
                        divider={i > 0}
                        leading={<Archive size={18} color={colors.muted} />}
                        title={c.name}
                        subtitle="Hidden from pickers · history kept"
                        onPress={() => router.push(`/settings/companies/${c.id}`)}
                        trailing={
                          can.manageCompanies ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Restore ${c.name}`}
                              hitSlop={10}
                              onPress={() =>
                                restore.mutate(c.id, { onSuccess: () => toast.success(`${c.name} restored`), onError: fail })
                              }
                            >
                              <ArchiveRestore size={18} color={colors.primaryStrong} />
                            </Pressable>
                          ) : undefined
                        }
                      />
                    ))}
                  </Card>
                </View>
              ) : null}
            </>
          );
        }}
      </QueryState>

      <BottomSheet visible={adding} onClose={() => setAdding(false)} title="New company">
        {adding ? (
          <View style={{ gap: 14 }}>
            <Text variant="label">Categories to start with</Text>
            <Segmented
              accessibilityLabel="Categories to start with"
              value={start}
              onChange={setStart}
              options={[
                { value: 'suggestions', label: 'Suggestions' },
                { value: 'copy', label: 'Copy' },
                { value: 'empty', label: 'Empty' },
              ]}
            />
            {start === 'suggestions' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(suggestions.data ?? []).map((s) => (
                  <Chip
                    key={s.name}
                    label={s.name}
                    showCheck
                    selected={pickedNames.includes(s.name)}
                    onPress={() => setPicked(pickedNames.includes(s.name) ? pickedNames.filter((n) => n !== s.name) : [...pickedNames, s.name])}
                  />
                ))}
              </View>
            ) : null}
            {start === 'copy' ? (
              <Select
                label="Copy categories from"
                value={copyFrom}
                options={(companies.data ?? []).filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name }))}
                onChange={setCopyFrom}
              />
            ) : null}
          <CompanyForm
            submitLabel="Add company"
            loading={create.isPending}
            onSubmit={(fields) =>
              create.mutate({
                ...fields,
                categoryStart:
                  start === 'copy' && copyFrom
                    ? { mode: 'copy', fromCompanyId: copyFrom }
                    : start === 'suggestions'
                      ? { mode: 'suggestions', names: pickedNames, withSubcategories: true }
                      : { mode: 'empty' },
              }, {
                onSuccess: (c) => {
                  setAdding(false);
                  toast.success(`${c.name} added`);
                },
                onError: fail,
              })
            }
          />
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
