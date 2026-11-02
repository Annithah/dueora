import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { ArrowRight, Building2, ImagePlus, UserRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Button, ChoiceCard, FormMessage, Input, Select, Text } from '@/components/ui';
import { ApiError } from '@/api';
import { signOut, useMe } from '@/features/auth/api';
import { useCreateWorkspace, useUploadLogo } from '@/features/workspaces/api';
import { CURRENCY_OPTIONS, timezoneOptions } from '@/lib/locale';
import { radius, useTheme } from '@/theme';

type Kind = 'COMPANY' | 'PERSONAL';

export default function WorkspaceSetup() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const me = useMe();
  const create = useCreateWorkspace();
  const uploadLogo = useUploadLogo();
  const zones = useMemo(() => timezoneOptions(), []);

  const [kind, setKind] = useState<Kind>('COMPANY');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('RWF');
  const [timezone, setTimezone] = useState(
    zones.find((z) => z.value === 'Africa/Kigali')?.value ?? zones[0]!.value,
  );
  const [logo, setLogo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const firstName = me.data?.name.split(' ')[0] ?? '';
  const workspaceName =
    kind === 'PERSONAL' && !name.trim() ? `${firstName || 'My'}'s payments` : name.trim();

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        setError('That image is larger than 5 MB. Choose a smaller one.');
        return;
      }
      setLogo(asset);
    }
  };

  const submit = async () => {
    setError(null);
    if (kind === 'COMPANY' && !workspaceName) {
      setError('Enter your company name');
      return;
    }
    try {
      await create.mutateAsync({
        name: workspaceName,
        type: kind,
        defaultCurrency: currency,
        timezone,
      });
      if (logo) {
        // Workspace is created; a failed logo upload shouldn't block onboarding.
        await uploadLogo
          .mutateAsync({ uri: logo.uri, mimeType: logo.mimeType, fileName: logo.fileName })
          .catch(() => undefined);
      }
      router.replace(kind === 'COMPANY' ? '/setup/invite' : '/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the workspace');
    }
  };

  const hasWorkspace = (me.data?.workspaces.length ?? 0) > 0;

  return (
    <Screen
      header={
        <TopBar
          title="Workspace setup"
          onBack={() => (hasWorkspace ? router.back() : void signOut(queryClient))}
        />
      }
      footer={
        <Button
          full
          size="lg"
          loading={create.isPending || uploadLogo.isPending}
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
          You can always change this later.
        </Text>
      </View>

      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 12 }}>
        <ChoiceCard
          label="Company"
          icon={(c) => <Building2 size={24} color={c} />}
          selected={kind === 'COMPANY'}
          onPress={() => setKind('COMPANY')}
        />
        <ChoiceCard
          label="Personal"
          icon={(c) => <UserRound size={24} color={c} />}
          selected={kind === 'PERSONAL'}
          onPress={() => setKind('PERSONAL')}
        />
      </View>

      <FormMessage message={error} />

      <Input
        label={kind === 'COMPANY' ? 'Company name' : 'Workspace name (optional)'}
        placeholder={kind === 'COMPANY' ? 'Kigali Today Ltd' : `${firstName || 'My'}'s payments`}
        icon={<Building2 size={18} color={colors.muted} />}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />

      {kind === 'COMPANY' ? (
        <View style={{ gap: 8 }}>
          <Text variant="label">Company logo</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={logo ? 'Change logo' : 'Upload logo'}
            onPress={() => void pickLogo()}
            style={{
              minHeight: 86,
              borderRadius: radius.md,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.dashed,
              backgroundColor: colors.surface,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 14,
            }}
          >
            {logo ? (
              <Image
                source={{ uri: logo.uri }}
                style={{ width: 56, height: 56, borderRadius: 14 }}
              />
            ) : (
              <ImagePlus size={24} color={colors.primaryStrong} />
            )}
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" tone="primary">
                {logo ? 'Change logo' : 'Upload logo'}
              </Text>
              <Text variant="small" tone="muted">
                PNG or JPG, max 5 MB
              </Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Select
          label="Currency"
          value={currency}
          options={CURRENCY_OPTIONS}
          onChange={setCurrency}
          sheetTitle="Default currency"
        />
        <Select label="Timezone" value={timezone} options={zones} onChange={setTimezone} />
      </View>
      <Text variant="small" tone="muted">
        Reminders go out at 9:00 in this timezone. You can change it in settings.
      </Text>
    </Screen>
  );
}
