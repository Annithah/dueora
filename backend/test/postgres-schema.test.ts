import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/** The production schema must always match the development one (run `npm run db:pg:migration`). */
describe('PostgreSQL schema', () => {
  it('is in sync with prisma/schema.prisma', () => {
    const normalise = (s: string) =>
      s
        .replace(/^\/\/ GENERATED.*\n/, '')
        .replace(/provider\s*=\s*"(sqlite|postgresql)"/, 'provider = "db"')
        .replace(/output\s*=\s*"[^"]*"/, 'output = "x"');
    const dev = normalise(readFileSync('prisma/schema.prisma', 'utf8'));
    const prod = normalise(readFileSync('prisma/postgres/schema.prisma', 'utf8'));
    expect(prod, 'Run `npm run db:pg:migration -- <name>` after changing prisma/schema.prisma').toBe(dev);
  });
});
