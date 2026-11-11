import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Brain, Sparkles, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ApiError, api } from '@/api';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Button, Card, Input, ListItem, SectionHeader, Switch, Text, toast } from '@/components/ui';
import { useAiStatus, useMemory, useMemoryMutations } from '@/features/ai/api';
import { usePermissions } from '@/features/workspaces/api';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

/** Settings → DueOra AI: switch it on/off (admins) and manage "What the AI knows". */
export default function AiSettings() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  const can = usePermissions();
  const status = useAiStatus();
  const memory = useMemory();
  const { add, remove } = useMemoryMutations();
  const [fact, setFact] = useState('');

  const toggle = async (on: boolean) => {
    try {
      await api.patch('/workspaces/current', { aiEnabled: on });
      await queryClient.invalidateQueries({ queryKey: ['ai-status', workspaceId] });
    } catch (e) {
      toast.error('Could not save', e instanceof ApiError ? e.message : undefined);
    }
  };

  return (
    <Screen header={<TopBar title="DueOra AI" />} contentStyle={{ gap: 18, paddingBottom: 32 }}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Sparkles size={20} color={colors.primaryStrong} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            Your DueOra assistant
          </Text>
          {can.manageWorkspace ? (
            <Switch
              accessibilityLabel="DueOra AI on or off"
              value={!!status.data?.enabled}
              onValueChange={(v) => void toggle(v)}
            />
          ) : null}
        </View>
        <Text variant="small" tone="muted">
          It answers from this workspace’s data only, never sees subscription keys, and always asks
          you to confirm before changing anything.{' '}
          {status.data && !status.data.available ? 'It isn’t connected on the server yet.' : ''}
        </Text>
        <Button variant="secondary" onPress={() => router.push('/ai')}>
          Open DueOra AI
        </Button>
      </Card>

      <View>
        <SectionHeader title="What the AI knows" />
        <Text variant="small" tone="muted" style={{ marginBottom: 10 }}>
          Facts your team taught it, like a nickname for a company or how you usually pay. They
          apply to everyone in this workspace.
        </Text>
        <Card padding={0} style={{ overflow: 'hidden' }}>
          {(memory.data ?? []).length === 0 ? (
            <Text variant="small" tone="muted" style={{ padding: 14 }}>
              Nothing yet. Try “We always pay by bank transfer.” 🧠
            </Text>
          ) : null}
          {(memory.data ?? []).map((m, i) => (
            <ListItem
              key={m.id}
              divider={i > 0}
              icon={<Brain size={18} color={colors.primaryStrong} />}
              title={m.text}
              trailing={
                can.manageSubscriptions ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Forget this"
                    hitSlop={12}
                    onPress={() => remove.mutate(m.id)}
                  >
                    <Trash2 size={18} color={colors.red} />
                  </Pressable>
                ) : undefined
              }
            />
          ))}
        </Card>
      </View>

      {can.manageSubscriptions ? (
        <View style={{ gap: 10 }}>
          <Input
            label="Teach it something"
            placeholder="e.g. Only remind me for amounts over $50"
            value={fact}
            onChangeText={setFact}
          />
          <Button
            loading={add.isPending}
            disabled={fact.trim().length < 3}
            onPress={() =>
              add.mutate(fact.trim(), {
                onSuccess: () => {
                  setFact('');
                  toast.success('Saved 🧠');
                },
                onError: (e) =>
                  toast.error('Could not save', e instanceof ApiError ? e.message : undefined),
              })
            }
          >
            Save
          </Button>
        </View>
      ) : null}
    </Screen>
  );
}
