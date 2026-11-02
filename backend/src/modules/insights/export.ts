import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

import { formatLongDate, formatMoney, minorUnits } from '../../lib/format.js';

import type { Report } from './service.js';

const TEAL = '#0F5C5C';
const INK = '#172121';
const MUTED = '#667373';
const LINE = '#E7EBEB';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

export function reportTitle(r: Report): string {
  return r.period === 'year' ? `Annual report ${r.year}` : `Monthly report — ${monthLabel(`${r.year}-${String(r.month).padStart(2, '0')}`)}`;
}

export function reportFileName(r: Report, ext: 'pdf' | 'xlsx'): string {
  const slug = r.organization.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dueora';
  const period = r.period === 'year' ? `${r.year}` : `${r.year}-${String(r.month).padStart(2, '0')}`;
  return `${slug}-report-${period}.${ext}`;
}

/** Strip characters the standard PDF fonts can't draw (emoji etc.). */
function pdfSafe(text: string): string {
  return text.replace(/[^ -ɏ€£’‘“”–—·•…]/g, '').trim();
}

function money(amountMinor: number, currency: string): string {
  return pdfSafe(formatMoney(amountMinor, currency));
}

function totalsLine(t: { totals: { currency: string; amountMinor: number }[] }): string {
  return t.totals.map((x) => money(x.amountMinor, x.currency)).join(' + ') || '—';
}

/** Branded A4 PDF of a report. */
export function reportPdf(r: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: reportTitle(r), Author: 'DueOra' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width - 96;
    const cur = r.defaultCurrency;

    // Header band
    doc.rect(0, 0, doc.page.width, 92).fill(TEAL);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22).text('DueOra', 48, 30);
    doc.font('Helvetica').fontSize(10).text('Your dues, on time.', 48, 58);
    doc.font('Helvetica-Bold').fontSize(12).text(pdfSafe(r.organization.name), 48, 32, { width, align: 'right' });
    doc.font('Helvetica').fontSize(10).text(reportTitle(r), 48, 52, { width, align: 'right' });
    doc.text(`${formatLongDate(r.from)} – ${formatLongDate(r.to)}`, 48, 66, { width, align: 'right' });

    doc.fillColor(INK).moveDown(0);
    let y = 116;

    // Summary tiles
    const tiles = [
      ['Committed', r.totals.committed],
      ['Paid', r.totals.paid],
      ['Outstanding', r.totals.outstanding],
      ['Overdue now', r.totals.overdue],
    ] as const;
    const tileW = (width - 24) / 4;
    tiles.forEach(([label, t], i) => {
      const x = 48 + i * (tileW + 8);
      doc.roundedRect(x, y, tileW, 64, 8).fillAndStroke('#F7F8FA', LINE);
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label.toUpperCase(), x + 10, y + 10, { width: tileW - 20 });
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(money(t.converted.amountMinor, cur), x + 10, y + 24, { width: tileW - 20 });
      doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(`${t.count} item${t.count === 1 ? '' : 's'}`, x + 10, y + 44, { width: tileW - 20 });
    });
    y += 80;
    if (r.missingRates.length) {
      doc.fillColor(MUTED).fontSize(8).text(`Converted totals exclude ${r.missingRates.join(', ')} (no exchange rate set).`, 48, y);
      y += 16;
    }

    const section = (title: string) => {
      if (y > doc.page.height - 140) {
        doc.addPage();
        y = 48;
      }
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(title, 48, y);
      y += 20;
    };
    const table = (headers: string[], rows: string[][], widths: number[], alignRight: number[] = []) => {
      const drawRow = (cells: string[], bold: boolean, fill?: string) => {
        if (y > doc.page.height - 60) {
          doc.addPage();
          y = 48;
        }
        if (fill) doc.rect(48, y - 4, width, 18).fill(fill);
        let x = 48;
        cells.forEach((cell, i) => {
          doc.fillColor(bold ? MUTED : INK).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 8 : 9)
            .text(pdfSafe(cell), x + 4, y, { width: widths[i]! - 8, align: alignRight.includes(i) ? 'right' : 'left', lineBreak: false, ellipsis: true });
          x += widths[i]!;
        });
        y += 18;
      };
      drawRow(headers, true, '#EDF7F6');
      rows.forEach((row, i) => drawRow(row, false, i % 2 ? '#FAFBFB' : undefined));
      y += 10;
    };

    if (r.byCategory.length) {
      section('Spending by category');
      table(
        ['Category', 'Share', `Paid (${cur})`, 'In original currencies'],
        r.byCategory.map((c) => [c.name, `${c.share}%`, money(c.amountMinor, cur), c.totals.map((t) => money(t.amountMinor, t.currency)).join(' + ')]),
        [150, 60, 110, width - 320],
        [1, 2],
      );
    }

    if (r.period === 'year') {
      section('Month by month');
      table(
        ['Month', `Paid (${cur})`, `Still due (${cur})`],
        r.months.map((m) => [monthLabel(m.month), money(m.paidMinor, cur), money(m.outstandingMinor, cur)]),
        [width / 3, width / 3, width / 3],
        [1, 2],
      );
    }

    section('12-month forecast');
    table(
      ['Month', `Expected (${cur})`],
      r.forecast.map((f) => [monthLabel(f.month), money(f.amountMinor, cur)]),
      [width / 2, width / 2],
      [1],
    );

    if (r.overdue.length) {
      section('Overdue now');
      table(
        ['Payment', 'Provider', 'Was due', 'Owed'],
        r.overdue.map((o) => [o.platform ? `${o.name} · ${o.platform.name}` : o.name, o.provider, formatLongDate(o.nextDueDate), money(o.remainingMinor, o.currency)]),
        [170, 130, 100, width - 400],
        [3],
      );
    }

    if (r.outstanding.length) {
      section('Still to pay in this period');
      table(
        ['Due', 'Payment', 'Provider', 'Amount'],
        r.outstanding.map((o) => [formatLongDate(o.date), o.obligation.platform ? `${o.obligation.name} · ${o.obligation.platform.name}` : o.obligation.name, o.obligation.provider, money(o.amountMinor, o.obligation.currency)]),
        [90, 180, 130, width - 400],
        [3],
      );
    }

    if (r.payments.length) {
      section('Payments recorded');
      table(
        ['Paid on', 'Payment', 'Category', 'Amount'],
        r.payments.map((p) => [formatLongDate(p.paidOn), p.platform ? `${p.name} · ${p.platform}` : p.name, p.category, money(p.amountMinor, p.currency)]),
        [90, 180, 130, width - 400],
        [3],
      );
    }

    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`Generated by DueOra on ${formatLongDate(r.today)}. Totals in ${cur} use your workspace's exchange rates.`, 48, doc.page.height - 40, { width, align: 'center' });
    doc.end();
  });
}

/** Excel workbook: Summary, Payments, Outstanding and Forecast sheets with real numbers. */
export async function reportXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DueOra';
  wb.created = new Date(`${r.today}T00:00:00Z`);
  const cur = r.defaultCurrency;
  const major = (minor: number, currency: string) => minor / 10 ** minorUnits(currency);
  const header = (ws: ExcelJS.Worksheet) => {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5C5C' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Item', key: 'item', width: 28 },
    { header: `Amount (${cur})`, key: 'amount', width: 18, style: { numFmt: '#,##0.00' } },
    { header: 'Count', key: 'count', width: 10 },
    { header: 'Original currencies', key: 'detail', width: 40 },
  ];
  header(summary);
  summary.addRows([
    { item: 'Workspace', detail: r.organization.name },
    { item: 'Period', detail: `${r.from} to ${r.to}` },
    ...(['committed', 'paid', 'outstanding', 'overdue'] as const).map((k) => ({
      item: k[0]!.toUpperCase() + k.slice(1),
      amount: major(r.totals[k].converted.amountMinor, cur),
      count: r.totals[k].count,
      detail: totalsLine(r.totals[k]),
    })),
  ]);
  summary.addRow({});
  summary.addRow({ item: 'By category' }).font = { bold: true };
  for (const c of r.byCategory) summary.addRow({ item: c.name, amount: major(c.amountMinor, cur), detail: `${c.share}%` });

  const payments = wb.addWorksheet('Payments');
  payments.columns = [
    { header: 'Paid on', key: 'paidOn', width: 12 },
    { header: 'Cycle due', key: 'cycle', width: 12 },
    { header: 'Payment', key: 'name', width: 28 },
    { header: 'Platform', key: 'platform', width: 16 },
    { header: 'Provider', key: 'provider', width: 22 },
    { header: 'Category', key: 'category', width: 24 },
    { header: 'Amount', key: 'amount', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Currency', key: 'currency', width: 10 },
  ];
  header(payments);
  for (const p of r.payments) {
    payments.addRow({ paidOn: p.paidOn, cycle: p.cycleDueDate, name: p.name, platform: p.platform ?? '', provider: p.provider, category: p.category, amount: major(p.amountMinor, p.currency), currency: p.currency });
  }

  const outstanding = wb.addWorksheet('Outstanding');
  outstanding.columns = [
    { header: 'Due', key: 'due', width: 12 },
    { header: 'Payment', key: 'name', width: 28 },
    { header: 'Platform', key: 'platform', width: 16 },
    { header: 'Provider', key: 'provider', width: 22 },
    { header: 'Amount', key: 'amount', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Overdue', key: 'overdue', width: 10 },
  ];
  header(outstanding);
  for (const o of r.outstanding) {
    outstanding.addRow({ due: o.date, name: o.obligation.name, platform: o.obligation.platform?.name ?? '', provider: o.obligation.provider, amount: major(o.amountMinor, o.obligation.currency), currency: o.obligation.currency, overdue: o.overdue ? 'Yes' : '' });
  }

  const forecast = wb.addWorksheet('Forecast');
  forecast.columns = [
    { header: 'Month', key: 'month', width: 14 },
    { header: `Expected (${cur})`, key: 'amount', width: 18, style: { numFmt: '#,##0.00' } },
  ];
  header(forecast);
  for (const f of r.forecast) forecast.addRow({ month: monthLabel(f.month), amount: major(f.amountMinor, cur) });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
