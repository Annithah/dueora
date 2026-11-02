import { useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import {
  BarChart3,
  Bell,
  Building2,
  CircleHelp,
  LogOut,
  Moon,
  ReceiptText,
  ShieldCheck,
  Tag,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react-native';
import { View } from 'react-native';

import { PageHeader } from '@/components/layout/PageHeader';
import { Screen } from '@/components/layout/Screen';
import { Avatar, Card, ListItem, Switch, Text } from '@/components/ui';
import { signOut, useMe } from '@/features/auth/api';
import { ROLE_LABELS, useWorkspace } from '@/features/workspaces/api';
import { usePreferences } from '@/state/preferences';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

interface Item {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  href: Href;
  roles?: string[];
}

export default function MoreTab() {
  const { colors, scheme } = useTheme();
  const queryClient = useQueryClient();
  const me = useMe();
  const workspace = useWorkspace();
  const orgId = useSession((s) => s.activeOrgId);
  const setTheme = usePreferences((s) => s.setTheme);
  const role = me.data?.workspaces.find((w) => w.id === orgId)?.role;

  const items: Item[] = [
    { icon: UserRound, title: 'Profile', subtitle: 'Your details and password', href: '/profile' },
    {
      icon: Building2,
      title: 'Company info',
      subtitle: workspace.data?.name ?? 'Workspace settings',
      href: '/settings/company',
    },
    {
      icon: ReceiptText,
      title: 'Payment history',
      subtitle: 'Receipts and recorded payments',
      href: '/history',
    },
    {
      icon: BarChart3,
      title: 'Reports',
      subtitle: 'Spending and forecasts',
      href: '/reports',
      roles: ['ADMIN', 'FINANCE'],
    },
    {
      icon: UsersRound,
      title: 'Team & roles',
      subtitle: `${workspace.data?.memberCount ?? 1} member${workspace.data?.memberCount === 1 ? '' : 's'}`,
      href: '/team',
      roles: ['ADMIN', 'FINANCE', 'DEPARTMENT'],
    },
    {
      icon: Tag,
      title: 'Categories & projects',
      subtitle: 'Customise your workspace',
      href: '/settings/categories',
      roles: ['ADMIN', 'FINANCE', 'DEPARTMENT'],
    },
    {
      icon: Bell,
      title: 'Notifications',
      subtitle: 'Push, email, digest and quiet hours',
      href: '/settings/notifications',
    },
    {
      icon: ShieldCheck,
      title: 'Security',
      subtitle: 'Password and biometric lock',
      href: '/settings/security',
    },
  ].filter((i) => !i.roles || (role && i.roles.includes(role)));

  return (
    <Screen edges={['top']} contentStyle={{ gap: 18, paddingBottom: 32 }}>
      <PageHeader
        eyebrow="Workspace"
        title="More"
        right={
          me.data ? <Avatar name={me.data.name} imageUrl={me.data.avatarUrl} size={42} /> : null
        }
      />

      {me.data ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={me.data.name} imageUrl={me.data.avatarUrl} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{me.data.name}</Text>
            <Text variant="small" tone="muted" numberOfLines={1}>
              {me.data.email}
            </Text>
          </View>
          {role ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: colors.primarySoft,
              }}
            >
              <Text variant="captionStrong" tone="primary">
                {ROLE_LABELS[role]}
              </Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card padding={0} style={{ overflow: 'hidden' }}>
        {items.map((i, idx) => (
          <ListItem
            key={i.title}
            divider={idx > 0}
            icon={<i.icon size={19} color={colors.primaryStrong} />}
            title={i.title}
            subtitle={i.subtitle}
            onPress={() => router.push(i.href)}
          />
        ))}
        <ListItem
          divider
          icon={<Moon size={19} color={colors.primaryStrong} />}
          title="Dark mode"
          subtitle="Gentler in low light"
          trailing={
            <Switch
              accessibilityLabel="Dark mode"
              value={scheme === 'dark'}
              onValueChange={(on) => setTheme(on ? 'dark' : 'light')}
            />
          }
        />
      </Card>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <ListItem
          icon={<CircleHelp size={19} color={colors.primaryStrong} />}
          title="Help & support"
          subtitle="Guides and contact"
          onPress={() => router.push('/help')}
        />
        <ListItem
          divider
          destructive
          icon={<LogOut size={19} color={colors.red} />}
          title="Log out"
          onPress={() => void signOut(queryClient)}
        />
      </Card>
      <Text variant="caption" tone="muted" align="center">
        DueOra 1.0.0 · Your dues, on time.
      </Text>
    </Screen>
  );
}
