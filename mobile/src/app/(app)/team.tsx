import {
  Building2,
  Ellipsis,
  Eye,
  LockKeyhole,
  Mail,
  Plus,
  ShieldCheck,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import {
  Avatar,
  BottomSheet,
  Button,
  Card,
  IconButton,
  Input,
  ListItem,
  SectionHeader,
  Select,
  Text,
  toast,
} from '@/components/ui';
import { ApiError } from '@/api';
import type { Role } from '@/features/auth/api';
import { useMe } from '@/features/auth/api';
import {
  createDepartment,
  removeMember,
  revokeInvite,
  updateMember,
  useInvites,
  useListMutation,
  useMembers,
  type Member,
} from '@/features/catalog/api';
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  useSendInvite,
  useWorkspace,
} from '@/features/workspaces/api';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme';

const ROLE_ICONS: Record<Role, LucideIcon> = {
  ADMIN: ShieldCheck,
  FINANCE: WalletCards,
  DEPARTMENT: Building2,
  EMPLOYEE: Eye,
};
const ROLES: Role[] = ['ADMIN', 'FINANCE', 'DEPARTMENT', 'EMPLOYEE'];
const roleOptions = ROLES.map((r) => ({
  value: r,
  label: ROLE_LABELS[r],
  description: ROLE_DESCRIPTIONS[r],
}));

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : undefined);

export default function Team() {
  const { colors } = useTheme();
  const me = useMe();
  const orgId = useSession((s) => s.activeOrgId);
  const myRole = me.data?.workspaces.find((w) => w.id === orgId)?.role;
  const isAdmin = myRole === 'ADMIN';
  const members = useMembers();
  const invites = useInvites(isAdmin);
  const workspace = useWorkspace();
  const sendInvite = useSendInvite();
  const update = useListMutation('members', updateMember);
  const remove = useListMutation('members', removeMember);
  const revoke = useListMutation('invites', revokeInvite);
  const addDept = useListMutation('workspace', createDepartment);

  const [editing, setEditing] = useState<Member | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('EMPLOYEE');
  const [deptId, setDeptId] = useState('');
  const [newDept, setNewDept] = useState('');

  const departments = (workspace.data?.departments ?? []).map((d) => ({
    value: d.id,
    label: d.name,
  }));

  const invite = () =>
    sendInvite.mutate(
      { email: email.trim(), role, departmentId: role === 'DEPARTMENT' ? deptId || null : null },
      {
        onSuccess: () => {
          toast.success('Invitation sent', `${email.trim()} will get an email to join.`);
          setInviteOpen(false);
          setEmail('');
          void invites.refetch();
        },
        onError: (e) => toast.error('Could not invite', errorText(e)),
      },
    );

  return (
    <Screen
      header={
        <TopBar
          title="Team & roles"
          action={
            isAdmin ? (
              <IconButton accessibilityLabel="Invite member" onPress={() => setInviteOpen(true)}>
                <Plus size={20} color={colors.ink} />
              </IconButton>
            ) : null
          }
        />
      }
      contentStyle={{ gap: 20, paddingBottom: 32 }}
    >
      <QueryState query={members}>
        {(list) => (
          <>
            <Card
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <UsersRound size={24} color={colors.primaryStrong} />
                <View>
                  <Text variant="bodyStrong">
                    {list.length} member{list.length === 1 ? '' : 's'}
                  </Text>
                  {isAdmin ? (
                    <Text variant="small" tone="muted">
                      {invites.data?.length ?? 0} pending invitation
                      {invites.data?.length === 1 ? '' : 's'}
                    </Text>
                  ) : null}
                </View>
              </View>
              {isAdmin ? (
                <Button
                  variant="secondary"
                  icon={<Plus size={17} color={colors.primaryStrong} />}
                  onPress={() => setInviteOpen(true)}
                >
                  Invite
                </Button>
              ) : null}
            </Card>

            <View>
              <SectionHeader title="Members" />
              <Card padding={0} style={{ overflow: 'hidden' }}>
                {list.map((m, i) => (
                  <ListItem
                    key={m.id}
                    divider={i > 0}
                    leading={<Avatar name={m.name} imageUrl={m.avatarUrl} size={40} />}
                    title={m.name}
                    subtitle={`${m.userId === me.data?.id ? 'You · ' : ''}${ROLE_LABELS[m.role]}${m.department ? ` · ${m.department.name}` : ''}`}
                    trailing={isAdmin ? <Ellipsis size={18} color={colors.muted} /> : undefined}
                    onPress={isAdmin ? () => setEditing(m) : undefined}
                  />
                ))}
              </Card>
            </View>

            {isAdmin && invites.data?.length ? (
              <View>
                <SectionHeader title="Pending invitations" />
                <Card padding={0} style={{ overflow: 'hidden' }}>
                  {invites.data.map((inv, i) => (
                    <ListItem
                      key={inv.id}
                      divider={i > 0}
                      icon={<Mail size={18} color={colors.primaryStrong} />}
                      title={inv.email}
                      subtitle={ROLE_LABELS[inv.role]}
                      trailing={
                        <Button
                          variant="ghost"
                          onPress={() =>
                            revoke.mutate(inv.id, {
                              onSuccess: () => toast.info('Invitation cancelled'),
                            })
                          }
                        >
                          Cancel
                        </Button>
                      }
                    />
                  ))}
                </Card>
              </View>
            ) : null}

            <View>
              <SectionHeader title="Role permissions" />
              <Card padding={0} style={{ overflow: 'hidden' }}>
                {ROLES.map((r, i) => {
                  const Icon = ROLE_ICONS[r];
                  return (
                    <ListItem
                      key={r}
                      divider={i > 0}
                      icon={<Icon size={18} color={colors.primaryStrong} />}
                      title={ROLE_LABELS[r]}
                      subtitle={ROLE_DESCRIPTIONS[r]}
                    />
                  );
                })}
              </Card>
            </View>

            <Card tone="accent" style={{ flexDirection: 'row', gap: 11, alignItems: 'center' }}>
              <LockKeyhole size={21} color={colors.amberText} />
              <View style={{ flex: 1 }}>
                <Text variant="smallStrong">Employee preview</Text>
                <Text variant="small" tone="muted">
                  Employees see only payments assigned to them. Financial reports and team settings
                  stay hidden.
                </Text>
              </View>
            </Card>

            {isAdmin ? (
              <View>
                <SectionHeader title="Departments" />
                <Card style={{ gap: 10 }}>
                  {departments.length ? (
                    <Text variant="small" tone="muted">
                      {departments.map((d) => d.label).join(' · ')}
                    </Text>
                  ) : (
                    <Text variant="small" tone="muted">
                      No departments yet. Department officers need one.
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                    <Input
                      placeholder="e.g. Technology"
                      value={newDept}
                      onChangeText={setNewDept}
                      containerStyle={{ flex: 1 }}
                      accessibilityLabel="New department name"
                    />
                    <Button
                      variant="secondary"
                      disabled={!newDept.trim()}
                      loading={addDept.isPending}
                      onPress={() =>
                        addDept.mutate(newDept.trim(), {
                          onSuccess: () => setNewDept(''),
                          onError: (e) => toast.error('Could not add', errorText(e)),
                        })
                      }
                    >
                      Add
                    </Button>
                  </View>
                </Card>
              </View>
            ) : null}
          </>
        )}
      </QueryState>

      <BottomSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite someone">
        <Input
          label="Email address"
          placeholder="name@company.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <Select label="Role" value={role} options={roleOptions} onChange={setRole} />
        {role === 'DEPARTMENT' ? (
          <Select
            label="Department"
            value={deptId}
            options={departments}
            onChange={setDeptId}
            placeholder="Choose a department"
          />
        ) : null}
        <Button
          full
          loading={sendInvite.isPending}
          disabled={!email.includes('@')}
          onPress={invite}
        >
          Send invitation
        </Button>
      </BottomSheet>

      <BottomSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.name}
        eyebrow={editing?.email}
      >
        {editing ? (
          <>
            <Select
              label="Role"
              value={editing.role}
              options={roleOptions}
              onChange={(r) =>
                update.mutate(
                  {
                    id: editing.id,
                    role: r,
                    departmentId:
                      r === 'DEPARTMENT'
                        ? (editing.department?.id ?? departments[0]?.value ?? null)
                        : (editing.department?.id ?? null),
                  },
                  {
                    onSuccess: () => setEditing(null),
                    onError: (e) => toast.error('Could not change the role', errorText(e)),
                  },
                )
              }
            />
            <Select
              label="Department"
              value={editing.department?.id ?? ''}
              options={[{ value: '', label: 'No department' }, ...departments]}
              onChange={(d) =>
                update.mutate(
                  { id: editing.id, departmentId: d || null },
                  {
                    onSuccess: () => setEditing(null),
                    onError: (e) => toast.error('Could not update', errorText(e)),
                  },
                )
              }
            />
            <Button
              full
              variant="danger"
              loading={remove.isPending}
              onPress={() =>
                remove.mutate(editing.id, {
                  onSuccess: () => {
                    toast.info(`${editing.name} was removed`);
                    setEditing(null);
                  },
                  onError: (e) => toast.error('Could not remove', errorText(e)),
                })
              }
            >
              {editing.userId === me.data?.id ? 'Leave workspace' : 'Remove from workspace'}
            </Button>
          </>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
