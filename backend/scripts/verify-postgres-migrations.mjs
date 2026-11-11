#!/usr/bin/env node
/**
 * Proves the hand-written PostgreSQL migrations without a Postgres server:
 * starts an in-memory PGlite (real Postgres compiled to WASM) behind a socket, applies
 * prisma/postgres/migrations in order, and checks that the result matches
 * prisma/postgres/schema.prisma exactly (`prisma migrate diff` must be empty).
 *
 *   npm run db:pg:verify                       # schema check
 *   npm run db:pg:verify -- --data <sql file>  # also run <sql file> right before the newest
 *                                              # migration and print its row counts after it
 *
 * Use it after every `npm run db:pg:migration`, especially when the generated SQL was
 * replaced by a data-preserving one (renames, backfills).
 */
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const root = path.resolve(import.meta.dirname, '..');
const migrationsDir = path.join(root, 'prisma/postgres/migrations');
const dataArg = process.argv.indexOf('--data');
const dataFile = dataArg > 0 ? process.argv[dataArg + 1] : null;
const port = 54329;

const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
await server.start();
const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable&connection_limit=1`;

const folders = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let failed = false;
try {
  for (const [i, folder] of folders.entries()) {
    if (dataFile && i === folders.length - 1) {
      await db.exec(readFileSync(path.resolve(dataFile), 'utf8'));
      console.log(`Loaded ${dataFile} before ${folder}`);
    }
    await db.exec(readFileSync(path.join(migrationsDir, folder, 'migration.sql'), 'utf8'));
    console.log(`Applied ${folder}`);
  }
  const prismaCli = path.join(root, 'node_modules/prisma/build/index.js');
  // Async: the socket server lives in this process, so the event loop must keep running.
  const { stdout: diff } = await promisify(execFile)(
    process.execPath,
    [prismaCli, 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/postgres/schema.prisma', '--script'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, DATABASE_URL: url, PRISMA_SCHEMA: 'prisma/postgres/schema.prisma' } },
  );
  const clean = /This is an empty migration/.test(diff);
  console.log(clean ? '✅ Postgres migrations match prisma/postgres/schema.prisma' : `❌ Drift:\n${diff}`);
  failed = !clean;
  if (dataFile) {
    const tables = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' ORDER BY 1`);
    for (const { table_name: t } of tables.rows) {
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM "${t}"`);
      if (rows[0].n > 0) console.log(`  ${t}: ${rows[0].n}`);
    }
  }
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  await server.stop();
  await db.close();
}
process.exit(failed ? 1 : 0);
