import type { Request } from 'express';

import type { AppContext } from '../../context.js';
import { roleIn, visibleCompanyIds } from '../../domain/access.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError, badRequest, notFound } from '../../http/errors.js';
import { accessOf, assertCompanyVisible, userIdOf, workspaceIdOf } from '../../http/middleware/auth.js';
import { seedCompanyCategories, type CategoryStart } from '../categories/service.js';
import { audit } from '../workspaces/service.js';

/**
 * Companies (Finalize brief, Part 2). Admins create, edit, archive and delete them; every
 * member sees only the companies they have access to. A company with bills can't be
 * deleted — archive it instead (hidden from pickers, history kept).
 */

export interface CompanyInput {
  name: string;
  shortName?: string | null;
  color?: string;
  description?: string | null;
  reminderOffsets?: number[] | null;
  reminderHour?: number | null;
  monthlyBudgetCents?: number | null;
}

/** "Alpha News Ltd" → "AN"; "Kivu" → "KI". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const letters = words.length >= 2 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

type CompanyRow = Prisma.CompanyGetPayload<object>;

export function companyView(c: CompanyRow, extra: { billCount?: number; myRole?: string | null } = {}) {
  return {
    id: c.id,
    name: c.name,
    shortName: c.shortName || initials(c.name),
    color: c.color,
    description: c.description,
    reminderOffsets: (c.reminderOffsets as number[] | null) ?? null,
    reminderHour: c.reminderHour,
    monthlyBudgetCents: c.monthlyBudgetCents,
    archived: c.archivedAt !== null,
    archivedAt: c.archivedAt,
    billCount: extra.billCount ?? 0,
    myRole: extra.myRole ?? null,
    createdAt: c.createdAt,
  };
}

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === 'P2002';
const duplicate = () => new AppError(409, 'CONFLICT', 'A company with this name already exists');

function dataOf(input: Partial<CompanyInput>): Prisma.CompanyUncheckedUpdateInput {
  const { reminderOffsets, ...rest } = input;
  return {
    ...rest,
    ...(rest.shortName !== undefined ? { shortName: rest.shortName?.trim().toUpperCase() || null } : {}),
    ...(rest.description !== undefined ? { description: rest.description?.trim() || null } : {}),
    ...(reminderOffsets !== undefined ? { reminderOffsets: reminderOffsets === null ? null : [...new Set(reminderOffsets)].sort((a, b) => b - a) } : {}),
  } as Prisma.CompanyUncheckedUpdateInput;
}

export async function loadCompany(ctx: AppContext, req: Request, id: string) {
  assertCompanyVisible(req, id);
  const c = await ctx.db.company.findFirst({ where: { id, workspaceId: workspaceIdOf(req) } });
  if (!c) throw notFound('Company');
  return c;
}

export async function listCompanies(ctx: AppContext, req: Request, includeArchived: boolean) {
  const visible = visibleCompanyIds(accessOf(req));
  const rows = await ctx.db.company.findMany({
    where: { workspaceId: workspaceIdOf(req), ...(visible ? { id: { in: visible } } : {}), ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: 'asc' },
    include: { _count: { select: { bills: { where: { status: { not: 'ARCHIVED' } } } } } },
  });
  return rows.map((c) => companyView(c, { billCount: c._count.bills, myRole: roleIn(accessOf(req), c.id) }));
}

export async function createCompany(ctx: AppContext, req: Request, input: CompanyInput, categoryStart: CategoryStart = { mode: 'empty' }) {
  const workspaceId = workspaceIdOf(req);
  if (categoryStart.mode === 'copy') await loadCompany(ctx, req, categoryStart.fromCompanyId);
  try {
    const c = await ctx.db.$transaction(async (tx) => {
      const created = await tx.company.create({ data: { ...(dataOf(input) as Prisma.CompanyUncheckedCreateInput), workspaceId, name: input.name.trim() } });
      await seedCompanyCategories(tx, workspaceId, created.id, categoryStart);
      return created;
    });
    await audit(ctx, workspaceId, userIdOf(req), 'company.create', 'Company', c.id, { name: c.name });
    return c;
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicate();
    throw err;
  }
}

export async function updateCompany(ctx: AppContext, req: Request, id: string, input: Partial<CompanyInput>) {
  await loadCompany(ctx, req, id);
  try {
    const c = await ctx.db.company.update({ where: { id }, data: dataOf({ ...input, ...(input.name ? { name: input.name.trim() } : {}) }) });
    await audit(ctx, workspaceIdOf(req), userIdOf(req), 'company.update', 'Company', id, { fields: Object.keys(input) });
    return companyView(c, { myRole: roleIn(accessOf(req), id) });
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicate();
    throw err;
  }
}

export async function setCompanyArchived(ctx: AppContext, req: Request, id: string, archived: boolean) {
  await loadCompany(ctx, req, id);
  const c = await ctx.db.company.update({ where: { id }, data: { archivedAt: archived ? ctx.clock.now() : null } });
  await audit(ctx, workspaceIdOf(req), userIdOf(req), archived ? 'company.archive' : 'company.unarchive', 'Company', id, { name: c.name });
  return companyView(c, { myRole: roleIn(accessOf(req), id) });
}

/** Only an empty company can be deleted; one with bills must be archived (409 HAS_BILLS). */
export async function deleteCompany(ctx: AppContext, req: Request, id: string) {
  const c = await loadCompany(ctx, req, id);
  const bills = await ctx.db.bill.count({ where: { companyId: id } });
  if (bills > 0) {
    throw new AppError(409, 'HAS_BILLS', `${c.name} has ${bills} bill${bills === 1 ? '' : 's'}. Archive it instead so the history is kept.`);
  }
  const companies = await ctx.db.company.count({ where: { workspaceId: c.workspaceId } });
  if (companies <= 1) throw badRequest('A workspace needs at least one company');
  await ctx.db.company.delete({ where: { id } });
  await audit(ctx, workspaceIdOf(req), userIdOf(req), 'company.delete', 'Company', id, { name: c.name });
}

/** Overview numbers and who can see this company (detail screen). */
export async function companyDetail(ctx: AppContext, req: Request, id: string) {
  const c = await loadCompany(ctx, req, id);
  const [billCount, members] = await Promise.all([
    ctx.db.bill.count({ where: { companyId: id, status: { not: 'ARCHIVED' } } }),
    ctx.db.membership.findMany({
      where: { workspaceId: c.workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const access = await ctx.db.companyAccess.findMany({ where: { companyId: id } });
  const roleOf = new Map(access.map((a) => [a.userId, a.role]));
  const withAccess = members
    .map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role === 'ADMIN' ? 'ADMIN' : m.allCompanies ? m.role : (roleOf.get(m.userId) ?? null),
      allCompanies: m.role === 'ADMIN' || m.allCompanies,
    }))
    .filter((m) => m.role !== null);
  return { ...companyView(c, { billCount, myRole: roleIn(accessOf(req), id) }), members: withAccess };
}
