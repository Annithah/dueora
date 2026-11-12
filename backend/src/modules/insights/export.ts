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
  const base =
    r.period === 'year' ? `Annual report ${r.year}` : `Monthly report — ${monthLabel(`${r.year}-${String(r.month).padStart(2, '0')}`)}`;
  return `${base} · ${r.company?.name ?? 'All companies'}`;
}

const STATE_LABEL: Record<string, string> = {
  PAID: 'Paid',
  PARTIALLY_PAID: 'Part paid',
  OVERDUE: 'Overdue',
  DUE_TODAY: 'Due today',
  DUE_SOON: 'Due soon',
  UPCOMING: 'Upcoming',
};
const METHOD_LABEL: Record<string, string> = {
  MOBILE_MONEY: 'Mobile money',
  BANK_TRANSFER: 'Bank transfer',
  CARD: 'Card',
  CASH: 'Cash',
  OTHER: 'Other',
};

export function reportFileName(r: Report, ext: 'pdf' | 'xlsx'): string {
  const slug =
    r.workspace.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'dueora';
  const period = r.period === 'year' ? `${r.year}` : `${r.year}-${String(r.month).padStart(2, '0')}`;
  const company = r.company ? `-${r.company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : '';
  return `${slug}${company}-report-${period}.${ext}`;
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
        ['Bill', 'Company', 'Was due', 'Owed'],
        r.overdue.map((o) => [o.name, o.company.name, formatLongDate(o.nextDueDate), formatUSD(o.remainingCents)]),
        [170, 130, 100, width - 400],
        [3],
      );
    }

    if (r.outstanding.length) {
      section('Still to pay in this period');
      table(
        ['Due', 'Bill', 'Company', 'Amount'],
        r.outstanding.map((o) => [formatLongDate(o.date), o.bill.name, o.bill.company.name, formatUSD(o.amountCents)]),
        [90, 180, 130, width - 400],
        [3],
      );
    }

    const a = r.analysis;
    section('Payment report');
    table(
      ['', 'Count', 'Amount'],
      [
        ['Due in this period', String(a.due.count), formatUSD(a.due.expectedCents)],
        ['Paid on time', String(a.timing.onTime), ''],
        ['Paid late', String(a.timing.late), ''],
        ['Still unpaid', String(a.timing.unpaid), formatUSD(a.timing.unpaidCents)],
        ['Paid in this period', '', formatUSD(a.paidInPeriodCents)],
        ['Paid in the period before', '', `${formatUSD(a.previous.paidCents)}${a.previous.changePercent === null ? '' : ` (${a.previous.changePercent > 0 ? '+' : ''}${a.previous.changePercent}%)`}`],
        ...(a.due.estimatedCents ? [['Still estimated (variable bills)', '', formatUSD(a.due.estimatedCents)]] : []),
      ],
      [width - 220, 80, 140],
      [1, 2],
    );
    if (a.byMethod.length) {
      section('By payment method');
      table(['Method', 'Payments', 'Amount'], a.byMethod.map((m) => [METHOD_LABEL[m.method] ?? m.method, String(m.count), formatUSD(m.amountCents)]), [width - 220, 80, 140], [1, 2]);
    }
    if (!r.company && a.perCompany.length > 1) {
      section('By company');
      table(
        ['Company', 'Due', 'Paid', 'Left', 'On time', 'Late'],
        a.perCompany.map((c) => [c.company.name, formatUSD(c.expectedCents), formatUSD(c.paidCents), formatUSD(c.remainingCents), String(c.onTime), String(c.late)]),
        [width - 380, 90, 90, 90, 55, 55],
        [1, 2, 3, 4, 5],
      );
    }
    if (a.variable.length) {
      section('Variable bills: estimate and actual');
      table(
        ['Bill', 'Due', 'Estimate', 'Actual'],
        a.variable.map((v) => [`${v.company} · ${v.name}`, formatLongDate(v.dueDate), formatUSD(v.estimateCents), v.actualCents === null ? 'Not set' : formatUSD(v.actualCents)]),
        [width - 300, 100, 100, 100],
        [2, 3],
      );
    }
    if (a.ageing.some((b) => b.count)) {
      section('Overdue by age (days)');
      table(['Days late', 'Cycles', 'Owed'], a.ageing.map((b) => [b.bucket, String(b.count), formatUSD(b.amountCents)]), [width - 220, 80, 140], [1, 2]);
    }
    section('Coming up');
    table(
      ['Next', 'Cycles', 'Amount'],
      ([['30 days', a.upcoming.days30], ['60 days', a.upcoming.days60], ['90 days', a.upcoming.days90]] as const).map(([l, t]) => [l, String(t.count), formatUSD(t.remainingCents)]),
      [width - 220, 80, 140],
      [1, 2],
    );

    if (r.payments.length) {
      section('Payments recorded');
      table(
        ['Paid on', 'Bill', 'Company', 'Amount'],
        r.payments.map((p) => [formatLongDate(p.paidOn), p.name, p.company, formatUSD(p.amountCents)]),
        [90, 180, 130, width - 400],
        [3],
      );
    }

    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(`${r.company?.name ?? 'All companies'} · generated by DueOra on ${formatLongDate(r.today)}. All amounts in US dollars.`, 48, doc.page.height - 40, {
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
    { item: 'Company', count: r.company?.name ?? 'All companies' },
    { item: 'Period', count: `${r.from} to ${r.to}` },
    { item: 'Generated on', count: r.analysis.generatedOn },
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
    { header: 'Bill', key: 'name', width: 28 },
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
    { header: 'Bill', key: 'name', width: 28 },
    { header: 'Company', key: 'company', width: 18 },
    { header: 'Amount (USD)', key: 'amount', width: 14, style: { numFmt: USD_FORMAT } },
    { header: 'Overdue', key: 'overdue', width: 10 },
  ];
  header(outstanding);
  for (const o of r.outstanding) {
    outstanding.addRow({
      due: o.date,
      name: o.bill.name,
      company: o.bill.company.name,
      amount: dollars(o.amountCents),
      overdue: o.overdue ? 'Yes' : '',
    });
  }

  // Every cycle due in the period, with the company's custom fields as columns.
  const a = r.analysis;
  const cycleColumns = [
    { header: 'Company', key: 'company', width: 18 },
    { header: 'Bill', key: 'name', width: 26 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Due', key: 'due', width: 12 },
    { header: 'Status', key: 'state', width: 12 },
    { header: 'Expected (USD)', key: 'expected', width: 15, style: { numFmt: USD_FORMAT } },
    { header: 'Estimate?', key: 'estimate', width: 10 },
    { header: 'Paid (USD)', key: 'paid', width: 13, style: { numFmt: USD_FORMAT } },
    { header: 'Left (USD)', key: 'left', width: 13, style: { numFmt: USD_FORMAT } },
    { header: 'Days late', key: 'late', width: 10 },
    ...a.customFieldNames.map((n, i) => ({ header: n, key: `cf${i}`, width: Math.max(12, n.length + 4) })),
  ];
  const cycleRow = (c: (typeof a.cycles)[number]) => ({
    company: c.bill.company.name,
    name: c.bill.name,
    category: c.bill.category.name,
    due: c.dueDate,
    state: STATE_LABEL[c.state] ?? c.state,
    expected: dollars(c.expectedCents),
    estimate: c.isEstimate ? 'Yes' : '',
    paid: dollars(Math.min(c.paidCents, c.expectedCents)),
    left: dollars(c.remainingCents),
    late: c.daysOverdue || '',
    ...Object.fromEntries(a.customFieldNames.map((n, i) => [`cf${i}`, (c.custom as Record<string, unknown>)[n] ?? ''])),
  });
  const due = wb.addWorksheet('Due in period');
  due.columns = cycleColumns;
  header(due);
  for (const c of a.cycles) due.addRow(cycleRow(c));
  // "All companies": one sheet per company as well.
  if (!r.company) {
    for (const company of a.perCompany) {
      const name = company.company.name.replace(/[*?:\\/[\]]/g, ' ').slice(0, 31) || 'Company';
      const ws = wb.addWorksheet(wb.getWorksheet(name) ? `${name.slice(0, 27)} (${company.company.id.slice(-3)})` : name);
      ws.columns = cycleColumns;
      header(ws);
      for (const c of a.cycles.filter((x) => x.bill.company.id === company.company.id)) ws.addRow(cycleRow(c));
    }
  }

  const report = wb.addWorksheet('Payment report');
  report.columns = [
    { header: 'Item', key: 'item', width: 32 },
    { header: 'Count', key: 'count', width: 10 },
    { header: 'Amount (USD)', key: 'amount', width: 16, style: { numFmt: USD_FORMAT } },
  ];
  header(report);
  report.addRows([
    { item: 'Due in this period', count: a.due.count, amount: dollars(a.due.expectedCents) },
    { item: 'Paid on time', count: a.timing.onTime },
    { item: 'Paid late', count: a.timing.late },
    { item: 'Still unpaid', count: a.timing.unpaid, amount: dollars(a.timing.unpaidCents) },
    { item: 'Paid in this period', amount: dollars(a.paidInPeriodCents) },
    { item: 'Paid in the period before', amount: dollars(a.previous.paidCents) },
    { item: 'Still estimated (variable)', amount: dollars(a.due.estimatedCents) },
    {},
    ...a.byMethod.map((m) => ({ item: METHOD_LABEL[m.method] ?? m.method, count: m.count, amount: dollars(m.amountCents) })),
    {},
    ...a.ageing.map((b) => ({ item: `Overdue ${b.bucket} days`, count: b.count, amount: dollars(b.amountCents) })),
    {},
    ...a.categories.flatMap((c) => [
      { item: c.name, count: c.count, amount: dollars(c.expectedCents) },
      ...c.subcategories.map((sc) => ({ item: `  ${sc.name}`, count: sc.count, amount: dollars(sc.expectedCents) })),
    ]),
  ]);

  const forecast = wb.addWorksheet('Forecast');
  forecast.columns = [
    { header: 'Month', key: 'month', width: 14 },
    { header: 'Expected (USD)', key: 'amount', width: 18, style: { numFmt: USD_FORMAT } },
  ];
  header(forecast);
  for (const f of r.forecast) forecast.addRow({ month: monthLabel(f.month), amount: dollars(f.amountCents) });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
