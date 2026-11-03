import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Building2, Check, ChevronDown, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, BottomSheet, Text } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { ROLE_LABELS } from '@/features/workspaces/api';
import { useSession } from '@/state/session';
import { radius, useTheme } from '@/theme';

/** Chip showing the active workspace; opens a sheet to switch or create one. */
export function WorkspaceSwitcher() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const me = useMe();
  const activeWorkspaceId = useSession((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useSession((s) => s.setActiveWorkspace);
  const [open, setOpen] = useState(false);
  const workspaces = me.data?.workspaces ?? [];
  const active = workspaces.find((w) => w.id === activeWorkspaceId);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Workspace: ${active?.name ?? 'none'}. Switch workspace`}
        onPress={() => setOpen(true)}
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          minHeight: 36,
          paddingHorizontal: 10,
          borderRadius: 10,
          backgroundColor: colors.primarySoft,
        }}
      >
        <Building2 size={16} color={colors.primaryStrong} />
        <Text variant="smallStrong" tone="primary" numberOfLines={1} style={{ maxWidth: 220 }}>
          {active?.name ?? 'Choose workspace'}
        </Text>
        <ChevronDown size={16} color={colors.primaryStrong} />
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Your workspaces">
        {workspaces.map((w) => (
          <Pressable
            key={w.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: w.id === activeWorkspaceId }}
            onPress={async () => {
              setOpen(false);
              if (w.id === activeWorkspaceId) return;
              await setActiveWorkspace(w.id);
              await queryClient.invalidateQueries();
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 10,
              minHeight: 60,
              borderRadius: radius.sm,
              backgroundColor: w.id === activeWorkspaceId || pressed ? colors.primarySoft : 'transparent',
            })}
          >
            <Avatar name={w.name} color={colors.primary} size={40} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{w.name}</Text>
              <Text variant="small" tone="muted">
                {w.type === 'PERSONAL' ? 'Personal' : 'Company'} · {ROLE_LABELS[w.role]}
              </Text>
            </View>
            {w.id === activeWorkspaceId ? <Check size={18} color={colors.primaryStrong} /> : null}
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setOpen(false);
            router.push('/setup/workspace');
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 10,
            minHeight: 56,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 13,
              backgroundColor: colors.primarySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={20} color={colors.primaryStrong} />
          </View>
          <Text variant="bodyStrong" tone="primary">
            Create a workspace
          </Text>
        </Pressable>
      </BottomSheet>
    </>
  );
}
