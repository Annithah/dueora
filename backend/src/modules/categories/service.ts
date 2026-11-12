import type { Request } from 'express';

import type { AppContext } from '../../context.js';
import { CATEGORY_SUGGESTIONS, DEFAULT_CATEGORY_STYLE } from '../../config/categorySuggestions.js';
import { visibleCompanyIds } from '../../domain/access.js';
import type { AmountType, FrequencyUnit, PaymentMethod, Prisma } from '../../generated/prisma/client.js';
import { AppError, badRequest, notFound } from '../../http/errors.js';
import { accessOf, assertCan, assertCompanyVisible, userIdOf, workspaceIdOf } from '../../http/middleware/auth.js';
import { audit } from '../workspaces/service.js';

/**
 * Categories belong to one company (Finalize brief, Part 3), with one level of
 * sub-categories, a sort order, optional bill defaults, archive, merge and move-then-delete.
 * Members manage them in the companies where their role is ADMIN or FINANCE.
 */

type Tx = Parameters<Parameters<AppContext['db']['$transaction']>[0]>[0];
type Db = AppContext['db'] | Tx;

export interface CategoryDefaults {
  defaultFrequencyUnit?: FrequencyUnit | null;
  defaultFrequencyInterval?: number | null;
  defaultAmountType?: AmountType | null;
  defaultReminderOffsets?: number[] | null;
  defaultPaymentMethod?: PaymentMethod | null;
}

export interface CategoryInput extends CategoryDefaults {
  companyId: string;
  name: string;
  icon?: string;
  color?: string;
  parentId?: string | null;
  description?: string | null;
  /** Created with it, as sub-categories (names). */
  subcategories?: string[];
}

/** How a new company's categories start. */
export type CategoryStart =
  | { mode: 'empty' }
  | { mode: 'suggestions'; names?: string[]; withSubcategories?: boolean }
  | { mode: 'copy'; fromCompanyId: string };

type Row = Prisma.CategoryGetPayload<{ include: { parent: { select: { id: true; name: true } } } }>;

export function categoryView(c: Row, billCount = 0) {
  return {
    id: c.id,
    companyId: c.companyId,
    parentId: c.parentId,
    parent: c.parent ? { id: c.parent.id, name: c.parent.name } : null,
    name: c.name,
    icon: c.icon,
    color: c.color,
    description: c.description,
    sortOrder: c.sortOrder,
    defaults: {
      frequencyUnit: c.defaultFrequencyUnit,
      frequencyInterval: c.defaultFrequencyInterval,
      amountType: c.defaultAmountType,
      reminderOffsets: (c.defaultReminderOffsets as number[] | null) ?? null,
      paymentMethod: c.defaultPaymentMethod,
    },
    archived: c.archivedAt !== null,
    billCount,
  };
}

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === 'P2002';
const duplicate = () => new AppError(409, 'CONFLICT', 'A category with this name already exists in this company');

function defaultsData(d: CategoryDefaults) {
  return {
    ...(d.defaultFrequencyUnit !== undefined ? { defaultFrequencyUnit: d.defaultFrequencyUnit } : {}),
    ...(d.defaultFrequencyInterval !== undefined ? { defaultFrequencyInterval: d.defaultFrequencyInterval } : {}),
    ...(d.defaultAmountType !== undefined ? { defaultAmountType: d.defaultAmountType } : {}),
    ...(d.defaultReminderOffsets !== undefined
      ? { defaultReminderOffsets: d.defaultReminderOffsets === null ? null : ([...new Set(d.defaultReminderOffsets)].sort((a, b) => b - a) as Prisma.InputJsonValue) }
      : {}),
    ...(d.defaultPaymentMethod !== undefined ? { defaultPaymentMethod: d.defaultPaymentMethod } : {}),
  } as Prisma.CategoryUncheckedUpdateInput;
}

/** A category the caller can see (404 otherwise). */
export async function loadCategory(ctx: AppContext, req: Request, id: string) {
  const c = await ctx.db.category.findFirst({ where: { id, workspaceId: workspaceIdOf(req) }, include: { parent: { select: { id: true, name: true } } } });
  if (!c) throw notFound('Category');
  assertCompanyVisible(req, c.companyId);
  return c;
}

/** The parent must be a top-level category of the same company (one level only). */
async function assertParent(db: Db, companyId: string, parentId: string, selfId?: string) {
  if (parentId === selfId) throw badRequest('A category can’t be its own parent');
  const parent = await db.category.findFirst({ where: { id: parentId, companyId } });
  if (!parent) throw badRequest('Choose a parent category from the same company');
  if (parent.parentId) throw badRequest('Sub-categories can’t have their own sub-categories');
  if (selfId && (await db.category.count({ where: { parentId: selfId } })) > 0) {
    throw badRequest('This category has sub-categories, so it can’t become one');
  }
}

export async function listCategories(ctx: AppContext, req: Request, f: { companyId?: string; includeArchived?: boolean }) {
  const workspaceId = workspaceIdOf(req);
  const visible = visibleCompanyIds(accessOf(req));
  const companyFilter = f.companyId
    ? { companyId: visible && !visible.includes(f.companyId) ? '__none__' : f.companyId }
    : visible
      ? { companyId: { in: visible } }
      : {};
  const rows = await ctx.db.category.findMany({
    where: { workspaceId, ...companyFilter, ...(f.includeArchived ? {} : { archivedAt: null }) },
    include: { parent: { select: { id: true, name: true } }, _count: { select: { bills: { where: { status: { not: 'ARCHIVED' } } } } } },
    orderBy: [{ companyId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map((c) => categoryView(c, c._count.bills));
}

export async function createCategory(ctx: AppContext, req: Request, input: CategoryInput) {
  const workspaceId = workspaceIdOf(req);
  assertCan(req, 'categories:manage', input.companyId);
  const company = await ctx.db.company.findFirst({ where: { id: input.companyId, workspaceId } });
  if (!company) throw notFound('Company');
  if (input.parentId) await assertParent(ctx.db, input.companyId, input.parentId);
  if (input.parentId && input.subcategories?.length) throw badRequest('Sub-categories can’t have their own sub-categories');
  try {
    const created = await ctx.db.$transaction(async (tx) => {
      const last = await tx.category.aggregate({ where: { companyId: input.companyId, parentId: input.parentId ?? null }, _max: { sortOrder: true } });
      const c = await tx.category.create({
        data: {
          workspaceId,
          companyId: input.companyId,
          parentId: input.parentId ?? null,
          name: input.name.trim(),
          icon: input.icon ?? DEFAULT_CATEGORY_STYLE.icon,
          color: input.color ?? DEFAULT_CATEGORY_STYLE.color,
          description: input.description?.trim() || null,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
          ...(defaultsData(input) as object),
        },
      });
      for (const [i, sub] of [...new Set((input.subcategories ?? []).map((s) => s.trim()).filter(Boolean))].entries()) {
        await tx.category.create({ data: { workspaceId, companyId: input.companyId, parentId: c.id, name: sub, icon: c.icon, color: c.color, sortOrder: i } });
      }
      return c;
    });
    await audit(ctx, workspaceId, userIdOf(req), 'category.create', 'Category', created.id, { name: created.name, companyId: input.companyId });
    return categoryView({ ...created, parent: null });
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicate();
    throw err;
  }
}

export async function updateCategory(ctx: AppContext, req: Request, id: string, input: Partial<Omit<CategoryInput, 'companyId' | 'subcategories'>>) {
  const existing = await loadCategory(ctx, req, id);
  assertCan(req, 'categories:manage', existing.companyId);
  if (input.parentId) await assertParent(ctx.db, existing.companyId, input.parentId, id);
  try {
    const c = await ctx.db.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(defaultsData(input) as object),
      },
      include: { parent: { select: { id: true, name: true } } },
    });
    await audit(ctx, workspaceIdOf(req), userIdOf(req), 'category.update', 'Category', id, { fields: Object.keys(input) });
    return categoryView(c);
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicate();
    throw err;
  }
}

/** Set the order of a company's categories (top level, or the children of one parent). */
export async function reorderCategories(ctx: AppContext, req: Request, companyId: string, ids: string[]) {
  assertCan(req, 'categories:manage', companyId);
  const rows = await ctx.db.category.findMany({ where: { id: { in: ids }, companyId, workspaceId: workspaceIdOf(req) }, select: { id: true, parentId: true } });
  if (rows.length !== new Set(ids).size) throw badRequest('Every category must belong to this company');
  if (new Set(rows.map((r) => r.parentId)).size > 1) throw badRequest('Reorder one level at a time');
  await ctx.db.$transaction(ids.map((cid, i) => ctx.db.category.update({ where: { id: cid }, data: { sortOrder: i } })));
}

export async function setCategoryArchived(ctx: AppContext, req: Request, id: string, archived: boolean) {
  const existing = await loadCategory(ctx, req, id);
  assertCan(req, 'categories:manage', existing.companyId);
  const at = archived ? ctx.clock.now() : null;
  // Archiving a parent archives its sub-categories too; restoring brings back the ones archived with it.
  const children = archived
    ? [{ parentId: id, archivedAt: null }]
    : existing.archivedAt
      ? [{ parentId: id, archivedAt: existing.archivedAt }]
      : [];
  await ctx.db.category.updateMany({ where: { OR: [{ id }, ...children] }, data: { archivedAt: at } });
  await audit(ctx, workspaceIdOf(req), userIdOf(req), archived ? 'category.archive' : 'category.unarchive', 'Category', id);
  return categoryView({ ...existing, archivedAt: at });
}

/**
 * Move everything from `id` into `intoId` (same company), then delete `id`: its bills, its
 * sub-categories (they join the target, or become top level when the target is a sub-category)
 * and its budget (dropped when the target already has one).
 */
async function moveInto(tx: Tx, from: { id: string; workspaceId: string }, intoId: string, intoIsChild: boolean) {
  const bills = await tx.bill.updateMany({ where: { categoryId: from.id }, data: { categoryId: intoId } });
  await tx.category.updateMany({ where: { parentId: from.id }, data: { parentId: intoIsChild ? null : intoId } });
  const targetBudget = await tx.budget.findFirst({ where: { workspaceId: from.workspaceId, categoryId: intoId } });
  if (targetBudget) await tx.budget.deleteMany({ where: { categoryId: from.id } });
  else await tx.budget.updateMany({ where: { categoryId: from.id }, data: { categoryId: intoId, scope: intoId } });
  await tx.category.delete({ where: { id: from.id } });
  return bills.count;
}

export async function mergeCategory(ctx: AppContext, req: Request, id: string, intoId: string) {
  if (id === intoId) throw badRequest('Choose a different category to merge into');
  const from = await loadCategory(ctx, req, id);
  const into = await loadCategory(ctx, req, intoId);
  assertCan(req, 'categories:manage', from.companyId);
  if (into.companyId !== from.companyId) throw badRequest('Merge into a category of the same company');
  if (into.parentId === from.id) throw badRequest('Merge into a category that isn’t one of its sub-categories');
  const moved = await ctx.db.$transaction((tx) => moveInto(tx, from, intoId, into.parentId !== null));
  await audit(ctx, workspaceIdOf(req), userIdOf(req), 'category.merge', 'Category', id, { into: intoId, bills: moved });
  return { merged: true, movedBills: moved };
}

/** Delete; a category with bills needs `moveToId` (409 CATEGORY_IN_USE otherwise). */
export async function deleteCategory(ctx: AppContext, req: Request, id: string, moveToId?: string) {
  const c = await loadCategory(ctx, req, id);
  assertCan(req, 'categories:manage', c.companyId);
  const used = await ctx.db.bill.count({ where: { categoryId: id } });
  if (used > 0 && !moveToId) {
    throw new AppError(409, 'CATEGORY_IN_USE', `Move its ${used} bill${used === 1 ? '' : 's'} to another category first`);
  }
  if (moveToId) {
    await mergeCategory(ctx, req, id, moveToId);
    return;
  }
  await ctx.db.$transaction(async (tx) => {
    await tx.category.updateMany({ where: { parentId: id }, data: { parentId: null } });
    await tx.budget.deleteMany({ where: { categoryId: id } });
    await tx.category.delete({ where: { id } });
  });
  await audit(ctx, workspaceIdOf(req), userIdOf(req), 'category.delete', 'Category', id, { name: c.name });
}

/** Give a new company its first categories: none, picked suggestions, or a copy of another company's. */
export async function seedCompanyCategories(db: Db, workspaceId: string, companyId: string, start: CategoryStart) {
  if (start.mode === 'empty') return 0;
  type Seed = { name: string; icon: string; color: string; description?: string | null; defaults?: CategoryDefaults; children: { name: string; icon: string; color: string }[] };
  let seeds: Seed[];
  if (start.mode === 'suggestions') {
    const wanted = start.names ? new Set(start.names.map((n) => n.toLowerCase())) : null;
    seeds = CATEGORY_SUGGESTIONS.filter((s) => !wanted || wanted.has(s.name.toLowerCase())).map((s) => ({
      name: s.name,
      icon: s.icon,
      color: s.color,
      children: start.withSubcategories ? (s.children ?? []).map((n) => ({ name: n, icon: s.icon, color: s.color })) : [],
    }));
  } else {
    const from = await db.category.findMany({
      where: { companyId: start.fromCompanyId, workspaceId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (!from.length && !(await db.company.findFirst({ where: { id: start.fromCompanyId, workspaceId } }))) throw notFound('Company');
    seeds = from
      .filter((c) => !c.parentId)
      .map((c) => ({
        name: c.name,
        icon: c.icon,
        color: c.color,
        description: c.description,
        defaults: {
          defaultFrequencyUnit: c.defaultFrequencyUnit,
          defaultFrequencyInterval: c.defaultFrequencyInterval,
          defaultAmountType: c.defaultAmountType,
          defaultReminderOffsets: c.defaultReminderOffsets as number[] | null,
          defaultPaymentMethod: c.defaultPaymentMethod,
        },
        children: from.filter((x) => x.parentId === c.id).map((x) => ({ name: x.name, icon: x.icon, color: x.color })),
      }));
  }
  let n = 0;
  for (const [i, s] of seeds.entries()) {
    const parent = await db.category.create({
      data: { workspaceId, companyId, name: s.name, icon: s.icon, color: s.color, description: s.description ?? null, sortOrder: i, ...(defaultsData(s.defaults ?? {}) as object) },
    });
    n++;
    for (const [j, ch] of s.children.entries()) {
      await db.category.create({ data: { workspaceId, companyId, parentId: parent.id, name: ch.name, icon: ch.icon, color: ch.color, sortOrder: j } });
      n++;
    }
  }
  return n;
}

/** The suggestion list (config/categorySuggestions.ts) for the pickers. */
export function suggestions() {
  return CATEGORY_SUGGESTIONS.map((s) => ({ name: s.name, icon: s.icon, color: s.color, children: s.children ?? [] }));
}
