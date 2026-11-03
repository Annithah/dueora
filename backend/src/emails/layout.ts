/** Escape user-provided text for HTML email bodies. */
export function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface LayoutOptions {
  /** Hidden preview line shown by inbox apps. */
  preheader: string;
  heading: string;
  /** Pre-escaped HTML for the body. */
  bodyHtml: string;
  button?: { label: string; url: string };
  footerNote?: string;
}

const TEAL = '#0F5C5C';
const AMBER = '#F2A33A';
const INK = '#172121';
const MUTED = '#667373';
const CANVAS = '#F7F8FA';
const LINE = '#E7EBEB';

/**
 * Branded, mobile-friendly email shell. Table layout + inline styles for broad
 * client support; max width 560px; scales down on phones.
 */
export function renderLayout(o: LayoutOptions): string {
  const button = o.button
    ? `<tr><td style="padding:8px 0 4px">
        <a href="${esc(o.button.url)}" style="display:inline-block;background:${TEAL};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 22px;border-radius:14px">${esc(o.button.label)}</a>
      </td></tr>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:'Plus Jakarta Sans',Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden">
    <tr><td style="background:${TEAL};padding:18px 24px">
      <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px">
        <span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${AMBER};margin-right:8px"></span>DueOra
      </span>
    </td></tr>
    <tr><td style="padding:26px 24px 8px">
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${INK}">${esc(o.heading)}</h1>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:15px;line-height:1.6;color:${INK}">${o.bodyHtml}</td></tr>
        ${button}
      </table>
    </td></tr>
    <tr><td style="padding:18px 24px 24px;font-size:12px;line-height:1.6;color:${MUTED}">
      ${o.footerNote ? `${esc(o.footerNote)}<br>` : ''}DueOra — Your dues, on time.
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

/** Large, spaced one-time code block. */
export function codeBlock(code: string): string {
  return `<div style="margin:18px 0;padding:16px;background:#EDF7F6;border-radius:14px;text-align:center;font-size:30px;font-weight:800;letter-spacing:8px;color:${TEAL}">${esc(code)}</div>`;
}
