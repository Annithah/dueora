import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import Database from 'better-sqlite3';

import { PrismaClient } from '../generated/prisma/client.js';

export type Db = InstanceType<typeof PrismaClient>;

/** "file:./dev.db" → "./dev.db" */
function sqlitePath(url: string): string {
  return url.replace(/^file:/, '');
}

/**
 * Create a Prisma client with the right driver adapter for the URL:
 * `file:` → SQLite (development/tests), `postgres(ql)://` → Postgres (production).
 */
export function createDb(databaseUrl: string): Db {
  if (databaseUrl.startsWith('file:')) {
    // WAL lets the API and the worker (separate processes) read while the other writes.
    // journal_mode is stored in the file, so set it once with a direct connection.
    const raw = new Database(sqlitePath(databaseUrl));
    raw.pragma('journal_mode = WAL');
    raw.close();
    const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl, timeout: 10_000 }) });
    // NORMAL is safe in WAL mode and avoids an fsync on every commit.
    void db.$executeRawUnsafe('PRAGMA synchronous = NORMAL');
    return db;
  }
  if (/^postgres(ql)?:\/\//.test(databaseUrl)) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }
  throw new Error('DATABASE_URL must start with file: (SQLite) or postgres:// (PostgreSQL)');
}
