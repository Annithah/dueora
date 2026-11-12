import type { Request } from 'express';

import type { AppContext } from '../../context.js';
import type { CustomFieldType, Prisma } from '../../generated/prisma/client.js';
import { AppError, badRequest, notFound } from '../../http/errors.js';
import { assertCan, assertCompanyVisible, userIdOf, workspaceIdOf } from '../../http/middleware/auth.js';
import { audit } from '../workspaces/service.js';

/**
 * A company's own extra fields on its bills (Finalize brief, Part 3): at most 10 per company,
 * TEXT, NUMBER, DATE or DROPDOWN, on every bill or only on chosen categories. Values live on
 * the bill (`customValues`, keyed by field id) and appear on the form, detail, filters and exports.
 */
export const MAX_CUSTOM_FIELDS = 10;

export interface CustomFieldInput {
  name: string;
  type: CustomFieldType;
  options?: string[] | null;
  categoryIds?: string[] | null;
  required?: boolean;
}

type FieldRow = Prisma.CustomFieldGetPayload<object>;

export function fieldView(f: FieldRow) {
  return {
    id: f.id,
    companyId: f.companyId,
    name: f.name,
    type: f.type,
    options: (f.options as string[] | null) ?? null,
    categoryIds: (f.categoryIds as string[] | null) ?? null,
    required: f.required,
    sortOrder: f.sortOrder,
  };
}
export type FieldView = ReturnType<typeof fieldView>;

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === 'P2002';

async function cleanShape(ctx: AppContext, companyId: string, input: Partial<CustomFieldInput>, type: CustomFieldType) {
  const out: Prisma.CustomFieldUncheckedUpdateInput = {};
  if (input.name !== undefined) out.name = input.name.trim();
  if (input.type !== undefined) out.type = input.type;
  if (input.required !== undefined) out.required = input.required;
  if (input.options !== undefined || input.type !== undefined) {
    const options = [...new Set((input.options ?? []).map((o) => o.trim()).filter(Boolean))];
    if (type === 'DROPDOWN' && options.length < 2) throw badRequest('A dropdown needs at least two choices');
    out.options = type === 'DROPDOWN' ? (options as Prisma.InputJsonValue) : (null as unknown as Prisma.InputJsonValue);
  }
  if (input.categoryIds !== undefined) {
    if (input.categoryIds === null || input.categoryIds.length === 0) out.categoryIds = null as unknown as Prisma.InputJsonValue;
    else {
      const ids = [...new Set(input.categoryIds)];
      const found = await ctx.db.category.count({ where: { id: { in: ids }, companyId } });
      if (found !== ids.length) throw badRequest('Choose categories of this company');
      out.categoryIds = ids as Prisma.InputJsonValue;
    }
  }
  return out;
}

export async function listFields(ctx: AppContext, req: Request, companyId: string) {
  assertCompanyVisible(req, companyId);
  const rows = await ctx.db.customField.findMany({ where: { companyId, workspaceId: workspaceIdOf(req) }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  return rows.map(fieldView);
}

export async function createField(ctx: AppContext, req: Request, companyId: string, input: CustomFieldInput) {
  const workspaceId = workspaceIdOf(req);
  assertCan(req, 'categories:manage', companyId);
  if (!(await ctx.db.company.findFirst({ where: { id: companyId, workspaceId } }))) throw notFound('Company');
  const count = await ctx.db.customField.count({ where: { companyId } });
  if (count >= MAX_CUSTOM_FIELDS) throw new AppError(409, 'LIMIT_REACHED', `A company can have at most ${MAX_CUSTOM_FIELDS} custom fields`);
  const data = await cleanShape(ctx, companyId, { categoryIds: null, ...input }, input.type);
  try {
    const f = await ctx.db.customField.create({
      data: { ...(data as object), workspaceId, companyId, name: input.name.trim(), type: input.type, sortOrder: count } as Prisma.CustomFieldUncheckedCreateInput,
    });
    await audit(ctx, workspaceId, userIdOf(req), 'customField.create', 'CustomField', f.id, { name: f.name });
    return fieldView(f);
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, 'CONFLICT', 'This company already has a field with that name');
    throw err;
  }
}

async function loadField(ctx: AppContext, req: Request, id: string) {
  const f = await ctx.db.customField.findFirst({ where: { id, workspaceId: workspaceIdOf(req) } });
  if (!f) throw notFound('Custom field');
  assertCan(req, 'categories:manage', f.companyId);
  return f;
}

export async function updateField(ctx: AppContext, req: Request, id: string, input: Partial<CustomFieldInput>) {
  const f = await loadField(ctx, req, id);
  const data = await cleanShape(ctx, f.companyId, input, input.type ?? f.type);
  try {
    return fieldView(await ctx.db.customField.update({ where: { id }, data }));
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, 'CONFLICT', 'This company already has a field with that name');
    throw err;
  }
}

/** Removing a field leaves old values on bills; they are no longer shown or exported. */
export async function deleteField(ctx: AppContext, req: Request, id: string) {
  const f = await loadField(ctx, req, id);
  await ctx.db.customField.delete({ where: { id } });
  await audit(ctx, workspaceIdOf(req), userIdOf(req), 'customField.delete', 'CustomField', id, { name: f.name });
}

/** The fields that apply to a bill in this category. */
export function fieldsFor(fields: FieldView[], categoryId: string): FieldView[] {
  return fields.filter((f) => !f.categoryIds || f.categoryIds.includes(categoryId));
}

export type CustomValues = Record<string, string | number>;

/**
 * Check and normalise a bill's custom values against its company's fields: unknown keys are
 * dropped, empty values removed, types enforced, required fields demanded.
 */
export async function cleanCustomValues(
  ctx: AppContext,
  companyId: string,
  categoryId: string,
  values: Record<string, unknown> | null | undefined,
  { partialOk = false } = {},
): Promise<CustomValues> {
  const fields = fieldsFor(
    (await ctx.db.customField.findMany({ where: { companyId } })).map(fieldView),
    categoryId,
  );
  const out: CustomValues = {};
  for (const f of fields) {
    const raw = values?.[f.id];
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) {
      if (f.required && !partialOk) throw badRequest(`Fill in "${f.name}"`);
      continue;
    }
    if (f.type === 'NUMBER') {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
      if (!Number.isFinite(n)) throw badRequest(`"${f.name}" must be a number`);
      out[f.id] = n;
    } else if (f.type === 'DATE') {
      const s = String(raw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw badRequest(`"${f.name}" must be a date (YYYY-MM-DD)`);
      out[f.id] = s;
    } else if (f.type === 'DROPDOWN') {
      const s = String(raw).trim();
      if (!(f.options ?? []).includes(s)) throw badRequest(`Choose one of the options for "${f.name}"`);
      out[f.id] = s;
    } else {
      out[f.id] = String(raw).trim().slice(0, 500);
    }
  }
  return out;
}

/** A bill's values as [{ fieldId, name, type, value }] for responses and exports (current fields only). */
export function describeValues(fields: FieldView[], categoryId: string, values: unknown) {
  const v = (values ?? {}) as Record<string, string | number>;
  return fieldsFor(fields, categoryId).map((f) => ({ fieldId: f.id, name: f.name, type: f.type, value: v[f.id] ?? null }));
}
