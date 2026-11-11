import { afterAll, describe, expect, it } from 'vitest';

import { checkOnlyDefaults } from '../src/db/dataCheck.js';
import { DEFAULT_CATEGORIES, ensureDefaultCategories } from '../src/db/defaults.js';

import { createTestContext } from './helpers/context.js';

const ctx = createTestContext();

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('seed: default categories only', () => {
  it('a fresh database holds only the nine default categories after setup', async () => {
    await ensureDefaultCategories(ctx.db);
    await ensureDefaultCategories(ctx.db); // idempotent (the server runs it on every start)
    const result = await checkOnlyDefaults(ctx.db);
    expect(result).toEqual({
      ok: true,
      counts: { users: 0, workspaces: 0, companies: 0, bills: 0, payments: 0, notifications: 0 },
      defaultCategories: 11,
      customCategories: 0,
    });
    const names = (await ctx.db.category.findMany({ orderBy: { name: 'asc' } })).map((c) => c.name);
    expect(names).toEqual(DEFAULT_CATEGORIES.map((c) => c.name).sort());
  });

  it('flags anything beyond the defaults', async () => {
    await ctx.db.user.create({ data: { name: 'x', email: 'x@y.test', passwordHash: 'x' } });
    expect((await checkOnlyDefaults(ctx.db)).ok).toBe(false);
  });
});
