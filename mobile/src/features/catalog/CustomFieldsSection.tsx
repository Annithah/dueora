import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/api';
import { BottomSheet, Button, Card, Chip, Input, ListItem, SectionHeader, Segmented, Switch, Text, toast } from '@/components/ui';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

import {
  createCustomField,
  deleteCustomField,
  updateCustomField,
  useCustomFields,
  type Category,
  type CustomField,
  type CustomFieldType,
} from './api';

const TYPE_LABEL: Record<CustomFieldType, string> = { TEXT: 'Text', NUMBER: 'Number', DATE: 'Date', DROPDOWN: 'Dropdown' };
const MAX = 10;

/** A company's custom fields (at most 10): shown on its bills' form, detail, filters and exports. */
export function CustomFieldsSection({ companyId, canManage, categories }: { companyId: string; canManage: boolean; categories: readonly Category[] }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  const fields = useCustomFields(companyId);
  const [editing, setEditing] = useState<CustomField | 'new' | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomFieldType>('TEXT');
  const [options, setOptions] = useState('');
  const [required, setRequired] = useState(false);
  const [onlyFor, setOnlyFor] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const list = fields.data ?? [];

  const open = (f: CustomField | 'new') => {
    setEditing(f);
    setName(f === 'new' ? '' : f.name);
    setType(f === 'new' ? 'TEXT' : f.type);
    setOptions(f === 'new' ? '' : (f.options ?? []).join(', '));
    setRequired(f === 'new' ? false : f.required);
    setOnlyFor(f === 'new' ? [] : (f.categoryIds ?? []));
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ['custom-fields', workspaceId] });
      setEditing(null);
    } catch (e) {
      toast.error('Could not save', e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    const body = {
      name: name.trim(),
      type,
      options: type === 'DROPDOWN' ? options.split(',').map((o) => o.trim()).filter(Boolean) : null,
      required,
      categoryIds: onlyFor.length ? onlyFor : null,
    };
    void run(() => (editing === 'new' ? createCustomField({ companyId, ...body }) : updateCustomField({ id: (editing as CustomField).id, ...body })));
  };

  return (
    <View>
      <SectionHeader title={`Custom fields (${list.length}/${MAX})`} action={canManage && list.length < MAX ? 'Add' : undefined} onAction={() => open('new')} />
      {list.length ? (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          {list.map((f, i) => (
            <ListItem
              key={f.id}
              divider={i > 0}
              title={f.name}
              subtitle={`${TYPE_LABEL[f.type]}${f.required ? ' · required' : ''} · ${f.categoryIds ? `${f.categoryIds.length} categor${f.categoryIds.length === 1 ? 'y' : 'ies'}` : 'all bills'}`}
              onPress={canManage ? () => open(f) : undefined}
              trailing={canManage ? <Pencil size={17} color={colors.muted} /> : undefined}
            />
          ))}
        </Card>
      ) : (
        <Text variant="small" tone="muted">
          Extra details for this company’s bills, like a meter number or a contract end date.
        </Text>
      )}

      <BottomSheet visible={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New custom field' : 'Edit custom field'}>
        {editing ? (
          <View style={{ gap: 14 }}>
            <Input label="Field name" value={name} onChangeText={setName} maxLength={40} autoFocus={editing === 'new'} />
            <Segmented accessibilityLabel="Field type" value={type} onChange={setType} options={(Object.keys(TYPE_LABEL) as CustomFieldType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
            {type === 'DROPDOWN' ? <Input label="Choices" placeholder="Basic, Pro, Enterprise" value={options} onChangeText={setOptions} hint="Separate with commas (at least two)." /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="bodyStrong">Required</Text>
              <Switch accessibilityLabel="Required" value={required} onValueChange={setRequired} />
            </View>
            <Text variant="label">Shown on</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip label="All bills" selected={onlyFor.length === 0} onPress={() => setOnlyFor([])} />
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  showCheck
                  selected={onlyFor.includes(c.id)}
                  onPress={() => setOnlyFor((v) => (v.includes(c.id) ? v.filter((x) => x !== c.id) : [...v, c.id]))}
                />
              ))}
            </View>
            <Button full icon={editing === 'new' ? <Plus size={18} color={colors.onPrimary} /> : undefined} disabled={!name.trim()} loading={busy} onPress={save}>
              {editing === 'new' ? 'Add field' : 'Save'}
            </Button>
            {editing !== 'new' ? (
              <Button full variant="ghost" icon={<Trash2 size={18} color={colors.red} />} onPress={() => void run(() => deleteCustomField((editing as CustomField).id))}>
                Delete field
              </Button>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}
