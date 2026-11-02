import type { EmailMessage } from '../services/mailer.js';

import { codeBlock, esc, renderLayout } from './layout.js';

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function verifyEmailMessage(to: string, name: string, code: string): EmailMessage {
  return {
    to,
    tag: 'verify-email',
    subject: `${code} is your DueOra verification code`,
    html: renderLayout({
      preheader: `Your code is ${code}. It expires in 15 minutes.`,
      heading: `Welcome to DueOra, ${firstName(name)} 👋`,
      bodyHtml: `<p style="margin:0">Enter this code in the app to confirm your email address:</p>${codeBlock(code)}<p style="margin:0;color:#667373">It expires in 15 minutes. If you didn't create a DueOra account, you can ignore this email.</p>`,
    }),
    text: `Welcome to DueOra, ${firstName(name)}!\n\nYour verification code is ${code}. It expires in 15 minutes.\n\nIf you didn't create a DueOra account, you can ignore this email.`,
  };
}

export function resetPasswordMessage(to: string, name: string, code: string): EmailMessage {
  return {
    to,
    tag: 'reset-password',
    subject: `${code} is your DueOra password reset code`,
    html: renderLayout({
      preheader: `Your reset code is ${code}. It expires in 15 minutes.`,
      heading: 'Reset your password',
      bodyHtml: `<p style="margin:0">Hi ${esc(firstName(name))}, use this code in the app to choose a new password:</p>${codeBlock(code)}<p style="margin:0;color:#667373">It expires in 15 minutes. If you didn't ask for this, your account is safe — just ignore this email.</p>`,
    }),
    text: `Hi ${firstName(name)},\n\nYour DueOra password reset code is ${code}. It expires in 15 minutes.\n\nIf you didn't ask for this, ignore this email.`,
  };
}

export function inviteMessage(opts: {
  to: string;
  inviterName: string;
  orgName: string;
  roleLabel: string;
  acceptUrl: string;
  logoUrl?: string | null;
}): EmailMessage {
  return {
    to: opts.to,
    tag: 'invite',
    subject: `${opts.inviterName} invited you to ${opts.orgName} on DueOra`,
    html: renderLayout({
      preheader: `Join ${opts.orgName} as ${opts.roleLabel}.`,
      heading: `You're invited to ${opts.orgName}`,
      bodyHtml: `<p style="margin:0 0 12px">${esc(opts.inviterName)} added you as <b>${esc(opts.roleLabel)}</b> so you can keep track of payments and renewals together.</p><p style="margin:0 0 16px;color:#667373">The invitation expires in 7 days.</p>`,
      button: { label: 'Accept invitation', url: opts.acceptUrl },
      logoUrl: opts.logoUrl,
      footerNote: "If you weren't expecting this, you can ignore it.",
    }),
    text: `${opts.inviterName} invited you to ${opts.orgName} on DueOra as ${opts.roleLabel}.\n\nAccept: ${opts.acceptUrl}\n\nThe invitation expires in 7 days.`,
  };
}

export const ROLE_LABELS = {
  ADMIN: 'Admin',
  FINANCE: 'Finance Officer',
  DEPARTMENT: 'Department Officer',
  EMPLOYEE: 'Employee',
} as const;
