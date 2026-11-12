import { Ellipsis, Eye, LockKeyhole, Mail, Plus, ShieldCheck, UsersRound, WalletCards, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { ApiError } from '@/api';
import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Avatar, BottomSheet, Button, Card, IconButton, Input, ListItem, SectionHeader, Select, Text, toast } from '@/components/ui';
import { useMe, type Role } from '@/features/auth/api';
import {
  removeMember,
  revokeInvite,
  updateMember,
  useCompanies,
  useInvites,
  useListMutation,
  useMembers,
  type CompanyAccessInput,
  type CompanyGrant,
  type Member,
} from '@/features/catalog/api';
import { AccessPicker, accessIsValid } from '@/features/workspaces/AccessPicker';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, usePermissions, useSendInvite } from '@/features/workspaces/api';
import { useTheme } from '@/theme';

const ROLE_ICONS: Record<Role, LucideIcon> = { ADMIN: ShieldCheck, FINANCE: WalletCards, VIEWER: Eye };
const ROLES: Role[] = ['ADMIN', 'FINANCE', 'VIEWER'];
const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], description: ROLE_DESCRIPTIONS[r] }));
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : undefined);
const ALL: CompanyAccessInput = { allCompanies: true, companies: [] };

/** "Admin", "Finance · all companies" or "Viewer in Alpha, Finance in Beta". */
function accessLabel(role: Role, allCompanies: boolean, grants: CompanyGrant[], nameOf: (id: string) => string): string {
  if (role === 'ADMIN') return ROLE_LABELS.ADMIN;
  if (allCompanies) return `${ROLE_LABELS[role]} · all companies`;
  return grants.map((g) => `${ROLE_LABELS[g.role]} in ${nameOf(g.companyId)}`).join(', ');
}

export default function Team() {
  const { colors } = useTheme();
  const me = useMe();
  const can = usePermissions();
  const isAdmin = can.manageTeam;
  const members = useMembers();
  const invites = useInvites(isAdmin);
  const sendInvite = useSendInvite();
  const update = useListMutation('members', updateMember);
  const remove = useListMutation('members', removeMember);
  const revoke = useListMutation('invites', revokeInvite);
  const [editing, setEditing] = useState<Member | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('VIEWER');
  const [access, setAccess] = useState<CompanyAccessInput>(ALL);
  // The member being edited: their role and companies, saved together.
  const [editRole, setEditRole] = useState<Role>('VIEWER');
  const [editAccess, setEditAccess] = useState<CompanyAccessInput>(ALL);
  const companies = useCompanies();
  const nameOf = (id: string) => companies.data?.find((c) => c.id === id)?.name ?? 'a company';
  const openEditor = (m: Member) => {
    setEditing(m);
    setEditRole(m.role);
    setEditAccess({ allCompanies: m.allCompanies, companies: m.companies });
  };

  const invite = () =>
    sendInvite.mutate(
      { email: email.trim(), role, ...(role === 'ADMIN' ? ALL : access) },
      {
        onSuccess: () => {
          toast.success('Invitation sent ✉️', `${email.trim()} will get an email to join.`);
          setInviteOpen(false);
          setEmail('');
          setAccess(ALL);
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
            <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <UsersRound size={24} color={colors.primaryStrong} />
                <View>
                  <Text variant="bodyStrong">
                    {list.length} member{list.length === 1 ? '' : 's'}
                  </Text>
                  {isAdmin ? (
                    <Text variant="small" tone="muted">
                      {invites.data?.length ?? 0} pending invitation{invites.data?.length === 1 ? '' : 's'}
                    </Text>
                  ) : null}
                </View>
              </View>
              {isAdmin ? (
                <Button variant="secondary" icon={<Plus size={17} color={colors.primaryStrong} />} onPress={() => setInviteOpen(true)}>
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
                    leading={<Avatar name={m.name} size={40} />}
                    title={m.name}
                    subtitle={`${m.userId === me.data?.id ? 'You · ' : ''}${accessLabel(m.role, m.allCompanies, m.companies, nameOf)}`}
                    trailing={isAdmin || m.userId === me.data?.id ? <Ellipsis size={18} color={colors.muted} /> : undefined}
                    onPress={isAdmin || m.userId === me.data?.id ? () => openEditor(m) : undefined}
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
                      subtitle={accessLabel(inv.role, inv.allCompanies, inv.companies, nameOf)}
                      trailing={
                        <Button variant="ghost" onPress={() => revoke.mutate(inv.id, { onSuccess: () => toast.info('Invitation cancelled') })}>
                          Cancel
                        </Button>
                      }
                    />
                  ))}
                </Card>
              </View>
            ) : null}

            <View>
              <SectionHeader title="What each role can do" />
              <Card padding={0} style={{ overflow: 'hidden' }}>
                {ROLES.map((r, i) => {
                  const Icon = ROLE_ICONS[r];
                  return (
                    <ListItem key={r} divider={i > 0} icon={<Icon size={18} color={colors.primaryStrong} />} title={ROLE_LABELS[r]} subtitle={ROLE_DESCRIPTIONS[r]} />
                  );
                })}
              </Card>
            </View>

            <Card tone="accent" style={{ flexDirection: 'row', gap: 11, alignItems: 'center' }}>
              <LockKeyhole size={21} color={colors.amberText} />
              <View style={{ flex: 1 }}>
                <Text variant="smallStrong">Everyone gets the reminders for their companies</Text>
                <Text variant="small" tone="muted">
                  Admins, finance and viewers are reminded before due dates of the companies they can see. Viewers can’t change anything
                  and see account references masked.
                </Text>
              </View>
            </Card>
          </>
        )}
      </QueryState>

      <BottomSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite someone">
        <View style={{ gap: 14 }}>
          <Input
            label="Email address"
            placeholder="name@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <Select label="Role" value={role} options={roleOptions} onChange={setRole} />
          <AccessPicker role={role} value={access} onChange={setAccess} />
          <Button full loading={sendInvite.isPending} disabled={!email.includes('@') || !accessIsValid(role, access)} onPress={invite}>
            Send invitation
          </Button>
        </View>
      </BottomSheet>

      <BottomSheet visible={!!editing} onClose={() => setEditing(null)} title={editing?.name} eyebrow={editing?.email}>
        {editing ? (
          <View style={{ gap: 14 }}>
            {isAdmin ? (
              <>
                <Select label="Role" value={editRole} options={roleOptions} onChange={setEditRole} />
                <AccessPicker role={editRole} value={editAccess} onChange={setEditAccess} />
                <Button
                  full
                  loading={update.isPending}
                  disabled={!accessIsValid(editRole, editAccess)}
                  onPress={() =>
                    update.mutate(
                      { id: editing.id, role: editRole, ...(editRole === 'ADMIN' ? ALL : editAccess) },
                      {
                        onSuccess: () => {
                          toast.success('Access updated');
                          setEditing(null);
                        },
                        onError: (e) => toast.error('Could not change the access', errorText(e)),
                      },
                    )
                  }
                >
                  Save access
                </Button>
              </>
            ) : null}
            <Button
              full
              variant="danger"
              loading={remove.isPending}
              onPress={() =>
                remove.mutate(editing.id, {
                  onSuccess: () => {
                    toast.info(editing.userId === me.data?.id ? 'You left the workspace' : `${editing.name} was removed`);
                    setEditing(null);
                  },
                  onError: (e) => toast.error('Could not remove', errorText(e)),
                })
              }
            >
              {editing.userId === me.data?.id ? 'Leave workspace' : 'Remove from workspace'}
            </Button>
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
