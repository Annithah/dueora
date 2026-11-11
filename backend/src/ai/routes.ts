import { Router } from 'express';
import { z } from 'zod';

import type { AppContext } from '../context.js';
import { notFound } from '../http/errors.js';
import { actorOf, requireAuth, requirePermission, requireWorkspace, userIdOf, workspaceIdOf } from '../http/middleware/auth.js';
import { id } from '../http/schemas.js';
import { parseBody, parseParams } from '../http/validate.js';

import { resolveAction } from './actions.js';
import { chat } from './chat.js';
import { dailyInsight, suggestCategory, suggestImportFixes } from './insights.js';

const ChatBody = z.object({ conversationId: id.optional(), message: z.string().trim().min(1, 'Type a message').max(2000) }).strict();
const FeedbackBody = z.object({ rating: z.union([z.literal(1), z.literal(-1)]), comment: z.string().trim().max(1000).optional() }).strict();
const MemoryBody = z.object({ text: z.string().trim().min(3).max(300) }).strict();
const SuggestBody = z.object({ name: z.string().trim().min(1).max(120), provider: z.string().trim().max(120).optional() }).strict();
const ImportSuggestBody = z
  .object({
    rows: z
      .array(
        z.object({
          line: z.number().int().min(1),
          name: z.string().max(200),
          provider: z.string().max(200).optional(),
          frequency: z.string().max(100).optional(),
          category: z.string().max(100).optional(),
        }),
      )
      .max(50),
  })
  .strict();

/** DueOra AI — all on the backend; the Gemini key never leaves the server. */
export function aiRouter(ctx: AppContext): Router {
  const router = Router();
  router.use(requireAuth(ctx), requireWorkspace(ctx));

  router.get('/status', async (req, res) => {
    const ws = await ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceIdOf(req) }, select: { aiEnabled: true } });
    const since = new Date(ctx.clock.now().getTime() - 3_600_000);
    const used = await ctx.db.aiUsage.count({ where: { userId: userIdOf(req), kind: 'chat', createdAt: { gte: since } } });
    res.json({
      enabled: ws.aiEnabled,
      available: !!ctx.ai,
      canChange: actorOf(req).role !== 'VIEWER',
      messagesLeftThisHour: Math.max(0, ctx.env.AI_MESSAGES_PER_HOUR - used),
    });
  });

  /** Streams the reply as server-sent events (see chat.ts). */
  router.post('/chat', async (req, res) => {
    await chat(ctx, req, res, parseBody(req, ChatBody));
  });

  router.post('/messages/:messageId/actions/:actionId/:decision', async (req, res) => {
    const p = parseParams(req, z.object({ messageId: id, actionId: z.uuid(), decision: z.enum(['confirm', 'cancel']) }));
    res.json(await resolveAction(ctx, req, p.messageId, p.actionId, p.decision));
  });

  router.post('/messages/:messageId/feedback', async (req, res) => {
    const { messageId } = parseParams(req, z.object({ messageId: id }));
    const body = parseBody(req, FeedbackBody);
    const userId = userIdOf(req);
    const msg = await ctx.db.aiMessage.findFirst({ where: { id: messageId, role: 'ASSISTANT', conversation: { workspaceId: workspaceIdOf(req), userId } } });
    if (!msg) throw notFound('Message');
    await ctx.db.aiFeedback.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId, rating: body.rating, comment: body.comment ?? null, createdAt: ctx.clock.now() },
      update: { rating: body.rating, comment: body.comment ?? null },
    });
    res.status(204).end();
  });

  // --- Chat history (only your own, in this workspace) ---
  router.get('/conversations', async (req, res) => {
    const rows = await ctx.db.aiConversation.findMany({
      where: { workspaceId: workspaceIdOf(req), userId: userIdOf(req) },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, updatedAt: true },
    });
    res.json(rows);
  });

  router.get('/conversations/:id', async (req, res) => {
    const { id: cid } = parseParams(req, z.object({ id }));
    const c = await ctx.db.aiConversation.findFirst({
      where: { id: cid, workspaceId: workspaceIdOf(req), userId: userIdOf(req) },
      include: { messages: { orderBy: { createdAt: 'asc' }, include: { feedback: { where: { userId: userIdOf(req) }, select: { rating: true } } } } },
    });
    if (!c) throw notFound('Conversation');
    res.json({
      id: c.id,
      title: c.title,
      messages: c.messages.map((m) => ({ id: m.id, role: m.role, text: m.text, cards: m.cards, rating: m.feedback[0]?.rating ?? null, createdAt: m.createdAt })),
    });
  });

  router.delete('/conversations/:id', async (req, res) => {
    const { id: cid } = parseParams(req, z.object({ id }));
    const r = await ctx.db.aiConversation.deleteMany({ where: { id: cid, workspaceId: workspaceIdOf(req), userId: userIdOf(req) } });
    if (r.count === 0) throw notFound('Conversation');
    res.status(204).end();
  });

  // --- What the AI knows (workspace memory) ---
  router.get('/memory', async (req, res) => {
    const rows = await ctx.db.aiMemory.findMany({ where: { workspaceId: workspaceIdOf(req) }, orderBy: { createdAt: 'asc' }, select: { id: true, text: true, createdAt: true } });
    res.json(rows);
  });

  router.post('/memory', requirePermission('subscriptions:manage'), async (req, res) => {
    const { text } = parseBody(req, MemoryBody);
    const m = await ctx.db.aiMemory.create({ data: { workspaceId: workspaceIdOf(req), text, createdBy: userIdOf(req), createdAt: ctx.clock.now() } });
    res.status(201).json({ id: m.id, text: m.text, createdAt: m.createdAt });
  });

  router.delete('/memory/:id', requirePermission('subscriptions:manage'), async (req, res) => {
    const { id: mid } = parseParams(req, z.object({ id }));
    const r = await ctx.db.aiMemory.deleteMany({ where: { id: mid, workspaceId: workspaceIdOf(req) } });
    if (r.count === 0) throw notFound('Memory');
    res.status(204).end();
  });

  // --- Proactive and smart-form help ---
  router.get('/insight', async (req, res) => {
    res.json(await dailyInsight(ctx, workspaceIdOf(req), userIdOf(req)));
  });

  router.post('/suggest-category', async (req, res) => {
    const body = parseBody(req, SuggestBody);
    res.json({ suggestion: await suggestCategory(ctx, workspaceIdOf(req), userIdOf(req), body.name, body.provider) });
  });

  router.post('/import-suggestions', requirePermission('import:run'), async (req, res) => {
    const { rows } = parseBody(req, ImportSuggestBody);
    res.json({ suggestions: await suggestImportFixes(ctx, workspaceIdOf(req), userIdOf(req), rows) });
  });

  return router;
}
