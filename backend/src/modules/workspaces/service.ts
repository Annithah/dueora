import type { AppContext } from '../../context.js';
import { DEFAULT_REMINDER_OFFSETS, ensureDefaultCategories } from '../../db/defaults.js';
import { inviteMessage, ROLE_LABELS } from '../../emails/account.js';
import { Prisma, type OrgType, type Role } from '../../generated/prisma/client.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../http/errors.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { normalizeEmail } from '../auth/service.js';

const INVITE_TTL_MS = 7 * 86_400_000;

export async function createWorkspace(
  ctx: AppContext,
  userId: string,
  input: { name: string; type: OrgType; defaultCurrency: string; timezone: string },
) {
  await ensureDefaultCategories(ctx.db);
  const org = await ctx.db.organization.create({
    data: {
      name: input.name.trim(),
      type: input.type,
      defaultCurrency: input.defaultCurrency,
      timezone: input.timezone,
      defaultReminderOffsets: [...DEFAULT_REMINDER_OFFSETS],
      memberships: { create: { userId, role: 'ADMIN' } },
      notificationPrefs: { create: { userId, mutedObligationIds: [] } },
    },
  });
  await audit(ctx, org.id, userId, 'workspace.create', 'Organization', org.id, { name: org.name });
  return getWorkspace(ctx, org.id);
}

export async function getWorkspace(ctx: AppContext, orgId: string) {
  const org = await ctx.db.organization.findUniqueOrThrow({
    where: { id: orgId },
    include: {
      departments: { orderBy: { name: 'asc' } },
      exchangeRates: { orderBy: { fromCurrency: 'asc' } },
      _count: { select: { memberships: true, obligations: true } },
    },
  });
  return {
    id: org.id,
    name: org.name,
    type: org.type,
    logoUrl: org.logoUrl,
    defaultCurrency: org.defaultCurrency,
    timezone: org.timezone,
    reminderHour: org.reminderHour,
    quietHoursStart: org.quietHoursStart,
    quietHoursEnd: org.quietHoursEnd,
    defaultReminderOffsets: org.defaultReminderOffsets as number[],
    departments: org.departments.map((d) => ({ id: d.id, name: d.name })),
    exchangeRates: org.exchangeRates.map((r) => ({ fromCurrency: r.fromCurrency, rate: r.rate.toString() })),
    memberCount: org._count.memberships,
    obligationCount: org._count.obligations,
    createdAt: org.createdAt,
  };
}

export async function audit(
  ctx: AppContext,
  organizationId: string,
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  meta: Record<string, unknown> = {},
) {
  await ctx.db.auditLog.create({
    data: { organizationId, userId, action, entity, entityId, meta: meta as Prisma.InputJsonValue },
  });
}

// --- Members -------------------------------------------------------------

export async function listMembers(ctx: AppContext, orgId: string) {
  const rows = await ctx.db.membership.findMany({
    where: { organizationId: orgId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } }, department: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
    role: m.role,
    department: m.department ? { id: m.department.id, name: m.department.name } : null,
    joinedAt: m.createdAt,
  }));
}

async function assertDepartmentInOrg(ctx: AppContext, orgId: string, departmentId: string | null | undefined) {
  if (!departmentId) return;
  const dept = await ctx.db.department.findFirst({ where: { id: departmentId, organizationId: orgId } });
  if (!dept) throw badRequest('Unknown department');
}

async function adminCount(ctx: AppContext, orgId: string): Promise<number> {
  return ctx.db.membership.count({ where: { organizationId: orgId, role: 'ADMIN' } });
}

export async function updateMember(
  ctx: AppContext,
  orgId: string,
  actorId: string,
  membershipId: string,
  input: { role?: Role; departmentId?: string | null },
) {
  const member = await ctx.db.membership.findFirst({ where: { id: membershipId, organizationId: orgId } });
  if (!member) throw notFound('Member');
  await assertDepartmentInOrg(ctx, orgId, input.departmentId);

  const nextRole = input.role ?? member.role;
  const nextDept = input.departmentId === undefined ? member.departmentId : input.departmentId;
  if (nextRole === 'DEPARTMENT' && !nextDept) throw badRequest('Department officers need a department');
  if (member.role === 'ADMIN' && nextRole !== 'ADMIN' && (await adminCount(ctx, orgId)) <= 1) {
    throw new AppError(409, 'LAST_ADMIN', 'A workspace needs at least one admin');
  }

  await ctx.db.membership.update({ where: { id: member.id }, data: { role: nextRole, departmentId: nextDept } });
  await audit(ctx, orgId, actorId, 'member.update', 'Membership', member.id, {
    from: { role: member.role, departmentId: member.departmentId },
    to: { role: nextRole, departmentId: nextDept },
  });
  return (await listMembers(ctx, orgId)).find((m) => m.id === member.id);
}

export async function removeMember(ctx: AppContext, orgId: string, actorId: string, membershipId: string) {
  const member = await ctx.db.membership.findFirst({ where: { id: membershipId, organizationId: orgId } });
  if (!member) throw notFound('Member');
  if (member.role === 'ADMIN' && (await adminCount(ctx, orgId)) <= 1) {
    throw new AppError(409, 'LAST_ADMIN', 'A workspace needs at least one admin');
  }
  await ctx.db.$transaction([
    ctx.db.membership.delete({ where: { id: member.id } }),
    ctx.db.notificationPreference.deleteMany({ where: { userId: member.userId, organizationId: orgId } }),
    // Unassign their obligations so reminders fall back to admins/finance.
    ctx.db.obligation.updateMany({
      where: { organizationId: orgId, assigneeUserId: member.userId },
      data: { assigneeUserId: null },
    }),
  ]);
  await audit(ctx, orgId, actorId, 'member.remove', 'Membership', member.id, { userId: member.userId });
}

// --- Invites -------------------------------------------------------------

export async function createInvite(
  ctx: AppContext,
  orgId: string,
  inviterId: string,
  input: { email: string; role: Role; departmentId?: string | null },
) {
  const email = normalizeEmail(input.email);
  await assertDepartmentInOrg(ctx, orgId, input.departmentId);
  if (input.role === 'DEPARTMENT' && !input.departmentId) throw badRequest('Department officers need a department');

  const existingMember = await ctx.db.membership.findFirst({ where: { organizationId: orgId, user: { email } } });
  if (existingMember) throw conflict('That person is already in this workspace');

  const now = ctx.clock.now();
  // Re-inviting replaces any pending invite for the same address.
  await ctx.db.invite.updateMany({
    where: { organizationId: orgId, email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });

  const token = randomToken();
  const invite = await ctx.db.invite.create({
    data: {
      organizationId: orgId,
      email,
      role: input.role,
      departmentId: input.departmentId ?? null,
      tokenHash: sha256(token),
      invitedById: inviterId,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    },
    include: { organization: true, invitedBy: true },
  });

  await ctx.mailer.send(
    inviteMessage({
      to: email,
      inviterName: invite.invitedBy.name,
      orgName: invite.organization.name,
      roleLabel: ROLE_LABELS[input.role],
      acceptUrl: `${ctx.env.APP_URL}invite?token=${encodeURIComponent(token)}`,
      logoUrl: invite.organization.logoUrl,
    }),
  );
  await audit(ctx, orgId, inviterId, 'invite.create', 'Invite', invite.id, { email, role: input.role });
  return { id: invite.id, email, role: invite.role, departmentId: invite.departmentId, expiresAt: invite.expiresAt };
}

export async function listInvites(ctx: AppContext, orgId: string) {
  const rows = await ctx.db.invite.findMany({
    where: { organizationId: orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: ctx.clock.now() } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((i) => ({ id: i.id, email: i.email, role: i.role, departmentId: i.departmentId, expiresAt: i.expiresAt }));
}

export async function revokeInvite(ctx: AppContext, orgId: string, actorId: string, inviteId: string) {
  const res = await ctx.db.invite.updateMany({
    where: { id: inviteId, organizationId: orgId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: ctx.clock.now() },
  });
  if (res.count === 0) throw notFound('Invite');
  await audit(ctx, orgId, actorId, 'invite.revoke', 'Invite', inviteId);
}

async function findValidInvite(ctx: AppContext, token: string) {
  const invite = await ctx.db.invite.findUnique({
    where: { tokenHash: sha256(token) },
    include: { organization: true, invitedBy: { select: { name: true } } },
  });
  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= ctx.clock.now()) {
    throw new AppError(410, 'INVITE_INVALID', 'This invitation is no longer valid. Ask for a new one.');
  }
  return invite;
}

export async function previewInvite(ctx: AppContext, token: string) {
  const invite = await findValidInvite(ctx, token);
  return {
    organization: { name: invite.organization.name, logoUrl: invite.organization.logoUrl },
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
    where: { userId_organizationId: { userId, organizationId: invite.organizationId } },
    update: {},
    create: { userId, organizationId: invite.organizationId, role: invite.role, departmentId: invite.departmentId },
  });
  await ctx.db.notificationPreference.upsert({
    where: { userId_organizationId: { userId, organizationId: invite.organizationId } },
    update: {},
    create: { userId, organizationId: invite.organizationId, mutedObligationIds: [] },
  });
  // Accepting via the emailed link proves the address.
  if (!user.emailVerifiedAt) await ctx.db.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
  await audit(ctx, invite.organizationId, userId, 'invite.accept', 'Invite', invite.id);
  return getWorkspace(ctx, invite.organizationId);
}
