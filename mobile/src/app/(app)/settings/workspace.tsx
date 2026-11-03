import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Building2, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ApiError, api } from '@/api';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Avatar, BottomSheet, Button, Card, Input, ListItem, Segmented, Select, Text, toast } from '@/components/ui';
import { meKey } from '@/features/auth/api';
import { useWorkspace, workspaceKey, type Workspace } from '@/features/workspaces/api';
import { timezoneOptions } from '@/lib/locale';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

export default function WorkspaceSettings() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  const workspace = useWorkspace();
  const zones = useMemo(() => timezoneOptions(), []);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const isAdmin = workspace.data?.myRole === 'ADMIN';

  const patch = async (body: Partial<Pick<Workspace, 'name' | 'type' | 'timezone'>>, done = 'Saved') => {
    try {
      const ws = await api.patch<Workspace>('/workspaces/current', body);
      queryClient.setQueryData(workspaceKey(workspaceId), { ...workspace.data, ...ws });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meKey }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['subscriptions', workspaceId] }),
      ]);
      toast.success(done);
    } catch (err) {
      toast.error('Could not save', err instanceof ApiError ? err.message : undefined);
    }
  };

  const deleteWorkspace = async () => {
    try {
      await api.request('/workspaces/current', { method: 'DELETE', body: { confirmName: confirmName.trim() } });
      setDeleteOpen(false);
      await useSession.getState().setActiveWorkspace(null);
      await queryClient.invalidateQueries({ queryKey: meKey });
      router.replace('/');
      toast.info('Workspace deleted');
    } catch (err) {
      toast.error('Could not delete', err instanceof ApiError ? err.message : undefined);
    }
  };

  return (
    <Screen header={<TopBar title="Workspace" />} contentStyle={{ gap: 20, paddingBottom: 32 }}>
      <QueryState query={workspace}>
        {(ws) => (
          <>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Avatar name={ws.name} color={colors.primary} size={72} />
              <Text variant="small" tone="muted">
                {ws.memberCount} member{ws.memberCount === 1 ? '' : 's'} · {ws.companyCount} compan{ws.companyCount === 1 ? 'y' : 'ies'} ·{' '}
                {ws.subscriptionCount} subscription{ws.subscriptionCount === 1 ? '' : 's'}
              </Text>
            </View>

            <Card style={{ gap: 16 }}>
              <WorkspaceName key={ws.name} initial={ws.name} editable={isAdmin} onSave={(n) => void patch({ name: n }, 'Name updated')} />
              <View style={{ gap: 8 }}>
                <Text variant="label">Type</Text>
                <Segmented
                  accessibilityLabel="Workspace type"
                  value={ws.type}
                  onChange={(type) => (isAdmin ? void patch({ type }) : undefined)}
                  options={[
                    { value: 'COMPANY', label: 'Company' },
                    { value: 'PERSONAL', label: 'Personal' },
                  ]}
                />
              </View>
              <Select
                label="Timezone"
                value={ws.timezone}
                options={zones.some((z) => z.value === ws.timezone) ? zones : [{ value: ws.timezone, label: ws.timezone }, ...zones]}
                disabled={!isAdmin}
                onChange={(tz) => void patch({ timezone: tz }, 'Timezone updated — due dates and reminders follow it')}
              />
              <Text variant="small" tone="muted">
                {isAdmin
                  ? 'All amounts in DueOra are US dollars. “Today” and reminder times follow this timezone.'
                  : 'Only admins can change workspace settings.'}
              </Text>
            </Card>

            <Card padding={0} style={{ overflow: 'hidden' }}>
              <ListItem
                icon={<Building2 size={19} color={colors.primaryStrong} />}
                title="Companies"
                subtitle="Add and rename the companies in this workspace"
                onPress={() => router.push('/settings/companies')}
              />
            </Card>

            {isAdmin ? (
              <Card padding={0} style={{ overflow: 'hidden' }}>
                <ListItem
                  destructive
                  icon={<Trash2 size={19} color={colors.red} />}
                  title="Delete workspace"
                  subtitle="Permanently remove all data"
                  onPress={() => setDeleteOpen(true)}
                />
              </Card>
            ) : null}

            <BottomSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete this workspace?">
              <View style={{ gap: 14 }}>
                <Text variant="body" tone="muted">
                  Every subscription, payment and member link in {ws.name} will be permanently deleted. Type the workspace name to
                  confirm.
                </Text>
                <Input label="Workspace name" placeholder={ws.name} value={confirmName} onChangeText={setConfirmName} />
                <Button full variant="danger" disabled={confirmName.trim() !== ws.name} onPress={() => void deleteWorkspace()}>
                  Delete permanently
                </Button>
              </View>
            </BottomSheet>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function WorkspaceName({ initial, editable, onSave }: { initial: string; editable: boolean; onSave: (name: string) => void }) {
  const [name, setName] = useState(initial);
  return (
    <>
      <Input label="Workspace name" value={name} onChangeText={setName} editable={editable} />
      {editable && name.trim() && name.trim() !== initial ? (
        <Button variant="secondary" onPress={() => onSave(name.trim())}>
          Save name
        </Button>
      ) : null}
    </>
  );
}
