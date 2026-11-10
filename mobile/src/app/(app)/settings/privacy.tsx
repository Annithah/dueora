import { FileJson, FileSpreadsheet, LogOut, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/api';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { BottomSheet, Button, Card, FormMessage, Input, ListItem, PasswordInput, SectionHeader, Text, toast } from '@/components/ui';
import { useDeleteAccount, useLogoutEverywhere } from '@/features/account/api';
import { downloadAndShare } from '@/features/insights/api';
import { usePermissions } from '@/features/workspaces/api';
import { useTheme } from '@/theme';

/** Settings → Data & privacy: export, sign out everywhere, delete account. */
export default function PrivacyScreen() {
  const { colors } = useTheme();
  const can = usePermissions();
  const logoutAll = useLogoutEverywhere();
  const deleteAccount = useDeleteAccount();
  const [exporting, setExporting] = useState<'json' | 'xlsx' | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const exportAs = async (format: 'json' | 'xlsx') => {
    setExporting(format);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadAndShare(
        `/workspaces/current/export?format=${format}`,
        `dueora-export-${stamp}.${format}`,
        format === 'json' ? 'application/json' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } catch {
      toast.error('Could not export', 'Check your connection and try again.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <Screen header={<TopBar title="Data & privacy" />} contentStyle={{ gap: 20, paddingBottom: 32 }}>
      <Text variant="small" tone="muted">
        Your data belongs to you. DueOra never sells it, and subscription keys stay encrypted — exports only include them masked. 🔒
      </Text>

      {can.manageSubscriptions ? (
        <View>
          <SectionHeader title="Export this workspace" />
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <ListItem
              icon={<FileSpreadsheet size={19} color={colors.primaryStrong} />}
              title={exporting === 'xlsx' ? 'Preparing…' : 'Export as Excel'}
              subtitle="Subscriptions, payments, companies, budgets"
              onPress={() => void exportAs('xlsx')}
            />
            <ListItem
              divider
              icon={<FileJson size={19} color={colors.primaryStrong} />}
              title={exporting === 'json' ? 'Preparing…' : 'Export as JSON'}
              subtitle="Everything, machine-readable"
              onPress={() => void exportAs('json')}
            />
          </Card>
        </View>
      ) : null}

      <View>
        <SectionHeader title="Your account" />
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <ListItem
            icon={<LogOut size={19} color={colors.primaryStrong} />}
            title="Log out from all devices"
            subtitle="Signs you out on every phone, including this one"
            onPress={() =>
              logoutAll.mutate(undefined, {
                onError: (e) => toast.error('Could not sign out everywhere', e instanceof ApiError ? e.message : undefined),
              })
            }
          />
          <ListItem
            divider
            destructive
            icon={<Trash2 size={19} color={colors.red} />}
            title="Delete my account"
            subtitle="Permanently removes your personal data"
            onPress={() => setDeleteOpen(true)}
          />
        </Card>
      </View>

      <BottomSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?">
        <View style={{ gap: 14 }}>
          <Text variant="small">
            This can’t be undone. Workspaces only you belong to are deleted with all their data. Shared workspaces stay for your
            team — if you were their only admin, the longest-standing member becomes admin.
          </Text>
          <FormMessage message={error} />
          <PasswordInput label="Your password" value={password} onChangeText={setPassword} />
          <Input label='Type DELETE to confirm' autoCapitalize="characters" value={confirm} onChangeText={setConfirm} />
          <Button
            full
            variant="danger"
            loading={deleteAccount.isPending}
            disabled={!password || confirm.trim() !== 'DELETE'}
            onPress={() => {
              setError(null);
              deleteAccount.mutate(password, {
                onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not delete your account'),
              });
            }}
          >
            Delete my account
          </Button>
        </View>
      </BottomSheet>
    </Screen>
  );
}
