import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { CATEGORY_SUGGESTIONS } from '../src/config/categorySuggestions.js';
import { checkOnlyDefaults } from '../src/db/dataCheck.js';

import { client, register } from './helpers/api.js';
import { createTestContext } from './helpers/context.js';

const ctx = createTestContext();
const app = createApp(ctx);

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('no seeded data', () => {
  it('a fresh database is empty: categories are per company, never seeded', async () => {
    const result = await checkOnlyDefaults(ctx.db);
    expect(result).toEqual({
      ok: true,
      counts: { users: 0, workspaces: 0, companies: 0, categories: 0, bills: 0, payments: 0, notifications: 0 },
    });
  });

  it('a new workspace’s first company starts with the suggestions, or empty when asked', async () => {
    const s = await register(app, 'Seed', 'seed@test.test');
    const a = await client(app, s).post('/api/v1/workspaces').send({ name: 'Suggested', timezone: 'UTC' });
    const cats = await client(app, s, a.body.id).get('/api/v1/categories');
    expect(cats.body.map((c: { name: string }) => c.name)).toEqual(CATEGORY_SUGGESTIONS.map((c) => c.name));
    const b = await client(app, s).post('/api/v1/workspaces').send({ name: 'Empty', timezone: 'UTC', categoryStart: { mode: 'empty' } });
    expect((await client(app, s, b.body.id).get('/api/v1/categories')).body).toEqual([]);
  });

  it('flags anything in the database', async () => {
    expect((await checkOnlyDefaults(ctx.db)).ok).toBe(false);
  });
});
