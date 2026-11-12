import type { AppContext } from '../../context.js';
import { DEFAULT_REMINDER_OFFSETS } from '../../db/defaults.js';
import { seedCompanyCategories, type CategoryStart } from '../categories/service.js';
import { inviteMessage, ROLE_LABELS } from '../../emails/account.js';
import type { Prisma, Role, WorkspaceType } from '../../generated/prisma/client.js';
import { strongestRole } from '../../domain/access.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../http/errors.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { normalizeEmail } from '../auth/service.js';
import { notifyTeam } from '../../notifications/events.js';

const INVITE_TTL_MS = 7 * 86_400_000;

export async function createWorkspace(
  ctx: AppContext,
  userId: string,
  input: { name: string; type: WorkspaceType; timezone: string; firstCompanyName?: string; categoryStart?: CategoryStart },
) {
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
  // The first company's categories: the suggestions unless the user chose otherwise.
  const first = await ctx.db.company.findFirstOrThrow({ where: { workspaceId: org.id } });
  const start = input.categoryStart?.mode === 'copy' ? ({ mode: 'suggestions' } as const) : (input.categoryStart ?? { mode: 'suggestions' });
  await seedCompanyCategories(ctx.db, org.id, first.id, start);
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

// --- Company access ------------------------------------------------------

export interface CompanyGrant {
  companyId: string;
  role: 'FINANCE' | 'VIEWER';
}

export interface AccessInput {
  role: Role;
  /** Defaults to true. Always true for admins. */
  allCompanies?: boolean;
  /** Required (at least one) when allCompanies is false. */
  companies?: CompanyGrant[];
}

/**
 * Normalise what an admin picked: admins and "all companies" carry no list; a restricted
 * member needs at least one company of this workspace, and their membership role becomes
 * the strongest of their company roles.
 */
async function resolveAccess(ctx: AppContext, workspaceId: string, input: AccessInput) {
  const all = input.role === 'ADMIN' || input.allCompanies !== false;
  if (all) return { role: input.role, allCompanies: true, companies: [] as CompanyGrant[] };
  const companies = [...new Map((input.companies ?? []).map((g) => [g.companyId, g])).values()];
  if (companies.length === 0) throw badRequest('Pick at least one company, or give access to all companies');
  const found = await ctx.db.company.count({ where: { workspaceId, id: { in: companies.map((g) => g.companyId) } } });
  if (found !== companies.length) throw notFound('Company');
  return { role: strongestRole(companies.map((g) => g.role)), allCompanies: false, companies };
}

async function grantsOf(ctx: AppContext, workspaceId: string): Promise<Map<string, CompanyGrant[]>> {
  const rows = await ctx.db.companyAccess.findMany({ where: { workspaceId }, select: { userId: true, companyId: true, role: true } });
  const out = new Map<string, CompanyGrant[]>();
  for (const r of rows) {
    const list = out.get(r.userId) ?? [];
    list.push({ companyId: r.companyId, role: r.role as CompanyGrant['role'] });
    out.set(r.userId, list);
  }
  return out;
}

// --- Members -------------------------------------------------------------

export async function listMembers(ctx: AppContext, workspaceId: string) {
  const [rows, grants] = await Promise.all([
    ctx.db.membership.findMany({
      where: { workspaceId: workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    grantsOf(ctx, workspaceId),
  ]);
  return rows.map((m) => {
    const all = m.role === 'ADMIN' || m.allCompanies;
    return {
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      allCompanies: all,
      companies: all ? [] : (grants.get(m.userId) ?? []),
      joinedAt: m.createdAt,
    };
  });
}

async function adminCount(ctx: AppContext, workspaceId: string): Promise<number> {
  return ctx.db.membership.count({ where: { workspaceId: workspaceId, role: 'ADMIN' } });
}

export async function updateMember(
  ctx: AppContext,
  workspaceId: string,
  actorId: string,
  membershipId: string,
  input: AccessInput,
) {
  const member = await ctx.db.membership.findFirst({ where: { id: membershipId, workspaceId: workspaceId } });
  if (!member) throw notFound('Member');
  const access = await resolveAccess(ctx, workspaceId, input);
  const nextRole = access.role;
  if (member.role === 'ADMIN' && nextRole !== 'ADMIN' && (await adminCount(ctx, workspaceId)) <= 1) {
    throw new AppError(409, 'LAST_ADMIN', 'A workspace needs at least one admin');
  }

  await ctx.db.$transaction([
    ctx.db.membership.update({ where: { id: member.id }, data: { role: nextRole, allCompanies: access.allCompanies } }),
    ctx.db.companyAccess.deleteMany({ where: { workspaceId, userId: member.userId } }),
    ctx.db.companyAccess.createMany({ data: access.companies.map((g) => ({ workspaceId, userId: member.userId, ...g })) }),
  ]);
  await audit(ctx, workspaceId, actorId, 'member.update', 'Membership', member.id, {
    from: member.role,
    to: nextRole,
    allCompanies: access.allCompanies,
    companies: access.companies,
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
    ctx.db.companyAccess.deleteMany({ where: { userId: member.userId, workspaceId: workspaceId } }),
    ctx.db.notificationPreference.deleteMany({ where: { userId: member.userId, workspaceId: workspaceId } }),
  ]);
  await audit(ctx, workspaceId, actorId, 'member.remove', 'Membership', member.id, { userId: member.userId });
}

// --- Invites -------------------------------------------------------------

export async function createInvite(
  ctx: AppContext,
  workspaceId: string,
  inviterId: string,
  input: { email: string } & AccessInput,
) {
  const email = normalizeEmail(input.email);
  const access = await resolveAccess(ctx, workspaceId, input);

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
      role: access.role,
      allCompanies: access.allCompanies,
      companyAccess: access.allCompanies ? undefined : (access.companies as unknown as Prisma.InputJsonValue),
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
      roleLabel: ROLE_LABELS[access.role],
      acceptUrl: `${ctx.env.APP_URL}invite?token=${encodeURIComponent(token)}`,
    }),
  );
  await audit(ctx, workspaceId, inviterId, 'invite.create', 'Invite', invite.id, { email, role: access.role, allCompanies: access.allCompanies });
  return inviteView(invite);
}

export async function listInvites(ctx: AppContext, workspaceId: string) {
  const rows = await ctx.db.invite.findMany({
    where: { workspaceId: workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: ctx.clock.now() } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(inviteView);
}

function inviteView(i: { id: string; email: string; role: Role; allCompanies: boolean; companyAccess: Prisma.JsonValue | null; expiresAt: Date }) {
  return {
    id: i.id,
    email: i.email,
    role: i.role,
    allCompanies: i.allCompanies,
    companies: i.allCompanies ? [] : ((i.companyAccess as unknown as CompanyGrant[] | null) ?? []),
    expiresAt: i.expiresAt,
  };
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

  const existing = await ctx.db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: invite.workspaceId } } });
  if (!existing) {
    // Companies deleted since the invite was sent are skipped.
    const wanted = invite.allCompanies ? [] : ((invite.companyAccess as unknown as CompanyGrant[] | null) ?? []);
    const live = new Set(
      (
        await ctx.db.company.findMany({ where: { workspaceId: invite.workspaceId, id: { in: wanted.map((g) => g.companyId) } }, select: { id: true } })
      ).map((c) => c.id),
    );
    await ctx.db.$transaction([
      ctx.db.membership.create({ data: { userId, workspaceId: invite.workspaceId, role: invite.role, allCompanies: invite.allCompanies } }),
      ctx.db.companyAccess.createMany({
        data: wanted
          .filter((g) => live.has(g.companyId))
          .map((g) => ({ workspaceId: invite.workspaceId, userId, companyId: g.companyId, role: g.role })),
      }),
    ]);
  }
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
