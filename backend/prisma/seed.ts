import 'dotenv/config';

import { createDb } from '../src/db/client.js';
import { DEFAULT_CATEGORIES, ensureDefaultCategories } from '../src/db/defaults.js';

/**
 * `npm run db:seed` — inserts the default categories and nothing else.
 * DueOra never seeds demo users, workspaces, subscriptions or payments: all data is entered in the app.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDb(url);
  try {
    await ensureDefaultCategories(db);
    process.stdout.write(`✅ Default categories ready (${DEFAULT_CATEGORIES.length}). No other data is seeded.\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Seed failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
