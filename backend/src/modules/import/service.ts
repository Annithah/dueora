import ExcelJS from 'exceljs';

import type { AppContext } from '../../context.js';
import { CATEGORY_SUGGESTIONS, DEFAULT_CATEGORY_STYLE } from '../../config/categorySuggestions.js';
import { canIn, type Access } from '../../domain/access.js';
import { calculateNextDueDate, parseDate } from '../../domain/schedule.js';
import { guessCategoryName, parseAmountCents, parseDateCell, parseFrequency } from '../../domain/guess.js';
import { badRequest } from '../../http/errors.js';
import { audit } from '../workspaces/service.js';

/**
 * Settings → Import from spreadsheet. The organisation's existing payment sheet (CSV or
 * Excel) → DueOra bills in one step: template → map columns → preview with
 * validation → import the valid rows. Nothing is written until "commit".
 */

export const FIELDS = ['company', 'category', 'name', 'provider', 'amount', 'frequency', 'nextDueDate'] as const;
export type ImportField = (typeof FIELDS)[number];
export type Mapping = Partial<Record<ImportField, number>>;

export const TEMPLATE_HEADERS: Record<ImportField, string> = {
  company: 'Company',
  category: 'Category',
  name: 'Bill name',
  provider: 'Provider',
  amount: 'Amount (USD)',
  frequency: 'Frequency',
  nextDueDate: 'Next due date',
};

const MAX_ROWS = 1000;
/** Byte-order mark: Excel needs it to read UTF-8 CSV correctly. */
const BOM = String.fromCharCode(0xfeff);
const MAX_BYTES = 2 * 1024 * 1024;

type Cell = string | number | Date | null;

/** Minimal RFC 4180 CSV reader (quotes, escaped quotes, CRLF, ; or , separators). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(new RegExp('^' + BOM), '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

async function parseXlsx(buffer: Buffer): Promise<Cell[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const values: Cell[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = r.getCell(c).value;
      if (v === null || v === undefined) values.push(null);
      else if (v instanceof Date || typeof v === 'number' || typeof v === 'string') values.push(v);
      else if (typeof v === 'object' && 'result' in v) values.push((v.result as Cell) ?? null);
      else if (typeof v === 'object' && 'text' in v) values.push(String(v.text));
      else if (typeof v === 'object' && 'richText' in v) values.push(v.richText.map((t) => t.text).join(''));
      else values.push(String(v));
    }
    rows.push(values);
  });
  return rows;
}

export async function readSheet(fileName: string, base64: string): Promise<Cell[][]> {
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) throw badRequest('The file is empty');
  if (buffer.length > MAX_BYTES) throw badRequest('The file is too large (max 2 MB)');
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b; // .xlsx is a zip archive
  if (/\.xlsx$/i.test(fileName) || isZip) {
    try {
      return await parseXlsx(buffer);
    } catch {
      throw badRequest('This Excel file could not be read. Save it as .xlsx or CSV and try again.');
    }
  }
  if (/\.xls$/i.test(fileName)) throw badRequest('Old .xls files are not supported. Save as .xlsx or CSV.');
  return parseCsv(buffer.toString('utf8'));
}

const HEADER_HINTS: Record<ImportField, RegExp> = {
  company: /^(company|organi[sz]ation|business|entity|client|soci[eé]t[eé])/i,
  category: /^(category|type|cat[eé]gorie|group)/i,
  name: /^(bill|name|service|item|description|title|nom|bill name)/i,
  provider: /^(provider|vendor|supplier|fournisseur|paid to|payee)/i,
  amount: /^(amount|price|cost|usd|\$|montant|fee|total)/i,
  frequency: /^(frequency|billing|cycle|period|recurr|fr[eé]quence|interval)/i,
  nextDueDate: /^(next( due)?( date)?|due( date)?|renewal|[eé]ch[eé]ance|expir|date)/i,
};

/** Header row → best guess of which column holds which field. */
export function suggestMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const taken = new Set<number>();
  const order: ImportField[] = ['nextDueDate', 'amount', 'frequency', 'company', 'category', 'provider', 'name'];
  for (const field of order) {
    const idx = headers.findIndex((h, i) => !taken.has(i) && HEADER_HINTS[field].test(h.trim()));
    if (idx >= 0) {
      mapping[field] = idx;
      taken.add(idx);
    }
  }
  return mapping;
}

export interface PreviewRow {
  /** 1-based row number in the sheet (header = 1). */
  line: number;
  values: Record<ImportField, string>;
  parsed: {
    company: string;
    category: string;
    categoryGuessed: boolean;
    name: string;
    provider: string | null;
    amountCents: number | null;
    frequencyUnit: 'WEEK' | 'MONTH' | 'YEAR' | 'ONCE' | null;
    frequencyInterval: number;
    nextDueDate: string | null;
  };
  errors: string[];
  warnings: string[];
}

const text = (c: Cell | undefined): string =>
  c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim();

/**
 * `access` (the caller's company access) limits the companies rows may go to. Only admins
 * may create companies, so for anyone else an unknown company name is a row error.
 */
export async function buildPreview(ctx: AppContext, workspaceId: string, rows: Cell[][], mapping: Mapping | undefined, access?: Access) {
  if (rows.length < 2) throw badRequest('The file needs a header row and at least one bill');
  const headers = rows[0]!.map((h) => text(h));
  const map = mapping ?? suggestMapping(headers);
  const missing = (['name', 'amount', 'frequency', 'nextDueDate'] as const).filter((f) => map[f] === undefined);
  const body = rows.slice(1, MAX_ROWS + 1);

  const isAdmin = !access || access.workspaceRole === 'ADMIN';
  const [allCompanies, categories] = await Promise.all([
    ctx.db.company.findMany({ where: { workspaceId, archivedAt: null }, orderBy: { createdAt: 'asc' } }),
    ctx.db.category.findMany({ where: { workspaceId } }),
  ]);
  const companies = access ? allCompanies.filter((c) => canIn(access, 'bills:manage', c.id)) : allCompanies;
  // Categories belong to a company: "companyId|name" → stored name.
  const categoryByName = new Map(categories.map((c) => [`${c.companyId}|${c.name.toLowerCase()}`, c.name]));
  const defaultCompany = companies[0]?.name ?? '';

  const preview: PreviewRow[] = body.map((r, i) => {
    const raw = (f: ImportField): Cell => (map[f] === undefined ? null : (r[map[f]!] ?? null));
    const values = Object.fromEntries(FIELDS.map((f) => [f, text(raw(f))])) as Record<ImportField, string>;
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = values.name;
    if (!name) errors.push('Name is missing');
    else if (name.length > 120) errors.push('Name is longer than 120 characters');

    let company = values.company;
    if (!company) {
      if (defaultCompany) {
        company = defaultCompany;
        warnings.push(`No company — will use "${defaultCompany}"`);
      } else errors.push('Company is missing');
    } else if (!companies.some((c) => c.name.toLowerCase() === company.toLowerCase())) {
      if (isAdmin) warnings.push(`New company "${company}" will be created`);
      else errors.push(`You can't add bills to "${company}". Ask an admin to create it or give you access.`);
    } else company = companies.find((c) => c.name.toLowerCase() === company.toLowerCase())!.name;
    const companyId = companies.find((c) => c.name.toLowerCase() === company.toLowerCase())?.id;

    let category = values.category;
    let categoryGuessed = false;
    if (!category) {
      category = guessCategoryName(`${name} ${values.provider}`) ?? 'Other';
      categoryGuessed = true;
      warnings.push(`Category guessed: ${category}`);
    } else if (companyId && categoryByName.has(`${companyId}|${category.toLowerCase()}`)) {
      category = categoryByName.get(`${companyId}|${category.toLowerCase()}`)!;
    } else {
      warnings.push(`New category "${category}" will be created${company ? ` in ${company}` : ''}`);
    }

    const amountRaw = raw('amount');
    const amountCents = amountRaw === null ? null : parseAmountCents(typeof amountRaw === 'number' ? amountRaw : text(amountRaw));
    if (amountCents === null) errors.push(values.amount ? `"${values.amount}" is not an amount` : 'Amount is missing');

    const freq = parseFrequency(values.frequency);
    if (!freq) errors.push(values.frequency ? `"${values.frequency}" is not a frequency we know (try Monthly, Quarterly, Yearly…)` : 'Frequency is missing');

    const dateRaw = raw('nextDueDate');
    const nextDueDate = dateRaw === null ? null : parseDateCell(dateRaw);
    if (!nextDueDate) errors.push(values.nextDueDate ? `"${values.nextDueDate}" is not a date` : 'Next due date is missing');

    return {
      line: i + 2,
      values,
      parsed: {
        company,
        category,
        categoryGuessed,
        name,
        provider: values.provider || null,
        amountCents,
        frequencyUnit: freq?.unit ?? null,
        frequencyInterval: freq?.interval ?? 1,
        nextDueDate,
      },
      errors,
      warnings,
    };
  });

  return {
    headers,
    mapping: map,
    missingColumns: missing,
    truncated: rows.length - 1 > MAX_ROWS,
    total: preview.length,
    valid: preview.filter((p) => p.errors.length === 0).length,
    rows: preview,
  };
}


/** Import every valid row. Missing companies and categories are created. Returns counts. */
export async function commitImport(
  ctx: AppContext,
  workspaceId: string,
  userId: string,
  today: string,
  rows: Cell[][],
  mapping: Mapping | undefined,
  access?: Access,
) {
  const preview = await buildPreview(ctx, workspaceId, rows, mapping, access);
  if (preview.missingColumns.length) throw badRequest(`Map these columns first: ${preview.missingColumns.join(', ')}`);
  const valid = preview.rows.filter((r) => r.errors.length === 0);
  if (valid.length === 0) throw badRequest('No valid rows to import');

  const workspace = await ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { defaultReminderOffsets: true } });
  const companyIds = new Map<string, string>();
  const categoryIds = new Map<string, string>();
  for (const c of await ctx.db.company.findMany({ where: { workspaceId } })) companyIds.set(c.name.toLowerCase(), c.id);
  for (const c of await ctx.db.category.findMany({ where: { workspaceId } })) categoryIds.set(`${c.companyId}|${c.name.toLowerCase()}`, c.id);

  let createdCompanies = 0;
  let createdCategories = 0;
  await ctx.db.$transaction(async (tx) => {
    for (const r of valid) {
      const p = r.parsed;
      let companyId = companyIds.get(p.company.toLowerCase());
      if (!companyId) {
        companyId = (await tx.company.create({ data: { workspaceId, name: p.company.slice(0, 60) } })).id;
        companyIds.set(p.company.toLowerCase(), companyId);
        createdCompanies++;
      }
      const key = `${companyId}|${p.category.toLowerCase()}`;
      let categoryId = categoryIds.get(key);
      if (!categoryId) {
        // A suggested name keeps its suggested icon and colour.
        const style = CATEGORY_SUGGESTIONS.find((x) => x.name.toLowerCase() === p.category.toLowerCase()) ?? DEFAULT_CATEGORY_STYLE;
        categoryId = (await tx.category.create({ data: { workspaceId, companyId, name: p.category.slice(0, 60), icon: style.icon, color: style.color } })).id;
        categoryIds.set(key, categoryId);
        createdCategories++;
      }
      const unit = p.frequencyUnit!;
      const interval = unit === 'ONCE' ? 1 : p.frequencyInterval;
      const anchorDay = parseDate(p.nextDueDate!).d;
      // A past date in a recurring sheet means "the last renewal": roll forward to the next one.
      const nextDueDate = unit === 'ONCE' ? p.nextDueDate! : calculateNextDueDate(p.nextDueDate!, unit, interval, anchorDay, today);
      await tx.bill.create({
        data: {
          workspaceId,
          companyId,
          categoryId,
          name: p.name,
          provider: p.provider,
          amountCents: p.amountCents!,
          frequencyUnit: unit,
          frequencyInterval: interval,
          anchorDay,
          startDate: p.nextDueDate! < nextDueDate ? p.nextDueDate! : nextDueDate,
          nextDueDate,
          reminderOffsets: workspace.defaultReminderOffsets as number[],
        },
      });
    }
  });
  await audit(ctx, workspaceId, userId, 'bill.import', 'Workspace', workspaceId, { imported: valid.length });
  return { imported: valid.length, skipped: preview.total - valid.length, createdCompanies, createdCategories };
}

/** Header-only template (no sample rows, so nothing fake can be imported by accident). */
export async function template(format: 'csv' | 'xlsx'): Promise<Buffer> {
  const headers = FIELDS.map((f) => TEMPLATE_HEADERS[f]);
  if (format === 'csv') return Buffer.from(`${BOM}${headers.join(',')}\r\n`, 'utf8');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DueOra';
  const ws = wb.addWorksheet('Bills');
  ws.columns = headers.map((h) => ({ header: h, width: Math.max(16, h.length + 4) }));
  ws.getRow(1).font = { bold: true };
  const help = wb.addWorksheet('How to fill');
  help.columns = [{ header: 'Column', width: 22 }, { header: 'What to write', width: 80 }];
  help.getRow(1).font = { bold: true };
  help.addRows([
    ['Company', 'Which of your companies pays it. New names are created for you.'],
    ['Category', 'Optional. One of your categories; DueOra guesses it when empty.'],
    ['Bill name', 'Required. What you pay for.'],
    ['Provider', 'Optional. Who you pay.'],
    ['Amount (USD)', 'Required. US dollars, e.g. 49.99'],
    ['Frequency', 'Required. Weekly, Every 2 weeks, Monthly, Every 2 months, Quarterly, Every 6 months, Yearly or One-time'],
    ['Next due date', 'Required. YYYY-MM-DD or DD/MM/YYYY. A past date rolls forward to the next renewal.'],
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
