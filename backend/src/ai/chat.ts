import type { Request, Response } from 'express';

import type { AppContext } from '../context.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError, notFound } from '../http/errors.js';
import { actorOf, workspaceIdOf } from '../http/middleware/auth.js';
import { workspaceToday } from '../modules/subscriptions/service.js';

import { AiUnavailableError, type AiModel, type ToolCall, type Turn } from './model.js';
import { SYSTEM_PROMPT, contextBlock } from './systemPrompt.js';
import { runTool, toolsFor, type Card } from './tools.js';

export const RESTING = 'DueOra AI is resting right now — please try again in a moment.';
const MAX_ROUNDS = 5;
const HISTORY = 20;

/** The model for this workspace, or an explanation why DueOra AI is unavailable. */
export async function modelFor(ctx: AppContext, workspaceId: string): Promise<AiModel> {
  const ws = await ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { aiEnabled: true } });
  if (!ws.aiEnabled) throw new AppError(403, 'AI_DISABLED', 'An admin has switched DueOra AI off for this workspace.');
  if (!ctx.ai) throw new AppError(503, 'AI_UNAVAILABLE', RESTING);
  return ctx.ai;
}

/** Messages this user sent in the last hour (configurable limit, default 30). */
export async function assertWithinRateLimit(ctx: AppContext, userId: string): Promise<void> {
  const since = new Date(ctx.clock.now().getTime() - 3_600_000);
  const used = await ctx.db.aiUsage.count({ where: { userId, kind: 'chat', createdAt: { gte: since } } });
  if (used >= ctx.env.AI_MESSAGES_PER_HOUR) {
    throw new AppError(429, 'AI_RATE_LIMIT', `You’ve sent ${ctx.env.AI_MESSAGES_PER_HOUR} messages this hour. DueOra AI needs a short break — try again soon. ☕`);
  }
}

export async function logUsage(ctx: AppContext, workspaceId: string, userId: string, model: string, kind: string, usage: { input: number; output: number }) {
  await ctx.db.aiUsage.create({
    data: { workspaceId, userId, model, kind, inputTokens: usage.input, outputTokens: usage.output, createdAt: ctx.clock.now() },
  });
}

/**
 * A subscription key pasted into the chat must never reach the model: any word that matches
 * a stored key of this workspace (by its keyed hash) is replaced before sending.
 */
export async function redactKeys(ctx: AppContext, workspaceId: string, text: string): Promise<string> {
  const rows = await ctx.db.subscription.findMany({ where: { workspaceId, subscriptionKeyHash: { not: null } }, select: { subscriptionKeyHash: true } });
  if (rows.length === 0) return text;
  const hashes = new Set(rows.map((r) => r.subscriptionKeyHash));
  return text.replace(/[A-Za-z0-9][A-Za-z0-9\-_ ]{3,80}[A-Za-z0-9]/g, (chunk) => {
    // Try the whole run and each word in it (keys can contain spaces or dashes).
    if (hashes.has(ctx.keys.hash(chunk))) return '[subscription key hidden]';
    return chunk
      .split(' ')
      .map((w) => (w.length >= 4 && hashes.has(ctx.keys.hash(w)) ? '[subscription key hidden]' : w))
      .join(' ');
  });
}

function sse(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  return (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * POST /ai/chat — runs one user message through DueOra AI and streams the reply:
 *   event: meta   { conversationId }
 *   event: delta  { text }            (many)
 *   event: done   { messageId, text, cards }
 *   event: error  { code, message }
 */
export async function chat(ctx: AppContext, req: Request, res: Response, body: { conversationId?: string; message: string }) {
  const workspaceId = workspaceIdOf(req);
  const actor = actorOf(req);
  const model = await modelFor(ctx, workspaceId);
  await assertWithinRateLimit(ctx, actor.userId);

  const [workspace, user, companies, memories] = await Promise.all([
    ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    ctx.db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } }),
    ctx.db.company.findMany({ where: { workspaceId, archivedAt: null }, select: { name: true }, orderBy: { name: 'asc' } }),
    ctx.db.aiMemory.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' }, take: 50 }),
  ]);

  let conversation = body.conversationId
    ? await ctx.db.aiConversation.findFirst({ where: { id: body.conversationId, workspaceId, userId: actor.userId } })
    : null;
  if (body.conversationId && !conversation) throw notFound('Conversation');
  conversation ??= await ctx.db.aiConversation.create({
    data: { workspaceId, userId: actor.userId, title: body.message.trim().slice(0, 60), createdAt: ctx.clock.now() },
  });

  const previous = await ctx.db.aiMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: 'desc' }, take: HISTORY });
  const userText = await redactKeys(ctx, workspaceId, body.message.trim());
  await ctx.db.aiMessage.create({ data: { conversationId: conversation.id, role: 'USER', text: userText, cards: [], createdAt: ctx.clock.now() } });

  const turns: Turn[] = previous
    .reverse()
    .filter((m) => m.text)
    .map((m): Turn => (m.role === 'USER' ? { role: 'user', text: m.text } : { role: 'model', text: m.text }));
  turns.push({ role: 'user', text: userText });

  const system = `${SYSTEM_PROMPT}\n\n${contextBlock({
    today: workspaceToday(ctx, req),
    timezone: workspace.timezone,
    workspaceName: workspace.name,
    workspaceType: workspace.type,
    role: actor.role,
    userFirstName: user.name.split(' ')[0] ?? user.name,
    companies: companies.map((c) => c.name),
    memories: memories.map((m) => m.text),
  })}`;
  const tools = toolsFor(actor.role);

  const send = sse(res);
  send('meta', { conversationId: conversation.id });
  const cards: Card[] = [];
  const usage = { input: 0, output: 0 };
  let reply = '';
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      let text = '';
      const calls: ToolCall[] = [];
      for await (const chunk of model.stream({ system, turns, tools })) {
        if ('text' in chunk) {
          text += chunk.text;
          send('delta', { text: chunk.text });
        } else if ('call' in chunk) calls.push(chunk.call);
        else {
          usage.input += chunk.usage.input;
          usage.output += chunk.usage.output;
        }
      }
      reply += text;
      if (calls.length === 0) break;
      turns.push({ role: 'model', text: text || undefined, calls });
      const results = [];
      for (const call of calls) results.push({ name: call.name, response: await runTool({ ctx, req, cards }, call.name, call.args) });
      turns.push({ role: 'tool', results });
    }
  } catch (err) {
    ctx.logger.warn({ err: err instanceof Error ? err.message : err }, 'DueOra AI request failed');
    await logUsage(ctx, workspaceId, actor.userId, model.name, 'chat', usage);
    send('error', { code: err instanceof AiUnavailableError ? 'AI_UNAVAILABLE' : 'AI_ERROR', message: RESTING });
    res.end();
    return;
  }

  const finalText = reply.trim() || (cards.some((c) => c.type === 'action') ? 'Here’s what I’ll do — tap Confirm to go ahead.' : 'I couldn’t find an answer to that. Could you rephrase it?');
  const saved = await ctx.db.aiMessage.create({
    data: { conversationId: conversation.id, role: 'ASSISTANT', text: finalText, cards: cards as unknown as Prisma.InputJsonValue, createdAt: ctx.clock.now() },
  });
  await ctx.db.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: ctx.clock.now() } });
  await logUsage(ctx, workspaceId, actor.userId, model.name, 'chat', usage);
  send('done', { messageId: saved.id, conversationId: conversation.id, text: finalText, cards });
  res.end();
}
