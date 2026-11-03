import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../context.js';
import { badRequest, notFound } from '../http/errors.js';
import { workspaceIdOf, requireAuth, requireWorkspace, userIdOf } from '../http/middleware/auth.js';
import { authLimiter } from '../http/rateLimits.js';
import { id } from '../http/schemas.js';
import { parseBody, parseParams, parseQuery } from '../http/validate.js';
import { loadSubscription } from '../modules/subscriptions/service.js';

import { createNotification, dedupeKey, prefsFor } from './store.js';

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const PrefsBody = z
  .object({
    pushEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    digestEnabled: z.boolean(),
    mutedSubscriptionIds: z.array(id).max(1000),
  })
  .partial();

const DeviceBody = z.object({
  expoPushToken: z.string().min(10).max(200),
  platform: z.enum(['ios', 'android', 'web']),
});

export function notificationsRouter(ctx: AppContext): Router {
  const router = Router();
  const org = [requireAuth(ctx), requireWorkspace(ctx)];

  // --- Inbox (the Alerts tab) ---
  router.get('/notifications', ...org, async (req, res) => {
    const q = parseQuery(req, ListQuery);
    const where = {
      userId: userIdOf(req),
      workspaceId: workspaceIdOf(req),
      channel: 'IN_APP' as const,
      ...(q.unreadOnly ? { readAt: null } : {}),
    };
    const [items, total, unreadCount] = await Promise.all([
      ctx.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { id: true, type: true, title: true, body: true, data: true, subscriptionId: true, cycleDueDate: true, offsetDays: true, readAt: true, createdAt: true },
      }),
      ctx.db.notification.count({ where }),
      ctx.db.notification.count({ where: { userId: userIdOf(req), workspaceId: workspaceIdOf(req), channel: 'IN_APP', readAt: null } }),
    ]);
    res.json({ items, total, page: q.page, pageSize: q.pageSize, unreadCount });
  });

  router.post('/notifications/read-all', ...org, async (req, res) => {
    const r = await ctx.db.notification.updateMany({
      where: { userId: userIdOf(req), workspaceId: workspaceIdOf(req), channel: 'IN_APP', readAt: null },
      data: { readAt: ctx.clock.now() },
    });
    res.json({ updated: r.count });
  });

  router.post('/notifications/:id/read', ...org, async (req, res) => {
    const { id: nid } = parseParams(req, z.object({ id }));
    const r = await ctx.db.notification.updateMany({
      where: { id: nid, userId: userIdOf(req), workspaceId: workspaceIdOf(req), channel: 'IN_APP' },
      data: { readAt: ctx.clock.now() },
    });
    if (r.count === 0) throw notFound('Notification');
    res.status(204).end();
  });

  // --- Preferences (per user, per workspace) ---
  async function prefsView(userId: string, workspaceId: string) {
    const p = await prefsFor(ctx, userId, workspaceId);
    return { pushEnabled: p.pushEnabled, emailEnabled: p.emailEnabled, digestEnabled: p.digestEnabled, mutedSubscriptionIds: [...p.muted] };
  }

  router.get('/notifications/preferences', ...org, async (req, res) => {
    res.json(await prefsView(userIdOf(req), workspaceIdOf(req)));
  });

  router.patch('/notifications/preferences', ...org, async (req, res) => {
    const body = parseBody(req, PrefsBody);
    const userId = userIdOf(req);
    const workspaceId = workspaceIdOf(req);
    await ctx.db.notificationPreference.upsert({
      where: { userId_workspaceId: { userId, workspaceId } },
      update: body,
      create: { userId, workspaceId, mutedSubscriptionIds: body.mutedSubscriptionIds ?? [], ...body },
    });
    res.json(await prefsView(userId, workspaceId));
  });

  async function setMuted(req: Parameters<typeof workspaceIdOf>[0], muted: boolean) {
    const o = await loadSubscription(ctx, req, parseParams(req, z.object({ id })).id);
    const userId = userIdOf(req);
    const workspaceId = workspaceIdOf(req);
    const current = await prefsFor(ctx, userId, workspaceId);
    if (muted) current.muted.add(o.id);
    else current.muted.delete(o.id);
    await ctx.db.notificationPreference.upsert({
      where: { userId_workspaceId: { userId, workspaceId } },
      update: { mutedSubscriptionIds: [...current.muted] },
      create: { userId, workspaceId, mutedSubscriptionIds: [...current.muted] },
    });
    return prefsView(userId, workspaceId);
  }

  router.post('/subscriptions/:id/mute', ...org, async (req, res) => {
    res.json(await setMuted(req, true));
  });
  router.post('/subscriptions/:id/unmute', ...org, async (req, res) => {
    res.json(await setMuted(req, false));
  });

  // --- Test notification ---
  router.post('/notifications/test', ...org, authLimiter(ctx, { limit: 5, windowMinutes: 15 }), async (req, res) => {
    const userId = userIdOf(req);
    const workspaceId = workspaceIdOf(req);
    const devices = await ctx.db.deviceToken.count({ where: { userId, active: true } });
    const stamp = ctx.clock.now().getTime();
    const base = {
      workspaceId,
      userId,
      type: 'SYSTEM' as const,
      title: '🔔 Test from DueOra',
      body: 'Notifications are working. You’ll hear from us before anything is due.',
      data: { url: `${ctx.env.APP_URL}alerts` },
    };
    await createNotification(ctx, { ...base, channel: 'IN_APP', dedupeKey: dedupeKey([workspaceId, 'test', stamp, userId, 'IN_APP']) });
    // Test messages ignore quiet hours — the user asked for one right now.
    await createNotification(ctx, {
      ...base,
      channel: devices > 0 ? 'PUSH' : 'EMAIL',
      dedupeKey: dedupeKey([workspaceId, 'test', stamp, userId, devices > 0 ? 'PUSH' : 'EMAIL']),
    });
    res.status(202).json({ queued: true, channel: devices > 0 ? 'PUSH' : 'EMAIL', devices });
  });

  // --- Push devices (account-level, not workspace-level) ---
  router.post('/devices', requireAuth(ctx), async (req, res) => {
    const body = parseBody(req, DeviceBody);
    if (!ctx.push.isValidToken(body.expoPushToken)) throw badRequest('Not an Expo push token');
    const now = ctx.clock.now();
    // A token belongs to one device; if someone else signs in on it, it moves to them.
    await ctx.db.deviceToken.upsert({
      where: { expoPushToken: body.expoPushToken },
      update: { userId: userIdOf(req), platform: body.platform, active: true, lastSeenAt: now },
      create: { userId: userIdOf(req), expoPushToken: body.expoPushToken, platform: body.platform, active: true, lastSeenAt: now, createdAt: now },
    });
    res.status(204).end();
  });

  router.delete('/devices', requireAuth(ctx), async (req, res) => {
    const { expoPushToken } = parseBody(req, DeviceBody.pick({ expoPushToken: true }));
    await ctx.db.deviceToken.updateMany({ where: { expoPushToken, userId: userIdOf(req) }, data: { active: false } });
    res.status(204).end();
  });

  return router;
}
