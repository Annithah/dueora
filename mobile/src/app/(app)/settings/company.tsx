import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Building2, ImagePlus, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import {
  Avatar,
  BottomSheet,
  Button,
  Card,
  Input,
  ListItem,
  SectionHeader,
  Select,
  Text,
  toast,
} from '@/components/ui';
import { ApiError, api } from '@/api';
import { meKey } from '@/features/auth/api';
import {
  useUploadLogo,
  useWorkspace,
  workspaceKey,
  type Workspace,
} from '@/features/workspaces/api';
import { CURRENCY_OPTIONS, timezoneOptions } from '@/lib/locale';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

export default function CompanySettings() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const orgId = useSession((s) => s.activeOrgId);
  const workspace = useWorkspace();
  const uploadLogo = useUploadLogo();
  const zones = useMemo(() => timezoneOptions(), []);
  const [rateFor, setRateFor] = useState<string | null>(null);
  const [rate, setRate] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const isAdmin = workspace.data?.myRole === 'ADMIN';
  const canRates = isAdmin || workspace.data?.myRole === 'FINANCE';

  const patch = async (body: Partial<Workspace>, done = 'Saved') => {
    try {
      const ws = await api.patch<Workspace>('/workspaces/current', body);
      queryClient.setQueryData(workspaceKey(orgId), { ...workspace.data, ...ws });
      await queryClient.invalidateQueries({ queryKey: meKey });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', orgId] });
      toast.success(done);
    } catch (err) {
      toast.error('Could not save', err instanceof ApiError ? err.message : undefined);
    }
  };

  const pickLogo = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (r.canceled || !r.assets[0]) return;
    uploadLogo.mutate(
      { uri: r.assets[0].uri, mimeType: r.assets[0].mimeType, fileName: r.assets[0].fileName },
      {
        onSuccess: () => toast.success('Logo updated'),
        onError: (e) =>
          toast.error('Could not upload the logo', e instanceof ApiError ? e.message : undefined),
      },
    );
  };

  const deleteWorkspace = async () => {
    try {
      await api.request('/workspaces/current', {
        method: 'DELETE',
        body: { confirmName: confirmName.trim() },
      });
      setDeleteOpen(false);
      await useSession.getState().setActiveOrg(null);
      await queryClient.invalidateQueries({ queryKey: meKey });
      router.replace('/');
      toast.info('Workspace deleted');
    } catch (err) {
      toast.error('Could not delete', err instanceof ApiError ? err.message : undefined);
    }
  };

  const saveRate = async () => {
    if (!rateFor) return;
    try {
      const ws = await api.request<Workspace>(`/workspaces/current/exchange-rates/${rateFor}`, {
        method: 'PUT',
        body: { rate: rate.trim() },
      });
      queryClient.setQueryData(workspaceKey(orgId), { ...workspace.data, ...ws });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', orgId] });
      setRateFor(null);
    } catch (err) {
      toast.error('Could not save the rate', err instanceof ApiError ? err.message : undefined);
    }
  };

  return (
    <Screen header={<TopBar title="Company info" />} contentStyle={{ gap: 20, paddingBottom: 32 }}>
      <QueryState query={workspace}>
        {(ws) => (
          <>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Avatar name={ws.name} imageUrl={ws.logoUrl} color={colors.primary} size={80} />
              {isAdmin ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void pickLogo()}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}
                >
                  <ImagePlus size={18} color={colors.primaryStrong} />
                  <Text variant="smallStrong" tone="primary">
                    {uploadLogo.isPending
                      ? 'Uploading…'
                      : ws.logoUrl
                        ? 'Change logo'
                        : 'Upload logo'}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <Card style={{ gap: 14 }}>
              <CompanyName
                key={ws.name}
                initial={ws.name}
                editable={isAdmin}
                onSave={(n) => void patch({ name: n }, 'Name updated')}
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Select
                  label="Default currency"
                  value={ws.defaultCurrency}
                  options={CURRENCY_OPTIONS}
                  disabled={!isAdmin}
                  onChange={(c) => void patch({ defaultCurrency: c })}
                />
                <Select
                  label="Timezone"
                  value={ws.timezone}
                  options={
                    zones.some((z) => z.value === ws.timezone)
                      ? zones
                      : [{ value: ws.timezone, label: ws.timezone }, ...zones]
                  }
                  disabled={!isAdmin}
                  onChange={(tz) =>
                    void patch({ timezone: tz }, 'Timezone updated — reminders follow it')
                  }
                />
              </View>
              {!isAdmin ? (
                <Text variant="small" tone="muted">
                  Only admins can change company info.
                </Text>
              ) : null}
            </Card>

            <View>
              <SectionHeader title="Exchange rates" />
              <Card padding={0} style={{ overflow: 'hidden' }}>
                {CURRENCY_OPTIONS.filter((c) => c.value !== ws.defaultCurrency).map((c, i) => {
                  const current = ws.exchangeRates.find((r) => r.fromCurrency === c.value);
                  return (
                    <ListItem
                      key={c.value}
                      divider={i > 0}
                      title={`1 ${c.value} = ${current ? `${current.rate} ${ws.defaultCurrency}` : '—'}`}
                      subtitle={c.description}
                      onPress={
                        canRates
                          ? () => {
                              setRateFor(c.value);
                              setRate(current?.rate ?? '');
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </Card>
              <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
                Used to show one combined total on the dashboard and in reports. Amounts are always
                kept in their own currency.
              </Text>
            </View>

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

            <BottomSheet
              visible={deleteOpen}
              onClose={() => setDeleteOpen(false)}
              title="Delete this workspace?"
            >
              <Text variant="body" tone="muted">
                Every payment, record, receipt and member link in {ws.name} will be permanently
                deleted. Type the workspace name to confirm.
              </Text>
              <Input
                label="Workspace name"
                placeholder={ws.name}
                value={confirmName}
                onChangeText={setConfirmName}
              />
              <Button
                full
                variant="danger"
                disabled={confirmName.trim() !== ws.name}
                onPress={() => void deleteWorkspace()}
              >
                Delete permanently
              </Button>
            </BottomSheet>

            <BottomSheet
              visible={!!rateFor}
              onClose={() => setRateFor(null)}
              title={`${rateFor} → ${ws.defaultCurrency}`}
            >
              <Input
                label={`1 ${rateFor} equals how many ${ws.defaultCurrency}?`}
                value={rate}
                onChangeText={setRate}
                keyboardType="decimal-pad"
                placeholder="e.g. 0.00069"
              />
              <Button
                full
                disabled={!/^\d+(\.\d+)?$/.test(rate.trim())}
                onPress={() => void saveRate()}
              >
                Save rate
              </Button>
            </BottomSheet>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function CompanyName({
  initial,
  editable,
  onSave,
}: {
  initial: string;
  editable: boolean;
  onSave: (name: string) => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState(initial);
  return (
    <>
      <Input
        label="Company name"
        icon={<Building2 size={18} color={colors.muted} />}
        value={name}
        onChangeText={setName}
        editable={editable}
      />
      {editable && name.trim() && name.trim() !== initial ? (
        <Button variant="secondary" onPress={() => onSave(name.trim())}>
          Save name
        </Button>
      ) : null}
    </>
  );
}
