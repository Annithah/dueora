import { Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ApiError } from '@/api';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { BottomSheet, Button, Card, CategoryIcon, Input, ListItem, SectionHeader, Text, toast } from '@/components/ui';
import { createCategory, deleteCategory, useCategories, useListMutation } from '@/features/catalog/api';
import { usePermissions } from '@/features/workspaces/api';
import { CATEGORY_ICON_KEYS, categoryVisual, radius, useTheme } from '@/theme';

export default function CategoriesSettings() {
  const { colors } = useTheme();
  const can = usePermissions();
  const categories = useCategories();
  const addCategory = useListMutation('categories', createCategory);
  const removeCategory = useListMutation('categories', deleteCategory);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('tag');

  const close = () => {
    setOpen(false);
    setName('');
  };
  const fail = (e: unknown) => toast.error('Could not save', e instanceof ApiError ? e.message : undefined);

  return (
    <Screen header={<TopBar title="Categories" />} contentStyle={{ gap: 20, paddingBottom: 32 }}>
      <View>
        <SectionHeader
          title="Categories"
          action={can.manageCategories ? 'Add' : undefined}
          onAction={can.manageCategories ? () => setOpen(true) : undefined}
        />
        <QueryState query={categories}>
          {(list) => (
            <Card padding={0} style={{ overflow: 'hidden' }}>
              {list.map((c, i) => (
                <ListItem
                  key={c.id}
                  divider={i > 0}
                  leading={<CategoryIcon icon={c.icon} size={36} />}
                  title={c.name}
                  subtitle={`${c.isDefault ? 'Built-in' : 'Custom'} · ${c.billCount ?? 0} bill${c.billCount === 1 ? '' : 's'}`}
                  trailing={
                    c.isDefault || !can.manageCategories ? undefined : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${c.name}`}
                        hitSlop={10}
                        onPress={() => removeCategory.mutate(c.id, { onError: fail })}
                      >
                        <Trash2 size={18} color={colors.red} />
                      </Pressable>
                    )
                  }
                />
              ))}
            </Card>
          )}
        </QueryState>
        <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
          A category in use can’t be deleted — move its bills first.
        </Text>
      </View>

      <BottomSheet visible={open} onClose={close} title="New category">
        <View style={{ gap: 14 }}>
          <Input label="Name" placeholder="e.g. Licences" value={name} onChangeText={setName} />
          <Text variant="label">Icon</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {CATEGORY_ICON_KEYS.map((k) => (
              <Pressable
                key={k}
                accessibilityRole="radio"
                accessibilityLabel={k}
                accessibilityState={{ checked: icon === k }}
                onPress={() => setIcon(k)}
                style={{ padding: 3, borderRadius: radius.md, borderWidth: 2, borderColor: icon === k ? colors.primaryStrong : 'transparent' }}
              >
                <CategoryIcon icon={k} size={40} />
              </Pressable>
            ))}
          </View>
          <Button
            full
            icon={<Plus size={18} color={colors.onPrimary} />}
            disabled={!name.trim()}
            loading={addCategory.isPending}
            onPress={() => addCategory.mutate({ name: name.trim(), icon, color: categoryVisual(icon).fgLight }, { onSuccess: close, onError: fail })}
          >
            Add category
          </Button>
        </View>
      </BottomSheet>
    </Screen>
  );
}
