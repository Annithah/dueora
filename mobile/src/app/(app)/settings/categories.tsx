import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronRight, GitMerge, ListPlus, Pencil, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/api';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { BottomSheet, Button, Card, CategoryIcon, EmptyState, ListItem, SectionHeader, Select, Switch, Text, toast } from '@/components/ui';
import {
  archiveCategory,
  categoryTree,
  createCategory,
  deleteCategory,
  mergeCategory,
  reorderCategories,
  unarchiveCategory,
  updateCategory,
  useCategories,
  useCompanies,
  type Category,
} from '@/features/catalog/api';
import { CategoryForm, type CategorySubmit } from '@/features/catalog/CategoryForm';
import { CustomFieldsSection } from '@/features/catalog/CustomFieldsSection';
import { useSelectedCompanyId } from '@/state/companyFilter';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

type Sheet = { kind: 'new'; parentId?: string } | { kind: 'actions'; c: Category } | { kind: 'edit'; c: Category } | { kind: 'merge'; c: Category } | { kind: 'delete'; c: Category };

/** Categories belong to a company: pick the company, then manage its categories and custom fields. */
export default function CategoriesSettings() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  const params = useLocalSearchParams<{ companyId?: string }>();
  const switcher = useSelectedCompanyId();
  const companies = useCompanies();
  const [picked, setCompanyId] = useState<string | undefined>(params.companyId ?? switcher);
  // Default to the first company until one is picked.
  const companyId = picked ?? companies.data?.[0]?.id;
  const company = companies.data?.find((c) => c.id === companyId);
  const canManage = company?.myRole === 'ADMIN' || company?.myRole === 'FINANCE';
  const [showArchived, setShowArchived] = useState(false);
  const categories = useCategories({ companyId, includeArchived: true });
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<string>('');

  const refresh = () =>
    Promise.all(['categories', 'bills', 'budgets'].map((k) => queryClient.invalidateQueries({ queryKey: [k, workspaceId] })));
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      if (done) toast.success(done);
      setSheet(null);
    } catch (e) {
      toast.error('Could not save', e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const list = categories.data ?? [];
  const active = list.filter((c) => !c.archived);
  const parents = active.filter((c) => !c.parentId);
  const move = (c: Category, dir: -1 | 1) => {
    const siblings = active.filter((x) => x.parentId === c.parentId);
    const i = siblings.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const ids = siblings.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void run(() => reorderCategories({ companyId: companyId!, ids }));
  };
  const others = (c: Category) => active.filter((x) => x.id !== c.id && x.parentId !== c.id);

  return (
    <Screen header={<TopBar title="Categories" />} contentStyle={{ gap: 20, paddingBottom: 32 }}>
      <Text variant="body" tone="muted">
        Each company has its own categories, with one level of sub-categories.
      </Text>
      {(companies.data?.length ?? 0) > 1 ? (
        <Select
          label="Company"
          value={companyId ?? null}
          options={(companies.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          onChange={setCompanyId}
        />
      ) : null}

      <View>
        <SectionHeader title={company ? `${company.name}’s categories` : 'Categories'} action={canManage ? 'Add' : undefined} onAction={canManage ? () => setSheet({ kind: 'new' }) : undefined} />
        <QueryState query={categories}>
          {() =>
            active.length ? (
              <Card padding={0} style={{ overflow: 'hidden' }}>
                {categoryTree(active).map(({ category: c, depth }, i) => (
                  <ListItem
                    key={c.id}
                    divider={i > 0}
                    leading={
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: depth ? 18 : 0 }}>
                        <CategoryIcon icon={c.icon} size={depth ? 30 : 36} />
                      </View>
                    }
                    title={c.name}
                    subtitle={[`${c.billCount} bill${c.billCount === 1 ? '' : 's'}`, c.description].filter(Boolean).join(' · ')}
                    onPress={canManage ? () => setSheet({ kind: 'actions', c }) : undefined}
                    trailing={canManage ? <ChevronRight size={18} color={colors.muted} /> : undefined}
                  />
                ))}
              </Card>
            ) : (
              <EmptyState
                compact
                illustration="empty-bills"
                title="No categories yet"
                message={canManage ? 'Add one, or pick from the suggestions when you add it.' : 'An admin or finance member of this company can add them.'}
              />
            )
          }
        </QueryState>
      </View>

      {list.some((c) => c.archived) ? (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="bodyStrong">Show archived</Text>
            <Switch accessibilityLabel="Show archived categories" value={showArchived} onValueChange={setShowArchived} />
          </View>
          {showArchived ? (
            <Card padding={0} style={{ overflow: 'hidden', marginTop: 8 }}>
              {list
                .filter((c) => c.archived)
                .map((c, i) => (
                  <ListItem
                    key={c.id}
                    divider={i > 0}
                    leading={<Archive size={18} color={colors.muted} />}
                    title={c.name}
                    subtitle="Hidden from pickers · bills keep it"
                    onPress={canManage ? () => void run(() => unarchiveCategory(c.id), `${c.name} restored`) : undefined}
                    trailing={canManage ? <ArchiveRestore size={18} color={colors.primaryStrong} /> : undefined}
                  />
                ))}
            </Card>
          ) : null}
        </View>
      ) : null}

      {companyId ? <CustomFieldsSection companyId={companyId} canManage={canManage} categories={active} /> : null}

      <BottomSheet visible={sheet?.kind === 'new'} onClose={() => setSheet(null)} title="New category">
        {sheet?.kind === 'new' ? (
          <CategoryForm
            parents={parents}
            defaultParentId={sheet.parentId}
            submitLabel="Add category"
            loading={busy}
            onSubmit={(f: CategorySubmit) => void run(() => createCategory({ ...f, companyId: companyId! }), `${f.name} added`)}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet visible={sheet?.kind === 'edit'} onClose={() => setSheet(null)} title="Edit category">
        {sheet?.kind === 'edit' ? (
          <CategoryForm
            initial={sheet.c}
            parents={parents}
            submitLabel="Save"
            loading={busy}
            onSubmit={({ subcategories: _s, ...f }) => void run(() => updateCategory({ id: sheet.c.id, ...f }), 'Category saved')}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet visible={sheet?.kind === 'actions'} onClose={() => setSheet(null)} title={sheet?.kind === 'actions' ? sheet.c.name : ''}>
        {sheet?.kind === 'actions' ? (
          <View style={{ gap: 4 }}>
            <ListItem icon={<Pencil size={18} color={colors.primaryStrong} />} title="Edit" onPress={() => setSheet({ kind: 'edit', c: sheet.c })} />
            {!sheet.c.parentId ? (
              <ListItem
                icon={<ListPlus size={18} color={colors.primaryStrong} />}
                title="Add a sub-category"
                onPress={() => setSheet({ kind: 'new', parentId: sheet.c.id })}
              />
            ) : null}
            <ListItem icon={<ArrowUp size={18} color={colors.primaryStrong} />} title="Move up" onPress={() => move(sheet.c, -1)} />
            <ListItem icon={<ArrowDown size={18} color={colors.primaryStrong} />} title="Move down" onPress={() => move(sheet.c, 1)} />
            <ListItem icon={<GitMerge size={18} color={colors.primaryStrong} />} title="Merge into another…" onPress={() => { setTarget(''); setSheet({ kind: 'merge', c: sheet.c }); }} />
            <ListItem icon={<Archive size={18} color={colors.primaryStrong} />} title="Archive" subtitle="Hidden from pickers; bills keep it" onPress={() => void run(() => archiveCategory(sheet.c.id), `${sheet.c.name} archived`)} />
            <ListItem icon={<Trash2 size={18} color={colors.red} />} title="Delete" onPress={() => { setTarget(''); setSheet({ kind: 'delete', c: sheet.c }); }} />
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet visible={sheet?.kind === 'merge' || sheet?.kind === 'delete'} onClose={() => setSheet(null)} title={sheet && 'c' in sheet ? (sheet.kind === 'merge' ? `Merge ${sheet.c.name}` : `Delete ${sheet.c.name}?`) : ''}>
        {sheet && (sheet.kind === 'merge' || sheet.kind === 'delete') ? (
          <View style={{ gap: 14 }}>
            <Text variant="body" tone="muted">
              {sheet.kind === 'merge'
                ? 'Its bills, sub-categories and budget move into the category you pick, then it is removed.'
                : sheet.c.billCount
                  ? `It has ${sheet.c.billCount} bill${sheet.c.billCount === 1 ? '' : 's'}. Pick where to move them first.`
                  : 'It has no bills. Its sub-categories become top-level categories.'}
            </Text>
            {sheet.kind === 'merge' || sheet.c.billCount ? (
              <Select label="Move into" value={target || null} options={others(sheet.c).map((c) => ({ value: c.id, label: c.parent ? `${c.parent.name} › ${c.name}` : c.name }))} onChange={setTarget} />
            ) : null}
            <Button
              full
              variant="danger"
              loading={busy}
              disabled={(sheet.kind === 'merge' || !!sheet.c.billCount) && !target}
              onPress={() =>
                sheet.kind === 'merge'
                  ? void run(() => mergeCategory({ id: sheet.c.id, intoId: target }), 'Categories merged')
                  : void run(() => deleteCategory(sheet.c.id, target || undefined), 'Category deleted')
              }
            >
              {sheet.kind === 'merge' ? 'Merge' : 'Delete'}
            </Button>
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
