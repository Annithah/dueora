import { createHmac, timingSafeEqual } from 'node:crypto';

import type { AppContext } from '../context.js';

/**
 * One-click email unsubscribe. The link carries `userId.workspaceId.signature`, an HMAC
 * made with the server secret, so it works without signing in but can't be forged.
 */
function sign(ctx: AppContext, userId: string, workspaceId: string): string {
  return createHmac('sha256', ctx.env.JWT_ACCESS_SECRET).update(`unsubscribe:${userId}:${workspaceId}`).digest('base64url');
}

export function unsubscribeToken(ctx: AppContext, userId: string, workspaceId: string): string {
  return `${userId}.${workspaceId}.${sign(ctx, userId, workspaceId)}`;
}

export function unsubscribeUrl(ctx: AppContext, userId: string, workspaceId: string): string {
  return `${ctx.env.API_BASE_URL}/api/v1/public/unsubscribe?token=${encodeURIComponent(unsubscribeToken(ctx, userId, workspaceId))}`;
}

export function verifyUnsubscribeToken(ctx: AppContext, token: string): { userId: string; workspaceId: string } | null {
  const [userId, workspaceId, sig] = token.split('.');
  if (!userId || !workspaceId || !sig) return null;
  const expected = Buffer.from(sign(ctx, userId, workspaceId));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { userId, workspaceId };
}

/** Turn email off for that user in that workspace (push and in-app stay as they are). */
export async function unsubscribeEmail(ctx: AppContext, userId: string, workspaceId: string): Promise<boolean> {
  const member = await ctx.db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  if (!member) return false;
  await ctx.db.notificationPreference.upsert({
    where: { userId_workspaceId: { userId, workspaceId } },
    create: { userId, workspaceId, emailEnabled: false, mutedSubscriptionIds: [] },
    update: { emailEnabled: false },
  });
  return true;
}
