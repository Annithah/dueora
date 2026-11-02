import { FolderKanban, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import {
  BottomSheet,
  Button,
  Card,
  CategoryIcon,
  Input,
  ListItem,
  SectionHeader,
  Text,
  toast,
} from '@/components/ui';
import { ApiError } from '@/api';
import {
  createCategory,
  createPlatform,
  deleteCategory,
  useCategories,
  useListMutation,
  usePlatforms,
} from '@/features/catalog/api';
import { CATEGORY_ICON_KEYS, categoryVisual, radius, useTheme } from '@/theme';

const PLATFORM_COLORS = ['#0F5C5C', '#3B82F6', '#7C3AED', '#F2A33A', '#22A06B', '#EA580C'];

export default function CategoriesSettings() {
  const { colors } = useTheme();
  const categories = useCategories();
  const platforms = usePlatforms();
  const addCategory = useListMutation('categories', createCategory);
  const removeCategory = useListMutation('categories', deleteCategory);
  const addPlatform = useListMutation('platforms', createPlatform);
  const [sheet, setSheet] = useState<'category' | 'platform' | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('tag');
  const [color, setColor] = useState(PLATFORM_COLORS[0]!);

  const close = () => {
    setSheet(null);
    setName('');
  };
  const fail = (e: unknown) =>
    toast.error('Could not save', e instanceof ApiError ? e.message : undefined);

  return (
    <Screen
      header={<TopBar title="Categories & projects" />}
      contentStyle={{ gap: 20, paddingBottom: 32 }}
    >
      <View>
        <SectionHeader title="Projects" action="Add" onAction={() => setSheet('platform')} />
        <QueryState query={platforms}>
          {(list) =>
            list.length ? (
              <Card padding={0} style={{ overflow: 'hidden' }}>
                {list.map((p, i) => (
                  <ListItem
                    key={p.id}
                    divider={i > 0}
                    leading={
                      <View
                        style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: p.color }}
                      />
                    }
                    title={p.name}
                    subtitle={`${p.obligationCount ?? 0} payment${p.obligationCount === 1 ? '' : 's'}`}
                  />
                ))}
              </Card>
            ) : (
              <Text variant="small" tone="muted">
                Projects group payments, e.g. per website or brand.
              </Text>
            )
          }
        </QueryState>
      </View>

      <View>
        <SectionHeader title="Categories" action="Add" onAction={() => setSheet('category')} />
        <QueryState query={categories}>
          {(list) => (
            <Card padding={0} style={{ overflow: 'hidden' }}>
              {list.map((c, i) => (
                <ListItem
                  key={c.id}
                  divider={i > 0}
                  leading={<CategoryIcon icon={c.icon} size={36} />}
                  title={c.name}
                  subtitle={c.isDefault ? 'Built-in' : 'Custom'}
                  trailing={
                    c.isDefault ? undefined : (
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
      </View>

      <BottomSheet visible={sheet === 'category'} onClose={close} title="New category">
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
              style={{
                padding: 3,
                borderRadius: radius.md,
                borderWidth: 2,
                borderColor: icon === k ? colors.primaryStrong : 'transparent',
              }}
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
          onPress={() =>
            addCategory.mutate(
              { name: name.trim(), icon, color: categoryVisual(icon).fgLight },
              { onSuccess: close, onError: fail },
            )
          }
        >
          Add category
        </Button>
      </BottomSheet>

      <BottomSheet visible={sheet === 'platform'} onClose={close} title="New project">
        <Input
          label="Name"
          placeholder="e.g. KT Radio"
          value={name}
          onChangeText={setName}
          icon={<FolderKanban size={18} color={colors.muted} />}
        />
        <Text variant="label">Colour</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {PLATFORM_COLORS.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityLabel={c}
              accessibilityState={{ checked: color === c }}
              onPress={() => setColor(c)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: c,
                borderWidth: color === c ? 3 : 0,
                borderColor: colors.ink,
              }}
            />
          ))}
        </View>
        <Button
          full
          disabled={!name.trim()}
          loading={addPlatform.isPending}
          onPress={() =>
            addPlatform.mutate({ name: name.trim(), color }, { onSuccess: close, onError: fail })
          }
        >
          Add project
        </Button>
      </BottomSheet>
    </Screen>
  );
}
