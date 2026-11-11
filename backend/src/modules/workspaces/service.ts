import type { AppContext } from '../../context.js';
import { DEFAULT_REMINDER_OFFSETS, ensureDefaultCategories } from '../../db/defaults.js';
import { inviteMessage, ROLE_LABELS } from '../../emails/account.js';
import type { Prisma, Role, WorkspaceType } from '../../generated/prisma/client.js';
import { AppError, conflict, forbidden, notFound } from '../../http/errors.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { normalizeEmail } from '../auth/service.js';
import { notifyTeam } from '../../notifications/events.js';

const INVITE_TTL_MS = 7 * 86_400_000;

export async function createWorkspace(
  ctx: AppContext,
  userId: string,
  input: { name: string; type: WorkspaceType; timezone: string; firstCompanyName?: string },
) {
  await ensureDefaultCategories(ctx.db);
  const name = input.name.trim();
  // Every bill belongs to a company, so a workspace always starts with one.
  const firstCompany = input.firstCompanyName?.trim() || (input.type === 'PERSONAL' ? 'Personal' : name);
  const org = await ctx.db.workspace.create({
    data: {
      name,
      type: input.type,
      timezone: input.timezone,
      companies: { create: { name: firstCompany } },
      defaultReminderOffsets: [...DEFAULT_REMINDER_OFFSETS],
      memberships: { create: { userId, role: 'ADMIN' } },
      notificationPrefs: { create: { userId, mutedBillIds: [] } },
    },
  });
  await audit(ctx, org.id, userId, 'workspace.create', 'Workspace', org.id, { name: org.name });
  return getWorkspace(ctx, org.id);
}

export async function getWorkspace(ctx: AppContext, workspaceId: string) {
  const org = await ctx.db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: { _count: { select: { memberships: true, bills: true, companies: true } } },
  });
  return {
    id: org.id,
    name: org.name,
    type: org.type,
    timezone: org.timezone,
    reminderHour: org.reminderHour,
    quietHoursStart: org.quietHoursStart,
    quietHoursEnd: org.quietHoursEnd,
    defaultReminderOffsets: org.defaultReminderOffsets as number[],
    memberCount: org._count.memberships,
    billCount: org._count.bills,
    companyCount: org._count.companies,
    createdAt: org.createdAt,
  };
}

export async function audit(
  ctx: AppContext,
  workspaceId: string,
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  meta: Record<string, unknown> = {},
) {
  await ctx.db.auditLog.create({
    data: { workspaceId, userId, action, entity, entityId, meta: meta as Prisma.InputJsonValue },
  });
}

// --- Members -------------------------------------------------------------

export async function listMembers(ctx: AppContext, workspaceId: string) {
  const rows = await ctx.db.membership.findMany({
    where: { workspaceId: workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    joinedAt: m.createdAt,
  }));
}

async function adminCount(ctx: AppContext, workspaceId: string): Promise<number> {
  return ctx.db.membership.count({ where: { workspaceId: workspaceId, role: 'ADMIN' } });
}

export async function updateMember(
  ctx: AppContext,
  workspaceId: string,
  actorId: string,
  membershipId: string,
  input: { role: Role },
) {
  const member = await ctx.db.membership.findFirst({ where: { id: membershipId, workspaceId: workspaceId } });
  if (!member) throw notFound('Member');
  const nextRole = input.role;
  if (member.role === 'ADMIN' && nextRole !== 'ADMIN' && (await adminCount(ctx, workspaceId)) <= 1) {
    throw new AppError(409, 'LAST_ADMIN', 'A workspace needs at least one admin');
  }

  await ctx.db.membership.update({ where: { id: member.id }, data: { role: nextRole } });
  await audit(ctx, workspaceId, actorId, 'member.update', 'Membership', member.id, {
    from: member.role,
    to: nextRole,
  });
  if (member.role !== nextRole) {
    const u = await ctx.db.user.findUniqueOrThrow({ where: { id: member.userId }, select: { name: true } });
    await notifyTeam(ctx, { workspaceId, event: 'ROLE_CHANGED', memberName: u.name, role: nextRole, actorUserId: actorId, eventKey: `role-${member.id}-${ctx.clock.now().getTime()}` }).catch((err: unknown) =>
      ctx.logger.error({ err }, 'Team notification failed'),
    );
  }
  return (await listMembers(ctx, workspaceId)).find((m) => m.id === member.id);
}

export async function removeMember(ctx: AppContext, workspaceId: string, actorId: string, membershipId: string) {
  const member = await ctx.db.membership.findFirst({ where: { id: membershipId, workspaceId: workspaceId } });
  if (!member) throw notFound('Member');
  if (member.role === 'ADMIN' && (await adminCount(ctx, workspaceId)) <= 1) {
    throw new AppError(409, 'LAST_ADMIN', 'A workspace needs at least one admin');
  }
  await ctx.db.$transaction([
    ctx.db.membership.delete({ where: { id: member.id } }),
    ctx.db.notificationPreference.deleteMany({ where: { userId: member.userId, workspaceId: workspaceId } }),
  ]);
  await audit(ctx, workspaceId, actorId, 'member.remove', 'Membership', member.id, { userId: member.userId });
}

// --- Invites -------------------------------------------------------------

export async function createInvite(
  ctx: AppContext,
  workspaceId: string,
  inviterId: string,
  input: { email: string; role: Role },
) {
  const email = normalizeEmail(input.email);

  const existingMember = await ctx.db.membership.findFirst({ where: { workspaceId: workspaceId, user: { email } } });
  if (existingMember) throw conflict('That person is already in this workspace');

  const now = ctx.clock.now();
  // Re-inviting replaces any pending invite for the same address.
  await ctx.db.invite.updateMany({
    where: { workspaceId: workspaceId, email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });

  const token = randomToken();
  const invite = await ctx.db.invite.create({
    data: {
      workspaceId: workspaceId,
      email,
      role: input.role,
      tokenHash: sha256(token),
      invitedById: inviterId,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    },
    include: { workspace: true, invitedBy: true },
  });

  await ctx.mailer.send(
    inviteMessage({
      to: email,
      inviterName: invite.invitedBy.name,
      orgName: invite.workspace.name,
      roleLabel: ROLE_LABELS[input.role],
      acceptUrl: `${ctx.env.APP_URL}invite?token=${encodeURIComponent(token)}`,
    }),
  );
  await audit(ctx, workspaceId, inviterId, 'invite.create', 'Invite', invite.id, { email, role: input.role });
  return { id: invite.id, email, role: invite.role, expiresAt: invite.expiresAt };
}

export async function listInvites(ctx: AppContext, workspaceId: string) {
  const rows = await ctx.db.invite.findMany({
    where: { workspaceId: workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: ctx.clock.now() } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt }));
}

export async function revokeInvite(ctx: AppContext, workspaceId: string, actorId: string, inviteId: string) {
  const res = await ctx.db.invite.updateMany({
    where: { id: inviteId, workspaceId: workspaceId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: ctx.clock.now() },
  });
  if (res.count === 0) throw notFound('Invite');
  await audit(ctx, workspaceId, actorId, 'invite.revoke', 'Invite', inviteId);
}

async function findValidInvite(ctx: AppContext, token: string) {
  const invite = await ctx.db.invite.findUnique({
    where: { tokenHash: sha256(token) },
    include: { workspace: true, invitedBy: { select: { name: true } } },
  });
  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= ctx.clock.now()) {
    throw new AppError(410, 'INVITE_INVALID', 'This invitation is no longer valid. Ask for a new one.');
  }
  return invite;
}

export async function previewInvite(ctx: AppContext, token: string) {
  const invite = await findValidInvite(ctx, token);
  return {
    workspace: { name: invite.workspace.name },
    invitedBy: invite.invitedBy.name,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
  };
}

export async function acceptInvite(ctx: AppContext, userId: string, token: string) {
  const invite = await findValidInvite(ctx, token);
  const user = await ctx.db.user.findUniqueOrThrow({ where: { id: userId } });
  if (normalizeEmail(user.email) !== invite.email) {
    throw forbidden(`This invitation was sent to ${invite.email}. Log in with that email to accept it.`);
  }
  const now = ctx.clock.now();
  const claimed = await ctx.db.invite.updateMany({
    where: { id: invite.id, acceptedAt: null, revokedAt: null },
    data: { acceptedAt: now },
  });
  if (claimed.count === 0) throw new AppError(410, 'INVITE_INVALID', 'This invitation is no longer valid.');

  await ctx.db.membership.upsert({
    where: { userId_workspaceId: { userId, workspaceId: invite.workspaceId } },
    update: {},
    create: { userId, workspaceId: invite.workspaceId, role: invite.role },
  });
  await ctx.db.notificationPreference.upsert({
    where: { userId_workspaceId: { userId, workspaceId: invite.workspaceId } },
    update: {},
    create: { userId, workspaceId: invite.workspaceId, mutedBillIds: [] },
  });
  // Accepting via the emailed link proves the address.
  if (!user.emailVerifiedAt) await ctx.db.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
  await audit(ctx, invite.workspaceId, userId, 'invite.accept', 'Invite', invite.id);
  await notifyTeam(ctx, { workspaceId: invite.workspaceId, event: 'INVITE_ACCEPTED', memberName: user.name, role: invite.role, actorUserId: userId, eventKey: `invite-${invite.id}` }).catch((err: unknown) =>
    ctx.logger.error({ err }, 'Team notification failed'),
  );
  return getWorkspace(ctx, invite.workspaceId);
}
