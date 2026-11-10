import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ApiError } from '@/api';
import { BudgetBar } from '@/components/budgets/BudgetBar';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { BottomSheet, Button, Card, Chip, EmptyState, Input, Select, Text, toast } from '@/components/ui';
import { useDeleteBudget, useBudgets, useSaveBudget } from '@/features/budgets/api';
import { useCategories } from '@/features/catalog/api';
import { usePermissions } from '@/features/workspaces/api';
import { centsToInput, parseUSDInput } from '@/lib/money';
import { useTheme } from '@/theme';

const WHOLE = '__all__';
const ALERT_CHOICES = [50, 75, 80, 90] as const;

export default function BudgetsSettings() {
  const { colors } = useTheme();
  const can = usePermissions();
  const budgets = useBudgets();
  const categories = useCategories();
  const save = useSaveBudget();
  const remove = useDeleteBudget();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<string>(WHOLE);
  const [amount, setAmount] = useState('');
  const [alertAt, setAlertAt] = useState<number>(80);

  const edit = (categoryId: string | null, limit?: number, pct?: number) => {
    setScope(categoryId ?? WHOLE);
    setAmount(limit ? centsToInput(limit) : '');
    setAlertAt(pct ?? 80);
    setOpen(true);
  };
  const cents = parseUSDInput(amount);

  return (
    <Screen header={<TopBar title="Budgets" />} contentStyle={{ gap: 16, paddingBottom: 32 }}>
      <Text variant="small" tone="muted">
        Set a monthly limit for the whole workspace or for one category. We count what you paid this month plus what’s still due,
        and alert admins and finance at your chosen level and again at 100%. 📊
      </Text>
      <QueryState query={budgets}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              illustration="track"
              title="No budgets yet"
              message="A budget helps you spot a costly month before it happens."
              actionLabel={can.manageSubscriptions ? 'Set a budget' : undefined}
              onAction={can.manageSubscriptions ? () => edit(null) : undefined}
            />
          ) : (
            <View style={{ gap: 12 }}>
              {list.map((b) => (
                <Card key={b.id} style={{ gap: 10 }}>
                  <Pressable
                    accessibilityRole={can.manageSubscriptions ? 'button' : undefined}
                    accessibilityHint={can.manageSubscriptions ? 'Edit this budget' : undefined}
                    disabled={!can.manageSubscriptions}
                    onPress={() => edit(b.categoryId, b.monthlyLimitCents, b.alertAtPercent)}
                  >
                    <BudgetBar b={b} />
                  </Pressable>
                  {can.manageSubscriptions ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove the ${b.category?.name ?? 'workspace'} budget`}
                      onPress={() => remove.mutate(b.id, { onSuccess: () => toast.info('Budget removed') })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}
                    >
                      <Trash2 size={16} color={colors.red} />
                      <Text variant="smallStrong" tone="danger">
                        Remove
                      </Text>
                    </Pressable>
                  ) : null}
                </Card>
              ))}
              {can.manageSubscriptions ? (
                <Button variant="secondary" onPress={() => edit(null)}>
                  Add a budget
                </Button>
              ) : null}
            </View>
          )
        }
      </QueryState>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Monthly budget">
        <View style={{ gap: 16 }}>
          <Select
            label="Applies to"
            value={scope}
            onChange={setScope}
            options={[
              { value: WHOLE, label: 'Whole workspace' },
              ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Input label="Monthly limit (USD)" keyboardType="decimal-pad" placeholder="0.00" value={amount} onChangeText={setAmount} />
          <View style={{ gap: 8 }}>
            <Text variant="label">Alert me at</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {ALERT_CHOICES.map((p) => (
                <Chip key={p} label={`${p}%`} selected={alertAt === p} onPress={() => setAlertAt(p)} />
              ))}
            </View>
          </View>
          <Button
            full
            loading={save.isPending}
            disabled={!cents || cents <= 0}
            onPress={() =>
              save.mutate(
                { categoryId: scope === WHOLE ? null : scope, monthlyLimitCents: cents!, alertAtPercent: alertAt },
                {
                  onSuccess: () => {
                    setOpen(false);
                    toast.success('Budget saved ✅');
                  },
                  onError: (e) => toast.error('Could not save', e instanceof ApiError ? e.message : undefined),
                },
              )
            }
          >
            Save budget
          </Button>
        </View>
      </BottomSheet>
    </Screen>
  );
}
