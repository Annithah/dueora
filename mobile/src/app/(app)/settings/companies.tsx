import { Archive, ArchiveRestore, Building2, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ApiError } from '@/api';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { BottomSheet, Button, Card, EmptyState, Input, ListItem, SectionHeader, Text, toast } from '@/components/ui';
import {
  createCompany,
  deleteCompany,
  unarchiveCompany,
  updateCompany,
  useCompanies,
  useListMutation,
  type Company,
} from '@/features/catalog/api';
import { usePermissions } from '@/features/workspaces/api';
import { useTheme } from '@/theme';

const COLORS = ['#0F5C5C', '#3B82F6', '#7C3AED', '#F2A33A', '#22A06B', '#EA580C', '#BE185D', '#475569'];

type Editing = { mode: 'new' } | { mode: 'edit'; company: Company };

export default function CompaniesSettings() {
  const { colors } = useTheme();
  const can = usePermissions();
  const companies = useCompanies({ includeArchived: true });
  const create = useListMutation('companies', createCompany);
  const update = useListMutation('companies', updateCompany);
  const remove = useListMutation('companies', deleteCompany);
  const restore = useListMutation('companies', unarchiveCompany);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirm, setConfirm] = useState<Company | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]!);

  const open = (e: Editing) => {
    setEditing(e);
    setName(e.mode === 'edit' ? e.company.name : '');
    setColor(e.mode === 'edit' ? e.company.color : COLORS[0]!);
  };
  const fail = (e: unknown) => toast.error('Could not save', e instanceof ApiError ? e.message : undefined);

  const save = () => {
    if (!editing) return;
    const done = { onSuccess: () => setEditing(null), onError: fail };
    if (editing.mode === 'new') create.mutate({ name: name.trim(), color }, done);
    else update.mutate({ id: editing.company.id, name: name.trim(), color }, done);
  };

  return (
    <Screen header={<TopBar title="Companies" />} contentStyle={{ gap: 20, paddingBottom: 32 }}>
      <Text variant="body" tone="muted">
        Every bill belongs to one company — e.g. each brand, site or business you pay for.
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
                  onAction={can.manageCompanies ? () => open({ mode: 'new' }) : undefined}
                />
                {active.length ? (
                  <Card padding={0} style={{ overflow: 'hidden' }}>
                    {active.map((c, i) => (
                      <ListItem
                        key={c.id}
                        divider={i > 0}
                        leading={<View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c.color }} />}
                        title={c.name}
                        subtitle={`${c.billCount} bill${c.billCount === 1 ? '' : 's'}`}
                        onPress={can.manageCompanies ? () => open({ mode: 'edit', company: c }) : undefined}
                        trailing={can.manageCompanies ? <Pencil size={17} color={colors.muted} /> : undefined}
                      />
                    ))}
                  </Card>
                ) : (
                  <EmptyState compact illustration="team" title="No companies yet" message="Add one to start adding bills." />
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
                        trailing={
                          can.manageCompanies ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Restore ${c.name}`}
                              hitSlop={10}
                              onPress={() => restore.mutate(c.id, { onError: fail })}
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

      <BottomSheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.mode === 'edit' ? 'Edit company' : 'New company'}>
        <View style={{ gap: 14 }}>
          <Input label="Company name" value={name} onChangeText={setName} icon={<Building2 size={18} color={colors.muted} />} autoFocus />
          <Text variant="label">Colour</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="radio"
                accessibilityLabel={`Colour ${c}`}
                accessibilityState={{ checked: color === c }}
                onPress={() => setColor(c)}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.ink }}
              />
            ))}
          </View>
          <Button
            full
            icon={editing?.mode === 'new' ? <Plus size={18} color={colors.onPrimary} /> : undefined}
            disabled={!name.trim()}
            loading={create.isPending || update.isPending}
            onPress={save}
          >
            {editing?.mode === 'edit' ? 'Save' : 'Add company'}
          </Button>
          {editing?.mode === 'edit' ? (
            <Button
              full
              variant="ghost"
              icon={<Trash2 size={18} color={colors.red} />}
              onPress={() => {
                setConfirm(editing.company);
                setEditing(null);
              }}
            >
              {editing.company.billCount ? 'Archive company' : 'Delete company'}
            </Button>
          ) : null}
        </View>
      </BottomSheet>

      <BottomSheet visible={!!confirm} onClose={() => setConfirm(null)} title={confirm?.billCount ? `Archive ${confirm.name}?` : `Delete ${confirm?.name}?`}>
        <View style={{ gap: 14 }}>
          <Text variant="body" tone="muted">
            {confirm?.billCount
              ? 'It has bills, so it will be archived: hidden from pickers, with every bill and payment kept.'
              : 'It has no bills, so it will be deleted.'}
          </Text>
          <Button
            full
            variant="danger"
            loading={remove.isPending}
            onPress={() =>
              remove.mutate(confirm!.id, {
                onSuccess: (r) => {
                  toast.success(r.archived ? 'Company archived' : 'Company deleted');
                  setConfirm(null);
                },
                onError: fail,
              })
            }
          >
            {confirm?.billCount ? 'Archive' : 'Delete'}
          </Button>
        </View>
      </BottomSheet>
    </Screen>
  );
}
