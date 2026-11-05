import { useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import {
  BarChart3,
  Bell,
  Building2,
  CircleHelp,
  LogOut,
  Palette,
  ReceiptText,
  ShieldCheck,
  Store,
  Tag,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react-native';
import { View } from 'react-native';

import { PageHeader } from '@/components/layout/PageHeader';
import { Screen } from '@/components/layout/Screen';
import { Avatar, Card, ListItem, Text } from '@/components/ui';
import { signOut, useMe } from '@/features/auth/api';
import { ROLE_LABELS, useWorkspace } from '@/features/workspaces/api';
import { usePreferences } from '@/state/preferences';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

const THEME_LABELS = { light: 'Light', dark: 'Dark', system: 'Match phone' } as const;

interface Item {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  href: Href;
  roles?: string[];
}

export default function MoreTab() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const me = useMe();
  const workspace = useWorkspace();
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  const theme = usePreferences((s) => s.theme);
  const role = me.data?.workspaces.find((w) => w.id === workspaceId)?.role;

  const allItems: Item[] = [
    { icon: UserRound, title: 'Profile', subtitle: 'Your name and password', href: '/profile' },
    { icon: Building2, title: 'Workspace', subtitle: workspace.data?.name ?? 'Name, type and timezone', href: '/settings/workspace' },
    {
      icon: Store,
      title: 'Companies',
      subtitle: `${workspace.data?.companyCount ?? 0} compan${workspace.data?.companyCount === 1 ? 'y' : 'ies'}`,
      href: '/settings/companies',
    },
    { icon: Tag, title: 'Categories', subtitle: 'Defaults and your own', href: '/settings/categories' },
    { icon: ReceiptText, title: 'Payment history', subtitle: 'Every payment you’ve recorded', href: '/history' },
    { icon: BarChart3, title: 'Reports', subtitle: 'Spending, forecasts, PDF & Excel', href: '/reports' },
    {
      icon: UsersRound,
      title: 'Team & roles',
      subtitle: `${workspace.data?.memberCount ?? 1} member${workspace.data?.memberCount === 1 ? '' : 's'}`,
      href: '/team',
    },
    { icon: Bell, title: 'Notifications', subtitle: 'Push, email, digest and quiet hours', href: '/settings/notifications' },
    { icon: ShieldCheck, title: 'Security', subtitle: 'Password and biometric lock', href: '/settings/security' },
    { icon: Palette, title: 'Appearance', subtitle: THEME_LABELS[theme], href: '/settings/appearance' },
  ];
  const items = allItems.filter((i) => !i.roles || (role && i.roles.includes(role)));

  return (
    <Screen edges={['top']} contentStyle={{ gap: 18, paddingBottom: 32 }}>
      <PageHeader
        eyebrow="Workspace"
        title="More"
        right={
          me.data ? <Avatar name={me.data.name} size={42} /> : null
        }
      />

      {me.data ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={me.data.name} size={52} />
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
