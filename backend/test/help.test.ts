import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { articles, searchArticles } from '../src/ai/knowledge.js';
import { createApp } from '../src/app.js';

import { createTestContext } from './helpers/context.js';

const ctx = createTestContext();
const app = createApp(ctx);
afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('knowledge base / FAQ', () => {
  it('serves every article publicly, as question + answer', async () => {
    const res = await request(app).get('/api/v1/help/articles');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(articles().length);
    expect(res.body.length).toBeGreaterThanOrEqual(20);
    for (const a of res.body as { slug: string; title: string; body: string }[]) {
      expect(a.title.endsWith('?')).toBe(true);
      expect(a.body.length).toBeGreaterThan(80);
    }
  });

  it('finds the right article for a question', () => {
    expect(searchArticles('how do I snooze a reminder')[0]!.slug).toBe('mute-snooze');
    expect(searchArticles('import my excel spreadsheet')[0]!.slug).toBe('import');
    expect(searchArticles('zzzz')).toEqual([]);
  });

  it('describes DueOra, never a customer: no sample names or amounts', () => {
    const all = articles().map((a) => `${a.title} ${a.body}`).join('\n');
    expect(all).not.toMatch(/kigali|KT Radio|Anitha|Cloudflare|1,523/i);
  });
});
