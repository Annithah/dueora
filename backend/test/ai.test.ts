import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RESTING } from '../src/ai/chat.js';
import { AiUnavailableError, ScriptedModel, type AiModel } from '../src/ai/model.js';
import { toolsFor, _internal } from '../src/ai/tools.js';
import { createApp } from '../src/app.js';

import { buildAiFixture, parseSse, SCHOOL_KEY, type AiFixture } from './helpers/ai.js';
import { client } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';

let mode: 'ok' | 'fail' = 'ok';
const scripted = new ScriptedModel((req) => {
  if (mode === 'fail') throw new AiUnavailableError('quota');
  if (req.tools.length === 0) {
    // complete(): insight phrasing / category suggestion
    return { text: req.system.startsWith('Pick the single best category') ? 'Hosting & domains' : '3 renewals coming up — plan ahead 📅' };
  }
  return { text: 'Hello! 👋' };
});
const failing: AiModel = {
  name: 'scripted',
  complete: (s, p) => scripted.complete(s, p),
  stream: (r) => scripted.stream(r),
};

const ctx = createTestContext({ ai: failing }, { AI_MESSAGES_PER_HOUR: '3', ACCESS_TOKEN_TTL_MINUTES: '100000' });
const app = createApp(ctx);
let fx: AiFixture;
const as = (who: 'admin' | 'finance' | 'viewer') => client(app, fx.school.sessions[who], fx.school.workspaceId);

beforeAll(async () => {
  ctx.clock.set('2026-11-02T07:00:00Z');
  fx = await buildAiFixture(app, ctx);
}, 120_000);
afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('DueOra AI chat', () => {
  it('streams the reply and keeps the conversation', async () => {
    const res = await as('finance').post('/api/v1/ai/chat').send({ message: 'Hi' });
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseSse(res.text);
    expect(events[0]!.event).toBe('meta');
    expect(events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('')).toBe('Hello! 👋');
    const done = events.find((e) => e.event === 'done')!.data;
    const convo = await as('finance').get(`/api/v1/ai/conversations/${done.conversationId}`);
    expect(convo.body.messages.map((m: { role: string }) => m.role)).toEqual(['USER', 'ASSISTANT']);
    expect((await as('admin').get(`/api/v1/ai/conversations/${done.conversationId}`)).status).toBe(404); // not yours
    expect((await as('finance').get('/api/v1/ai/conversations')).body).toHaveLength(1);
  });

  it('never sends a pasted account reference to the model', async () => {
    scripted.requests.length = 0;
    await as('admin').post('/api/v1/ai/chat').send({ message: `Is ${SCHOOL_KEY} the right licence?` });
    const sent = JSON.stringify(scripted.requests);
    expect(sent).not.toContain(SCHOOL_KEY);
    expect(sent).toContain('[account reference hidden]');
  });

  it('shows the friendly message when Gemini fails', async () => {
    mode = 'fail';
    const res = await as('viewer').post('/api/v1/ai/chat').send({ message: 'Hello?' });
    mode = 'ok';
    expect(parseSse(res.text).find((e) => e.event === 'error')!.data).toEqual({ code: 'AI_UNAVAILABLE', message: RESTING });
  });

  it('limits messages per user per hour (configurable)', async () => {
    // finance already sent 1; the limit in this suite is 3.
    await as('finance').post('/api/v1/ai/chat').send({ message: 'two' });
    await as('finance').post('/api/v1/ai/chat').send({ message: 'three' });
    const limited = await as('finance').post('/api/v1/ai/chat').send({ message: 'four' });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('AI_RATE_LIMIT');
    expect((await as('finance').get('/api/v1/ai/status')).body.messagesLeftThisHour).toBe(0);
    ctx.clock.set('2026-11-02T08:01:00Z');
    expect((await as('finance').post('/api/v1/ai/chat').send({ message: 'next hour' })).status).toBe(200);
    // Usage is logged with token counts.
    expect(await ctx.db.aiUsage.count({ where: { userId: fx.school.sessions.finance.userId, kind: 'chat' } })).toBe(4);
  });

  it('can be switched off by an admin, and the rest of the app keeps working', async () => {
    expect((await as('finance').patch('/api/v1/workspaces/current').send({ aiEnabled: false })).status).toBe(403);
    expect((await as('admin').patch('/api/v1/workspaces/current').send({ aiEnabled: false })).status).toBe(200);
    const off = await as('viewer').post('/api/v1/ai/chat').send({ message: 'Hello' });
    expect(off.status).toBe(403);
    expect(off.body.error.code).toBe('AI_DISABLED');
    expect((await as('viewer').get('/api/v1/bills')).status).toBe(200);
    await as('admin').patch('/api/v1/workspaces/current').send({ aiEnabled: true });
  });

  it('says it is resting when no Gemini key is configured', async () => {
    const bare = createTestContext();
    const bareApp = createApp(bare);
    bare.clock.set('2026-11-02T07:00:00Z');
    const f = await buildAiFixture(bareApp, bare);
    const res = await client(bareApp, f.school.sessions.admin, f.school.workspaceId).post('/api/v1/ai/chat').send({ message: 'Hi' });
    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe(RESTING);
    await bare.db.$disconnect();
  }, 120_000);
});

describe('feedback and memory', () => {
  it('stores 👍/👎 with a comment on your own messages', async () => {
    const res = await as('admin').post('/api/v1/ai/chat').send({ message: 'Hello again' });
    const done = parseSse(res.text).find((e) => e.event === 'done')!.data;
    expect((await as('admin').post(`/api/v1/ai/messages/${done.messageId}/feedback`).send({ rating: -1, comment: 'Too short' })).status).toBe(204);
    expect(await ctx.db.aiFeedback.findFirst({ where: { messageId: String(done.messageId) } })).toMatchObject({ rating: -1, comment: 'Too short' });
    expect((await as('viewer').post(`/api/v1/ai/messages/${done.messageId}/feedback`).send({ rating: 1 })).status).toBe(404);
  });

  it('managers teach facts; everyone can see them; they are used in the prompt', async () => {
    expect((await as('viewer').post('/api/v1/ai/memory').send({ text: 'We pay by cash' })).status).toBe(403);
    const m = await as('admin').post('/api/v1/ai/memory').send({ text: 'We always pay by bank transfer.' });
    expect(m.status).toBe(201);
    expect((await as('viewer').get('/api/v1/ai/memory')).body.map((x: { text: string }) => x.text)).toEqual(['We always pay by bank transfer.']);
    scripted.requests.length = 0;
    await as('admin').post('/api/v1/ai/chat').send({ message: 'How do we pay?' });
    expect(scripted.requests[0]!.system).toContain('We always pay by bank transfer.');
    // Another workspace never sees it.
    expect((await client(app, fx.clinic.admin, fx.clinic.workspaceId).get('/api/v1/ai/memory')).body).toEqual([]);
    expect((await as('admin').delete(`/api/v1/ai/memory/${m.body.id}`)).status).toBe(204);
  });
});

describe('insights and smart forms', () => {
  it('gives a daily insight card, cached for the day', async () => {
    const first = await as('viewer').get('/api/v1/ai/insight');
    expect(first.body).toEqual({ text: '3 renewals coming up — plan ahead 📅', source: 'ai' });
    expect((await as('admin').get('/api/v1/ai/insight')).body.source).toBe('cache');
  });

  it('falls back to a plain sentence from real data when AI is off', async () => {
    await as('admin').patch('/api/v1/workspaces/current').send({ aiEnabled: false });
    ctx.clock.set('2026-11-03T07:00:00Z');
    const res = await as('viewer').get('/api/v1/ai/insight');
    expect(res.body.source).toBe('plain');
    expect(res.body.text).toBe('1 bill is overdue — recording it keeps reminders quiet. ⚠️');
    await as('admin').patch('/api/v1/workspaces/current').send({ aiEnabled: true });
  });

  it('suggests a category while typing', async () => {
    const res = await as('admin').post('/api/v1/ai/suggest-category').send({ name: 'Website hosting' });
    expect(res.body.suggestion).toMatchObject({ categoryName: 'Hosting & domains', source: 'ai' });
  });

  it('helps fix import rows', async () => {
    const res = await as('finance').post('/api/v1/ai/import-suggestions').send({ rows: [{ line: 2, name: 'Website hosting', frequency: 'per annum' }] });
    expect(res.body.suggestions).toEqual([{ line: 2, frequency: 'Yearly', category: 'Hosting & domains' }]);
  });
});

describe('tools', () => {
  it('only offers write tools to roles that may change things', () => {
    const names = (role: 'ADMIN' | 'FINANCE' | 'VIEWER') => toolsFor(role).map((t) => t.name);
    expect(names('VIEWER')).toEqual(expect.arrayContaining(['list_bills', 'propose_snooze', 'propose_mute']));
    expect(names('VIEWER')).not.toContain('propose_record_payment');
    expect(names('FINANCE')).toContain('propose_record_payment');
  });

  it('resolves "due on the 5th" to the next 5th, and month-ends safely', () => {
    expect(_internal.nextDayOfMonth('2026-11-02', 5)).toBe('2026-11-05');
    expect(_internal.nextDayOfMonth('2026-11-06', 5)).toBe('2026-12-05');
    expect(_internal.nextDayOfMonth('2027-01-31', 31)).toBe('2027-01-31');
    expect(_internal.nextDayOfMonth('2027-02-01', 31)).toBe('2027-02-28');
    expect(_internal.nextDayOfMonth('2026-12-20', 5)).toBe('2027-01-05');
  });
});
