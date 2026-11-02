import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';

export type Db = InstanceType<typeof PrismaClient>;

/**
 * Create a Prisma client with the right driver adapter for the URL:
 * `file:` → SQLite (development/tests), `postgres(ql)://` → Postgres (production).
 */
export function createDb(databaseUrl: string): Db {
  if (databaseUrl.startsWith('file:')) {
    return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
  }
  if (/^postgres(ql)?:\/\//.test(databaseUrl)) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }
  throw new Error('DATABASE_URL must start with file: (SQLite) or postgres:// (PostgreSQL)');
}
