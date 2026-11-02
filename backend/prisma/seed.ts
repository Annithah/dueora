import 'dotenv/config';

import { randomBytes } from 'node:crypto';

import { createDb } from '../src/db/client.js';
import { DEMO_USERS, seedDemo } from '../src/db/seed/demo.js';

/**
 * `npm run db:seed` — loads the Kigali Today demo workspace into an empty database.
 * Demo users share SEED_ADMIN_PASSWORD; if it isn't set, a random one is generated and printed.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDb(url);

  try {
    if ((await db.organization.count()) > 0) {
      process.stdout.write('Database already has data — skipping seed. Run `npm run db:reset` for a clean slate.\n');
      return;
    }
    const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(9).toString('base64url');
    const result = await seedDemo(db, { password });

    const lines = [
      '',
      '✅ Seeded "Kigali Today Ltd"',
      `   organization: ${result.organizationId}`,
      `   obligations:  ${Object.keys(result.obligationIds).length}`,
      '   users (all share the same password):',
      ...Object.values(DEMO_USERS).map((u) => `     ${u.role.padEnd(10)} ${u.email}`),
      process.env.SEED_ADMIN_PASSWORD
        ? '   password:     (SEED_ADMIN_PASSWORD from .env)'
        : `   password:     ${password}   ← generated; set SEED_ADMIN_PASSWORD to choose your own`,
      '',
    ];
    process.stdout.write(lines.join('\n'));
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Seed failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
