import type { AppContext } from '../context.js';
import type { NotificationType, Role } from '../generated/prisma/client.js';

import { budgetAlertCopy, priceChangeCopy, subscriptionLabel, teamCopy, type Copy, type TeamEvent } from './messages.js';
import { createNotification, dedupeKey, prefsFor, quietHoursEnd, subscriptionUrl, type Prefs } from './store.js';

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
  subscriptionId?: string | null;
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
    if (e.subscriptionId && prefs.muted.has(e.subscriptionId)) continue;
    if (e.prefFlag && !prefs[e.prefFlag]) continue;
    const base = {
      workspaceId: e.workspaceId,
      userId,
      subscriptionId: e.subscriptionId ?? null,
      type: e.type,
      title: e.copy.title,
      body: e.copy.body,
      cycleDueDate: e.cycleDueDate ?? null,
      data: e.data,
    };
    const key = (channel: string) =>
      dedupeKey([e.workspaceId, e.subscriptionId ?? null, e.type, e.cycleDueDate ?? null, e.eventKey, userId, channel]);
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
  e: { workspaceId: string; subscriptionId: string; actorUserId: string; oldAmountCents: number; newAmountCents: number; changeId: string },
): Promise<void> {
  const s = await ctx.db.subscription.findUniqueOrThrow({ where: { id: e.subscriptionId }, include: { company: { select: { name: true } } } });
  await notifyMembers(ctx, {
    workspaceId: e.workspaceId,
    type: 'PRICE_CHANGE',
    roles: MANAGERS,
    excludeUserId: e.actorUserId,
    subscriptionId: s.id,
    copy: priceChangeCopy({ label: subscriptionLabel(s.name, s.company.name), oldAmountCents: e.oldAmountCents, newAmountCents: e.newAmountCents }),
    data: { url: subscriptionUrl(ctx, s.id), subscriptionId: s.id },
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
