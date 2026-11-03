import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

import { formatLongDate, formatUSD } from '../../lib/format.js';

import type { Report } from './service.js';

const TEAL = '#0F5C5C';
const INK = '#172121';
const MUTED = '#667373';
const LINE = '#E7EBEB';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const USD_FORMAT = '"$"#,##0.00';

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

export function reportTitle(r: Report): string {
  return r.period === 'year'
    ? `Annual report ${r.year}`
    : `Monthly report — ${monthLabel(`${r.year}-${String(r.month).padStart(2, '0')}`)}`;
}

export function reportFileName(r: Report, ext: 'pdf' | 'xlsx'): string {
  const slug =
    r.workspace.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'dueora';
  const period = r.period === 'year' ? `${r.year}` : `${r.year}-${String(r.month).padStart(2, '0')}`;
  return `${slug}-report-${period}.${ext}`;
}

/** Strip characters the standard PDF fonts can't draw (emoji etc.). */
function pdfSafe(text: string): string {
  return text.replace(/[^ -ɏ€£’‘“”–—·•…]/g, '').trim();
}

const dollars = (cents: number) => cents / 100;

/** Branded A4 PDF of a report (all amounts USD). */
export function reportPdf(r: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: reportTitle(r), Author: 'DueOra' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const width = doc.page.width - 96;

    // Header band
    doc.rect(0, 0, doc.page.width, 92).fill(TEAL);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22).text('DueOra', 48, 30);
    doc.font('Helvetica').fontSize(10).text('Your dues, on time.', 48, 58);
    doc.font('Helvetica-Bold').fontSize(12).text(pdfSafe(r.workspace.name), 48, 32, { width, align: 'right' });
    doc.font('Helvetica').fontSize(10).text(reportTitle(r), 48, 52, { width, align: 'right' });
    doc.text(`${formatLongDate(r.from)} – ${formatLongDate(r.to)}`, 48, 66, { width, align: 'right' });

    let y = 116;
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
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(formatUSD(t.amountCents), x + 10, y + 24, { width: tileW - 20 });
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(7)
        .text(`${t.count} item${t.count === 1 ? '' : 's'}`, x + 10, y + 44, { width: tileW - 20 });
    });
    y += 84;

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
          doc
            .fillColor(bold ? MUTED : INK)
            .font(bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(bold ? 8 : 9)
            .text(pdfSafe(cell), x + 4, y, {
              width: widths[i]! - 8,
              align: alignRight.includes(i) ? 'right' : 'left',
              lineBreak: false,
              ellipsis: true,
            });
          x += widths[i]!;
        });
        y += 18;
      };
      drawRow(headers, true, '#EDF7F6');
      rows.forEach((row, i) => drawRow(row, false, i % 2 ? '#FAFBFB' : undefined));
      y += 10;
    };
    const breakdown = (title: string, label: string, rows: Report['byCategory']) => {
      if (!rows.length) return;
      section(title);
      table(
        [label, 'Share', 'Paid'],
        rows.map((c) => [c.name, `${c.share}%`, formatUSD(c.amountCents)]),
        [width - 200, 80, 120],
        [1, 2],
      );
    };

    breakdown('Spending by category', 'Category', r.byCategory);
    breakdown('Spending by company', 'Company', r.byCompany);

    if (r.period === 'year') {
      section('Month by month');
      table(
        ['Month', 'Paid', 'Still due'],
        r.months.map((m) => [monthLabel(m.month), formatUSD(m.paidCents), formatUSD(m.outstandingCents)]),
        [width / 3, width / 3, width / 3],
        [1, 2],
      );
    }

    section('12-month forecast');
    table(
      ['Month', 'Expected'],
      r.forecast.map((f) => [monthLabel(f.month), formatUSD(f.amountCents)]),
      [width / 2, width / 2],
      [1],
    );

    if (r.overdue.length) {
      section('Overdue now');
      table(
        ['Subscription', 'Company', 'Was due', 'Owed'],
        r.overdue.map((o) => [o.name, o.company.name, formatLongDate(o.nextDueDate), formatUSD(o.remainingCents)]),
        [170, 130, 100, width - 400],
        [3],
      );
    }

    if (r.outstanding.length) {
      section('Still to pay in this period');
      table(
        ['Due', 'Subscription', 'Company', 'Amount'],
        r.outstanding.map((o) => [formatLongDate(o.date), o.subscription.name, o.subscription.company.name, formatUSD(o.amountCents)]),
        [90, 180, 130, width - 400],
        [3],
      );
    }

    if (r.payments.length) {
      section('Payments recorded');
      table(
        ['Paid on', 'Subscription', 'Company', 'Amount'],
        r.payments.map((p) => [formatLongDate(p.paidOn), p.name, p.company, formatUSD(p.amountCents)]),
        [90, 180, 130, width - 400],
        [3],
      );
    }

    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(`Generated by DueOra on ${formatLongDate(r.today)}. All amounts in US dollars.`, 48, doc.page.height - 40, {
        width,
        align: 'center',
      });
    doc.end();
  });
}

/** Excel workbook: Summary, Payments, Outstanding and Forecast sheets with real numbers (USD). */
export async function reportXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DueOra';
  wb.created = new Date(`${r.today}T00:00:00Z`);
  const header = (ws: ExcelJS.Worksheet) => {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5C5C' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Item', key: 'item', width: 28 },
    { header: 'Amount (USD)', key: 'amount', width: 18, style: { numFmt: USD_FORMAT } },
    { header: 'Count / share', key: 'count', width: 14 },
  ];
  header(summary);
  summary.addRows([
    { item: 'Workspace', count: r.workspace.name },
    { item: 'Period', count: `${r.from} to ${r.to}` },
    ...(['committed', 'paid', 'outstanding', 'overdue'] as const).map((k) => ({
      item: k[0]!.toUpperCase() + k.slice(1),
      amount: dollars(r.totals[k].amountCents),
      count: r.totals[k].count,
    })),
  ]);
  for (const [title, rows] of [
    ['By category', r.byCategory],
    ['By company', r.byCompany],
  ] as const) {
    summary.addRow({});
    summary.addRow({ item: title }).font = { bold: true };
    for (const c of rows) summary.addRow({ item: c.name, amount: dollars(c.amountCents), count: `${c.share}%` });
  }

  const payments = wb.addWorksheet('Payments');
  payments.columns = [
    { header: 'Paid on', key: 'paidOn', width: 12 },
    { header: 'Cycle due', key: 'cycle', width: 12 },
    { header: 'Subscription', key: 'name', width: 28 },
    { header: 'Company', key: 'company', width: 18 },
    { header: 'Category', key: 'category', width: 24 },
    { header: 'Provider', key: 'provider', width: 20 },
    { header: 'Method', key: 'method', width: 16 },
    { header: 'Reference', key: 'reference', width: 18 },
    { header: 'Amount (USD)', key: 'amount', width: 14, style: { numFmt: USD_FORMAT } },
  ];
  header(payments);
  for (const p of r.payments) {
    payments.addRow({
      paidOn: p.paidOn,
      cycle: p.cycleDueDate,
      name: p.name,
      company: p.company,
      category: p.category,
      provider: p.provider ?? '',
      method: p.method,
      reference: p.reference ?? '',
      amount: dollars(p.amountCents),
    });
  }

  const outstanding = wb.addWorksheet('Outstanding');
  outstanding.columns = [
    { header: 'Due', key: 'due', width: 12 },
    { header: 'Subscription', key: 'name', width: 28 },
    { header: 'Company', key: 'company', width: 18 },
    { header: 'Amount (USD)', key: 'amount', width: 14, style: { numFmt: USD_FORMAT } },
    { header: 'Overdue', key: 'overdue', width: 10 },
  ];
  header(outstanding);
  for (const o of r.outstanding) {
    outstanding.addRow({
      due: o.date,
      name: o.subscription.name,
      company: o.subscription.company.name,
      amount: dollars(o.amountCents),
      overdue: o.overdue ? 'Yes' : '',
    });
  }

  const forecast = wb.addWorksheet('Forecast');
  forecast.columns = [
    { header: 'Month', key: 'month', width: 14 },
    { header: 'Expected (USD)', key: 'amount', width: 18, style: { numFmt: USD_FORMAT } },
  ];
  header(forecast);
  for (const f of r.forecast) forecast.addRow({ month: monthLabel(f.month), amount: dollars(f.amountCents) });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
