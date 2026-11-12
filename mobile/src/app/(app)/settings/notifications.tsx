import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  BellOff,
  BellRing,
  CalendarRange,
  Clock,
  Inbox,
  Layers,
  Mail,
  Moon,
  PieChart,
  Send,
  Smartphone,
  UsersRound,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AppState, Linking, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import {
  Button,
  Card,
  Chip,
  ListItem,
  SectionHeader,
  Select,
  Skeleton,
  Switch,
  Text,
  toast,
} from '@/components/ui';
import { ApiError, api } from '@/api';
import { useCompanies } from '@/features/catalog/api';
import { usePrefs, useSendTest, useUpdatePrefs } from '@/features/notifications/api';
import { permissionState, type PermissionState } from '@/features/notifications/push';
import {
  REMINDER_CHOICES,
  hourLabel,
  isChoiceSelected,
  toggleChoice,
} from '@/features/notifications/reminderOptions';
import { workspaceKey, useWorkspace, type Workspace } from '@/features/workspaces/api';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6).map((h) => ({
  value: String(h),
  label: hourLabel(h),
}));
const QUIET_START = [20, 21, 22, 23].map((h) => ({ value: String(h * 60), label: hourLabel(h) }));
const QUIET_END = [5, 6, 7, 8].map((h) => ({ value: String(h * 60), label: hourLabel(h) }));

export default function NotificationSettings() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  const prefs = usePrefs();
  const companies = useCompanies();
  const updatePrefs = useUpdatePrefs();
  const workspace = useWorkspace();
  const sendTest = useSendTest();
  const [osPermission, setOsPermission] = useState<PermissionState>('undetermined');
  const isAdmin = workspace.data?.myRole === 'ADMIN';

  useEffect(() => {
    const check = () => void permissionState().then(setOsPermission);
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);

  const updateWorkspace = async (patch: Partial<Workspace>) => {
    try {
      const ws = await api.patch<Workspace>('/workspaces/current', patch);
      queryClient.setQueryData(workspaceKey(workspaceId), { ...workspace.data, ...ws });
    } catch (err) {
      toast.error('Could not save', err instanceof ApiError ? err.message : undefined);
    }
  };

  const setPref = (patch: Parameters<typeof updatePrefs.mutate>[0]) =>
    updatePrefs.mutate(patch, { onError: () => toast.error('Could not save your preference') });

  if (prefs.isPending || workspace.isPending) {
    return (
      <Screen header={<TopBar title="Notifications" />}>
        <Skeleton height={180} radius={16} />
        <Skeleton height={220} radius={16} />
      </Screen>
    );
  }

  const p = prefs.data;
  const ws = workspace.data;
  const quietOn = ws?.quietHoursStart != null && ws?.quietHoursEnd != null;

  return (
    <Screen header={<TopBar title="Notifications" />}>
      {osPermission !== 'granted' ? (
        <Card tone="accent" style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <BellOff size={22} color={colors.amberText} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">Push is off on this phone</Text>
            <Text variant="small" tone="muted">
              Turn it on so reminders reach you even when DueOra is closed.
            </Text>
          </View>
          <Button
            variant="secondary"
            onPress={() =>
              osPermission === 'denied'
                ? void Linking.openSettings()
                : router.push('/notifications-permission')
            }
          >
            Turn on
          </Button>
        </Card>
      ) : null}

      <View>
        <SectionHeader title="How we reach you" />
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <ListItem
            icon={<Smartphone size={19} color={colors.primaryStrong} />}
            title="Push notifications"
            subtitle="Reminders on this phone"
            trailing={
              <Switch
                accessibilityLabel="Push notifications"
                value={!!p?.pushEnabled}
                onValueChange={(v) => setPref({ pushEnabled: v })}
              />
            }
          />
          <ListItem
            divider
            icon={<Mail size={19} color={colors.primaryStrong} />}
            title="Email"
            subtitle="Key moments, and whenever push can't reach you"
            trailing={
              <Switch
                accessibilityLabel="Email reminders"
                value={!!p?.emailEnabled}
                onValueChange={(v) => setPref({ emailEnabled: v })}
              />
            }
          />
          <ListItem
            divider
            icon={<Inbox size={19} color={colors.primaryStrong} />}
            title="In-app alerts"
            subtitle="The Alerts list behind the bell"
            trailing={
              <Switch
                accessibilityLabel="In-app alerts"
                value={!!p?.inAppEnabled}
                onValueChange={(v) => setPref({ inAppEnabled: v })}
              />
            }
          />
          <ListItem
            divider
            icon={<Layers size={19} color={colors.primaryStrong} />}
            title="Group busy days"
            subtitle="One summary instead of 4+ separate messages"
            trailing={
              <Switch
                accessibilityLabel="Digest"
                value={!!p?.digestEnabled}
                onValueChange={(v) => setPref({ digestEnabled: v })}
              />
            }
          />
        </Card>
      </View>

      <View>
        <SectionHeader title="What we tell you about" />
        <Card padding={0} style={{ overflow: 'hidden' }}>
          {(
            [
              {
                key: 'weeklySummary',
                icon: CalendarRange,
                title: 'Weekly digest',
                subtitle: 'Mondays: the week ahead',
              },
              {
                key: 'monthlySummary',
                icon: PieChart,
                title: 'Monthly summary',
                subtitle: 'The 1st: last month and what’s coming',
              },
              {
                key: 'budgetAlerts',
                icon: Layers,
                title: 'Budget alerts',
                subtitle: 'When a monthly budget is nearly used',
              },
              {
                key: 'teamActivity',
                icon: UsersRound,
                title: 'Team activity',
                subtitle: 'New members and role changes (admins)',
              },
            ] as {
              key: 'weeklySummary' | 'monthlySummary' | 'budgetAlerts' | 'teamActivity';
              icon: LucideIcon;
              title: string;
              subtitle: string;
            }[]
          ).map((row, i) => (
            <ListItem
              key={row.key}
              divider={i > 0}
              icon={<row.icon size={19} color={colors.primaryStrong} />}
              title={row.title}
              subtitle={row.subtitle}
              trailing={
                <Switch
                  accessibilityLabel={row.title}
                  value={!!p?.[row.key]}
                  onValueChange={(v) => setPref({ [row.key]: v })}
                />
              }
            />
          ))}
        </Card>
      </View>

      {(companies.data?.length ?? 0) > 1 && p ? (
        <View>
          <SectionHeader title="Companies" />
          <Text variant="small" tone="muted" style={{ marginBottom: 8 }}>
            Choose what you hear about each company. You only ever get notifications for companies you can see.
          </Text>
          <Card padding={0} style={{ overflow: 'hidden' }}>
            {(companies.data ?? []).map((c, i) => {
              const cp = p.companies?.[c.id] ?? {};
              const set = (kind: 'reminders' | 'events' | 'summaries', on: boolean) => {
                const next = { ...(p.companies ?? {}), [c.id]: { ...cp, [kind]: on } };
                setPref({ companies: next });
              };
              return (
                <View key={c.id} style={{ padding: 12, gap: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color }} />
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {c.name}
                    </Text>
                    {cp.reminders === false && cp.events === false && cp.summaries === false ? (
                      <Text variant="captionStrong" tone="muted">
                        Muted
                      </Text>
                    ) : null}
                  </View>
                  {(
                    [
                      ['reminders', 'Due-date reminders'],
                      ['events', 'Payments and price changes'],
                      ['summaries', 'Weekly and monthly summaries'],
                    ] as const
                  ).map(([kind, label]) => (
                    <View key={kind} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 36 }}>
                      <Text variant="small" style={{ flex: 1 }}>
                        {label}
                      </Text>
                      <Switch accessibilityLabel={`${c.name}: ${label}`} value={cp[kind] !== false} onValueChange={(v) => set(kind, v)} />
                    </View>
                  ))}
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}

      <View>
        <SectionHeader title="When" />
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
            <Clock size={20} color={colors.primaryStrong} style={{ marginBottom: 14 }} />
            <Select
              label="Daily reminder time"
              value={String(ws?.reminderHour ?? 9)}
              options={HOURS}
              disabled={!isAdmin}
              onChange={(v) => void updateWorkspace({ reminderHour: Number(v) })}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Moon size={20} color={colors.primaryStrong} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Quiet hours</Text>
              <Text variant="small" tone="muted">
                Messages wait until quiet hours end
              </Text>
            </View>
            <Switch
              accessibilityLabel="Quiet hours"
              disabled={!isAdmin}
              value={quietOn}
              onValueChange={(on) =>
                void updateWorkspace(
                  on
                    ? { quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60 }
                    : { quietHoursStart: null, quietHoursEnd: null },
                )
              }
            />
          </View>
          {quietOn ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Select
                label="From"
                value={String(ws!.quietHoursStart)}
                options={QUIET_START}
                disabled={!isAdmin}
                onChange={(v) =>
                  void updateWorkspace({
                    quietHoursStart: Number(v),
                    quietHoursEnd: ws!.quietHoursEnd,
                  })
                }
              />
              <Select
                label="Until"
                value={String(ws!.quietHoursEnd)}
                options={QUIET_END}
                disabled={!isAdmin}
                onChange={(v) =>
                  void updateWorkspace({
                    quietHoursStart: ws!.quietHoursStart,
                    quietHoursEnd: Number(v),
                  })
                }
              />
            </View>
          ) : null}
          {!isAdmin ? (
            <Text variant="small" tone="muted">
              Timing is set for the whole workspace by an admin.
            </Text>
          ) : null}
        </Card>
      </View>

      <View>
        <SectionHeader title="Default reminders" />
        <Card style={{ gap: 12 }}>
          <Text variant="small" tone="muted">
            New bills start with these. You can change them per bill.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {REMINDER_CHOICES.map((c) => (
              <Chip
                key={c.label}
                label={c.label}
                showCheck
                disabled={!isAdmin}
                selected={isChoiceSelected(ws?.defaultReminderOffsets ?? [], c)}
                onPress={() =>
                  void updateWorkspace({
                    defaultReminderOffsets: toggleChoice(ws?.defaultReminderOffsets ?? [], c),
                  })
                }
              />
            ))}
          </View>
        </Card>
      </View>

      <Button
        variant="secondary"
        icon={<Send size={18} color={colors.primaryStrong} />}
        loading={sendTest.isPending}
        onPress={() =>
          sendTest.mutate(undefined, {
            onSuccess: (r) =>
              toast.success(
                'Test sent 🔔',
                r.channels.includes('PUSH')
                  ? 'A push, an email and an alert in the Alerts list are on their way.'
                  : 'No phone is registered yet, so we sent an email and an in-app alert.',
              ),
            onError: (err) =>
              toast.error(
                'Could not send a test',
                err instanceof ApiError ? err.message : undefined,
              ),
          })
        }
      >
        Send test notification
      </Button>
      <View
        style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}
      >
        <BellRing size={14} color={colors.muted} />
        <Text variant="caption" tone="muted">
          Muted a bill? Unmute it from its detail screen.
        </Text>
      </View>
    </Screen>
  );
}
