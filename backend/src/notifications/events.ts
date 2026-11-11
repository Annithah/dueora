import type { AppContext } from '../context.js';
import type { NotificationType, Role } from '../generated/prisma/client.js';

import { budgetAlertCopy, priceChangeCopy, billLabel, teamCopy, type Copy, type TeamEvent } from './messages.js';
import { createNotification, dedupeKey, prefsFor, quietHoursEnd, billUrl, type Prefs } from './store.js';

/**
 * Event notifications (something happened, rather than something is due):
 * PAYMENT_RECORDED, PRICE_CHANGE, BUDGET_ALERT, TEAM. They share one delivery rule:
 * an in-app entry for every recipient, plus a push when the user has push on and an
 * active device, held until quiet hours end. No email — inboxes stay for reminders.
 */
export interface EventNotification {
  workspaceId: string;
  type: NotificationType;
  /** Only members with one of these roles receive it. */
  roles: Role[];
  /** The person who caused the event never gets told about it. */
  excludeUserId?: string;
  billId?: string | null;
  cycleDueDate?: string | null;
  copy: Copy;
  data: Record<string, unknown>;
  /** Unique per event (e.g. the payment id); combined with user and channel into the dedupe key. */
  eventKey: string;
  /** Preference flag that must be on (besides channel toggles). */
  prefFlag?: keyof Pick<Prefs, 'budgetAlerts' | 'teamActivity'>;
}

export async function notifyMembers(ctx: AppContext, e: EventNotification): Promise<number> {
  const [workspace, members] = await Promise.all([
    ctx.db.workspace.findUniqueOrThrow({ where: { id: e.workspaceId } }),
    ctx.db.membership.findMany({ where: { workspaceId: e.workspaceId, role: { in: e.roles } }, select: { userId: true } }),
  ]);
  const sendAfter = quietHoursEnd(ctx.clock.now(), workspace.timezone, workspace.quietHoursStart, workspace.quietHoursEnd);
  let created = 0;
  for (const { userId } of members) {
    if (userId === e.excludeUserId) continue;
    const prefs = await prefsFor(ctx, userId, e.workspaceId);
    if (e.billId && prefs.muted.has(e.billId)) continue;
    if (e.prefFlag && !prefs[e.prefFlag]) continue;
    const base = {
      workspaceId: e.workspaceId,
      userId,
      billId: e.billId ?? null,
      type: e.type,
      title: e.copy.title,
      body: e.copy.body,
      cycleDueDate: e.cycleDueDate ?? null,
      data: e.data,
    };
    const key = (channel: string) =>
      dedupeKey([e.workspaceId, e.billId ?? null, e.type, e.cycleDueDate ?? null, e.eventKey, userId, channel]);
    if (prefs.inAppEnabled && (await createNotification(ctx, { ...base, channel: 'IN_APP', dedupeKey: key('IN_APP') }))) created++;
    const hasDevice = (await ctx.db.deviceToken.count({ where: { userId, active: true } })) > 0;
    if (prefs.pushEnabled && hasDevice) {
      if (await createNotification(ctx, { ...base, channel: 'PUSH', dedupeKey: key('PUSH') }, { sendAfter })) created++;
    }
  }
  return created;
}

const MANAGERS: Role[] = ['ADMIN', 'FINANCE'];

export async function notifyPriceChanged(
  ctx: AppContext,
  e: { workspaceId: string; billId: string; actorUserId: string; oldAmountCents: number; newAmountCents: number; changeId: string },
): Promise<void> {
  const s = await ctx.db.bill.findUniqueOrThrow({ where: { id: e.billId }, include: { company: { select: { name: true } } } });
  await notifyMembers(ctx, {
    workspaceId: e.workspaceId,
    type: 'PRICE_CHANGE',
    roles: MANAGERS,
    excludeUserId: e.actorUserId,
    billId: s.id,
    copy: priceChangeCopy({ label: billLabel(s.name, s.company.name), oldAmountCents: e.oldAmountCents, newAmountCents: e.newAmountCents }),
    data: { url: billUrl(ctx, s.id), billId: s.id },
    eventKey: `price-${e.changeId}`,
  });
}

export async function notifyBudgetAlert(
  ctx: AppContext,
  e: { workspaceId: string; budgetId: string; month: string; threshold: number; percent: number; categoryName: string | null },
): Promise<number> {
  return notifyMembers(ctx, {
    workspaceId: e.workspaceId,
    type: 'BUDGET_ALERT',
    roles: MANAGERS,
    copy: budgetAlertCopy({ percent: e.percent, categoryName: e.categoryName }),
    data: { url: `${ctx.env.APP_URL}settings/budgets`, budgetId: e.budgetId },
    eventKey: `budget-${e.budgetId}-${e.month}-${e.threshold}`,
    prefFlag: 'budgetAlerts',
  });
}

export async function notifyTeam(
  ctx: AppContext,
  e: { workspaceId: string; event: TeamEvent; memberName: string; role?: Role; actorUserId?: string; eventKey: string },
): Promise<void> {
  await notifyMembers(ctx, {
    workspaceId: e.workspaceId,
    type: 'TEAM',
    roles: ['ADMIN'],
    excludeUserId: e.actorUserId,
    copy: teamCopy(e.event, e.memberName, e.role),
    data: { url: `${ctx.env.APP_URL}team` },
    eventKey: e.eventKey,
    prefFlag: 'teamActivity',
  });
}
