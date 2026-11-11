import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ArrowRight, Building2, Store, UserRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/api';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Button, ChoiceCard, FormMessage, Input, Select, Text } from '@/components/ui';
import { signOut, useMe } from '@/features/auth/api';
import { useCreateWorkspace } from '@/features/workspaces/api';
import { timezoneOptions } from '@/lib/locale';
import { useTheme } from '@/theme';

type Kind = 'COMPANY' | 'PERSONAL';

export default function WorkspaceSetup() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const me = useMe();
  const create = useCreateWorkspace();
  const zones = useMemo(() => timezoneOptions(), []);

  const [kind, setKind] = useState<Kind>('COMPANY');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [timezone, setTimezone] = useState(zones.find((z) => z.value === 'Africa/Kigali')?.value ?? zones[0]!.value);
  const [error, setError] = useState<string | null>(null);

  const firstName = me.data?.name.split(' ')[0] ?? '';
  const workspaceName = kind === 'PERSONAL' && !name.trim() ? `${firstName || 'My'}’s bills` : name.trim();

  const submit = async () => {
    setError(null);
    if (kind === 'COMPANY' && !workspaceName) return setError('Give your workspace a name');
    try {
      await create.mutateAsync({
        name: workspaceName,
        type: kind,
        timezone,
        firstCompanyName: company.trim() || undefined,
      });
      router.replace(kind === 'COMPANY' ? '/setup/invite' : '/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the workspace');
    }
  };

  const hasWorkspace = (me.data?.workspaces.length ?? 0) > 0;

  return (
    <Screen
      header={<TopBar title="Workspace setup" onBack={() => (hasWorkspace ? router.back() : void signOut(queryClient))} />}
      footer={
        <Button
          full
          size="lg"
          loading={create.isPending}
          onPress={() => void submit()}
          trailingIcon={<ArrowRight size={18} color={colors.onPrimary} />}
        >
          Continue
        </Button>
      }
    >
      <View style={{ gap: 4 }}>
        <Text variant="section" accessibilityRole="header">
          How will you use DueOra?
        </Text>
        <Text variant="small" tone="muted">
          You can change all of this later.
        </Text>
      </View>

      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 12 }}>
        <ChoiceCard label="Company" icon={(c) => <Building2 size={24} color={c} />} selected={kind === 'COMPANY'} onPress={() => setKind('COMPANY')} />
        <ChoiceCard label="Personal" icon={(c) => <UserRound size={24} color={c} />} selected={kind === 'PERSONAL'} onPress={() => setKind('PERSONAL')} />
      </View>

      <FormMessage message={error} />

      <Input
        label={kind === 'COMPANY' ? 'Workspace name' : 'Workspace name (optional)'}
        placeholder={kind === 'COMPANY' ? 'e.g. your group or business' : `${firstName || 'My'}’s bills`}
        icon={<Building2 size={18} color={colors.muted} />}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />

      <Input
        label="First company"
        placeholder={kind === 'PERSONAL' ? 'Personal' : workspaceName || 'Company name'}
        hint="Every bill belongs to a company. Add more later — e.g. one per brand or website."
        icon={<Store size={18} color={colors.muted} />}
        value={company}
        onChangeText={setCompany}
        autoCapitalize="words"
      />

      <Select label="Timezone" value={timezone} options={zones} onChange={setTimezone} />
      <Text variant="small" tone="muted">
        Reminders go out at 09:00 in this timezone. All amounts are in US dollars.
      </Text>
    </Screen>
  );
}
