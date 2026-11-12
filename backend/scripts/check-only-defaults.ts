import 'dotenv/config';

import { createDb } from '../src/db/client.js';
import { checkOnlyDefaults } from '../src/db/dataCheck.js';

/**
 * `npm run db:check-empty` — run against a freshly deployed database (before anyone signs up)
 * to confirm it is empty.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDb(url);
  try {
    const result = await checkOnlyDefaults(db);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(result.ok ? '✅ Only the default categories are present.\n' : '❌ The database contains other data.\n');
    process.exitCode = result.ok ? 0 : 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
