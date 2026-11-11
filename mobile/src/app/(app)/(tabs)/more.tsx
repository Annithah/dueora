import { useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import {
  BarChart3,
  Bell,
  Building2,
  CircleHelp,
  Database,
  Info,
  Languages,
  Sparkles,
  FileUp,
  PiggyBank,
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
import { APP_VERSION } from '@/features/account/api';
import { useLocale, useTranslation } from '@/i18n';
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
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const me = useMe();
  const workspace = useWorkspace();
  const workspaceId = useSession((s) => s.activeWorkspaceId);
  const theme = usePreferences((s) => s.theme);
  const locale = useLocale((s) => s.locale);
  const { t } = useTranslation();
  const role = me.data?.workspaces.find((w) => w.id === workspaceId)?.role;

  const allItems: Item[] = [
    { icon: UserRound, title: t('more.profile'), subtitle: t('more.profileSub'), href: '/profile' },
    { icon: Building2, title: t('more.workspace'), subtitle: workspace.data?.name ?? 'Name, type and timezone', href: '/settings/workspace' },
    {
      icon: Store,
      title: t('more.companies'),
      subtitle: `${workspace.data?.companyCount ?? 0} compan${workspace.data?.companyCount === 1 ? 'y' : 'ies'}`,
      href: '/settings/companies',
    },
    { icon: Tag, title: t('more.categories'), subtitle: t('more.categoriesSub'), href: '/settings/categories' },
    { icon: ReceiptText, title: t('more.history'), subtitle: t('more.historySub'), href: '/history' },
    { icon: BarChart3, title: t('more.reports'), subtitle: t('more.reportsSub'), href: '/reports' },
    { icon: PiggyBank, title: t('more.budgets'), subtitle: t('more.budgetsSub'), href: '/settings/budgets' },
    { icon: FileUp, title: t('more.import'), subtitle: t('more.importSub'), href: '/settings/import', roles: ['ADMIN', 'FINANCE'] },
    {
      icon: UsersRound,
      title: t('more.team'),
      subtitle: `${workspace.data?.memberCount ?? 1} member${workspace.data?.memberCount === 1 ? '' : 's'}`,
      href: '/team',
    },
    { icon: Bell, title: t('more.notifications'), subtitle: t('more.notificationsSub'), href: '/settings/notifications' },
    { icon: ShieldCheck, title: t('more.security'), subtitle: t('more.securitySub'), href: '/settings/security' },
    { icon: Palette, title: t('more.appearance'), subtitle: t(`theme.${theme}`), href: '/settings/appearance' },
    { icon: Languages, title: t('more.language'), subtitle: t(`language.${locale}`), href: '/settings/language' },
    { icon: Sparkles, title: t('more.ai'), subtitle: t('more.aiSub'), href: '/settings/ai' },
    { icon: Database, title: t('more.privacy'), subtitle: t('more.privacySub'), href: '/settings/privacy' },
  ];
  const items = allItems.filter((i) => !i.roles || (role && i.roles.includes(role)));

  return (
    <Screen edges={['top']} contentStyle={{ gap: 18, paddingBottom: 32 }}>
      <PageHeader
        eyebrow={t('more.eyebrow')}
        title={t('more.title')}
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
          title={t('more.help')}
          subtitle={t('more.helpSub')}
          onPress={() => router.push('/help')}
        />
        <ListItem
          divider
          icon={<Info size={19} color={colors.primaryStrong} />}
          title={t('more.about')}
          subtitle={`DueOra ${APP_VERSION}`}
          onPress={() => router.push('/settings/about')}
        />
        <ListItem
          divider
          destructive
          icon={<LogOut size={19} color={colors.red} />}
          title={t('more.logout')}
          onPress={() => void signOut(queryClient)}
        />
      </Card>
      <Text variant="caption" tone="muted" align="center">
        {t('more.version', { version: APP_VERSION })}
      </Text>
    </Screen>
  );
}
