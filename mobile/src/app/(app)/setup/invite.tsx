import { router } from 'expo-router';
import { Mail, Plus, Trash2, UsersRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Button, FormMessage, Input, Select, Text, toast } from '@/components/ui';
import { ApiError } from '@/api';
import type { Role } from '@/features/auth/api';
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  useSendInvite,
  useWorkspace,
} from '@/features/workspaces/api';
import { useTheme } from '@/theme';

interface Row {
  key: number;
  email: string;
  role: Role;
  departmentId: string | null;
}

const ROLE_OPTIONS = (['FINANCE', 'DEPARTMENT', 'EMPLOYEE', 'ADMIN'] as Role[]).map((r) => ({
  value: r,
  label: ROLE_LABELS[r],
  description: ROLE_DESCRIPTIONS[r],
}));

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function InviteTeam() {
  const { colors } = useTheme();
  const workspace = useWorkspace();
  const send = useSendInvite();
  const [rows, setRows] = useState<Row[]>([
    { key: 1, email: '', role: 'FINANCE', departmentId: null },
  ]);
  const [error, setError] = useState<string | null>(null);
  const departments = (workspace.data?.departments ?? []).map((d) => ({
    value: d.id,
    label: d.name,
  }));

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const done = () => router.replace('/');

  const submit = async () => {
    setError(null);
    const filled = rows.filter((r) => r.email.trim());
    if (filled.length === 0) return done();
    const bad = filled.find((r) => !EMAIL.test(r.email.trim()));
    if (bad) return setError(`"${bad.email}" doesn't look like an email address`);
    if (filled.some((r) => r.role === 'DEPARTMENT' && !r.departmentId)) {
      return setError(
        'Department officers need a department. Create departments in Team & roles, or pick another role.',
      );
    }
    try {
      for (const r of filled)
        await send.mutateAsync({
          email: r.email.trim(),
          role: r.role,
          departmentId: r.departmentId,
        });
      toast.success(
        filled.length === 1 ? 'Invitation sent' : `${filled.length} invitations sent`,
        'They’ll get an email to join.',
      );
      done();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the invitations');
    }
  };

  return (
    <Screen
      header={
        <TopBar
          title="Invite your team"
          onBack={done}
          action={
            <Button variant="ghost" onPress={done}>
              Skip
            </Button>
          }
        />
      }
      footer={
        <Button full size="lg" loading={send.isPending} onPress={() => void submit()}>
          Send invite & continue
        </Button>
      }
    >
      <View
        style={{
          width: 62,
          height: 62,
          borderRadius: 20,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <UsersRound size={27} color={colors.primaryStrong} />
      </View>
      <View style={{ gap: 6 }}>
        <Text variant="display" accessibilityRole="header">
          Better together
        </Text>
        <Text variant="body" tone="muted">
          Add teammates now, or invite them later from settings.
        </Text>
      </View>

      <FormMessage message={error} />

      {rows.map((row, i) => (
        <View key={row.key} style={{ gap: 12 }}>
          {i > 0 ? <View style={{ height: 1, backgroundColor: colors.line }} /> : null}
          <Input
            label={`Email address${rows.length > 1 ? ` ${i + 1}` : ''}`}
            placeholder="name@company.com"
            icon={<Mail size={18} color={colors.muted} />}
            keyboardType="email-address"
            autoCapitalize="none"
            value={row.email}
            onChangeText={(email) => update(row.key, { email })}
          />
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
            <Select
              label="Role"
              value={row.role}
              options={ROLE_OPTIONS}
              onChange={(role) => update(row.key, { role })}
            />
            {rows.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove person ${i + 1}`}
                onPress={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <Trash2 size={20} color={colors.red} />
              </Pressable>
            ) : null}
          </View>
          {row.role === 'DEPARTMENT' && departments.length > 0 ? (
            <Select
              label="Department"
              value={row.departmentId}
              options={departments}
              onChange={(departmentId) => update(row.key, { departmentId })}
            />
          ) : null}
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        onPress={() =>
          setRows((rs) => [
            ...rs,
            { key: Date.now(), email: '', role: 'EMPLOYEE', departmentId: null },
          ])
        }
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        <Plus size={18} color={colors.primaryStrong} />
        <Text variant="bodyStrong" tone="primary">
          Add another person
        </Text>
      </Pressable>
    </Screen>
  );
}
