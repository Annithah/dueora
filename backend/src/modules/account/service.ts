import ExcelJS from 'exceljs';

import type { AppContext } from '../../context.js';
import { AppError } from '../../http/errors.js';
import { randomToken } from '../../lib/crypto.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { revokeAllForUser } from '../auth/tokens.js';

/**
 * Delete my account (Settings → Data & privacy; also required by the Play Store).
 *
 * - Workspaces where I'm the only member are deleted with all their data.
 * - Workspaces shared with others are left; if I was their only admin, the longest-standing
 *   remaining member becomes admin so the workspace is never orphaned.
 * - My personal data is erased: name, email, password, devices, sessions, preferences,
 *   snoozes, AI chats. The user row stays as an anonymous tombstone only so the internal
 *   audit log of shared workspaces keeps its integrity.
 */
export async function deleteAccount(ctx: AppContext, userId: string, password: string): Promise<{ deletedWorkspaces: number; leftWorkspaces: number }> {
  const user = await ctx.db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'That password is incorrect');
  }
  const memberships = await ctx.db.membership.findMany({ where: { userId } });
  let deletedWorkspaces = 0;
  let leftWorkspaces = 0;
  for (const m of memberships) {
    const others = await ctx.db.membership.findMany({
      where: { workspaceId: m.workspaceId, userId: { not: userId } },
      orderBy: { createdAt: 'asc' },
    });
    if (others.length === 0) {
      await ctx.db.workspace.delete({ where: { id: m.workspaceId } });
      deletedWorkspaces++;
      continue;
    }
    if (m.role === 'ADMIN' && !others.some((o) => o.role === 'ADMIN')) {
      await ctx.db.membership.update({ where: { id: others[0]!.id }, data: { role: 'ADMIN' } });
    }
    await ctx.db.membership.delete({ where: { id: m.id } });
    leftWorkspaces++;
  }

  await revokeAllForUser(ctx, userId);
  await ctx.db.$transaction([
    ctx.db.deviceToken.deleteMany({ where: { userId } }),
    ctx.db.notificationPreference.deleteMany({ where: { userId } }),
    ctx.db.notification.deleteMany({ where: { userId } }),
    ctx.db.reminderSnooze.deleteMany({ where: { userId } }),
    ctx.db.aiConversation.deleteMany({ where: { userId } }),
    ctx.db.emailToken.deleteMany({ where: { userId } }),
    ctx.db.invite.updateMany({ where: { invitedById: userId, acceptedAt: null }, data: { revokedAt: ctx.clock.now() } }),
    ctx.db.feedback.updateMany({ where: { userId }, data: { userId: null } }),
    ctx.db.user.update({
      where: { id: userId },
      data: {
        name: 'Deleted user',
        email: `deleted-${userId}@deleted.invalid`,
        passwordHash: await hashPassword(randomToken(32)),
        emailVerifiedAt: null,
        deletedAt: ctx.clock.now(),
      },
    }),
  ]);
  return { deletedWorkspaces, leftWorkspaces };
}

/** Everything in one workspace, for "Export my data". Account references are never exported in plain text. */
export async function exportWorkspaceData(ctx: AppContext, workspaceId: string) {
  const [workspace, members, companies, categories, bills, payments, priceChanges, budgets] = await Promise.all([
    ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    ctx.db.membership.findMany({ where: { workspaceId }, include: { user: { select: { name: true, email: true } } } }),
    ctx.db.company.findMany({ where: { workspaceId }, orderBy: { name: 'asc' } }),
    ctx.db.category.findMany({ where: { OR: [{ workspaceId }, { workspaceId: null }] }, orderBy: { name: 'asc' } }),
    ctx.db.bill.findMany({
      where: { workspaceId },
      include: { company: { select: { name: true } }, category: { select: { name: true } } },
      orderBy: { nextDueDate: 'asc' },
    }),
    ctx.db.paymentRecord.findMany({
      where: { workspaceId },
      include: { bill: { select: { name: true, company: { select: { name: true } } } } },
      orderBy: { paidOn: 'desc' },
    }),
    ctx.db.priceChange.findMany({ where: { workspaceId }, include: { bill: { select: { name: true } } }, orderBy: { changedAt: 'desc' } }),
    ctx.db.budget.findMany({ where: { workspaceId }, include: { category: { select: { name: true } } } }),
  ]);
  const usd = (cents: number) => Math.round(cents) / 100;
  return {
    exportedAt: ctx.clock.now().toISOString(),
    workspace: {
      name: workspace.name,
      type: workspace.type,
      timezone: workspace.timezone,
      reminderHour: workspace.reminderHour,
      createdAt: workspace.createdAt.toISOString(),
    },
    members: members.map((m) => ({ name: m.user.name, email: m.user.email, role: m.role })),
    companies: companies.map((c) => ({ name: c.name, archived: c.archivedAt !== null })),
    categories: categories.map((c) => ({ name: c.name, default: c.isDefault })),
    bills: bills.map((s) => ({
      company: s.company.name,
      category: s.category.name,
      name: s.name,
      provider: s.provider,
      description: s.description,
      accountReference: s.accountRefLast4 ? `••••••${s.accountRefLast4}` : null,
      amountUSD: usd(s.amountCents),
      frequency: s.frequencyUnit === 'ONCE' ? 'ONE_TIME' : `EVERY_${s.frequencyInterval}_${s.frequencyUnit}`,
      startDate: s.startDate,
      nextDueDate: s.nextDueDate,
      autoRenew: s.autoRenew,
      isTrial: s.isTrial,
      trialEndsOn: s.trialEndsOn,
      defaultPaymentMethod: s.defaultPaymentMethod,
      status: s.status,
    })),
    payments: payments.map((p) => ({
      company: p.bill.company.name,
      bill: p.bill.name,
      cycleDueDate: p.cycleDueDate,
      paidOn: p.paidOn,
      amountUSD: usd(p.amountCents),
      method: p.method,
      reference: p.reference,
      notes: p.notes,
    })),
    priceChanges: priceChanges.map((c) => ({
      bill: c.bill.name,
      fromUSD: usd(c.oldAmountCents),
      toUSD: usd(c.newAmountCents),
      changedAt: c.changedAt.toISOString(),
    })),
    budgets: budgets.map((b) => ({ scope: b.category?.name ?? 'Whole workspace', monthlyLimitUSD: usd(b.monthlyLimitCents), alertAtPercent: b.alertAtPercent })),
  };
}

export type WorkspaceExport = Awaited<ReturnType<typeof exportWorkspaceData>>;

/** The same export as an Excel workbook, one sheet per section. */
export async function exportWorkbook(data: WorkspaceExport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DueOra';
  const sheet = (name: string, rows: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(name);
    const keys = rows.length ? Object.keys(rows[0]!) : ['(empty)'];
    ws.columns = keys.map((k) => ({ header: k, key: k, width: Math.max(12, k.length + 4) }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(r);
  };
  sheet('Workspace', [data.workspace]);
  sheet('Members', data.members);
  sheet('Companies', data.companies);
  sheet('Categories', data.categories);
  sheet('Bills', data.bills);
  sheet('Payments', data.payments);
  sheet('Price changes', data.priceChanges);
  sheet('Budgets', data.budgets);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
