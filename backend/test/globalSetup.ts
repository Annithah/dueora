import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Build one migrated SQLite template; each test file copies it (see helpers/context.ts). */
export default function setup() {
  // Outside the project folder: synced folders (OneDrive) make SQLite writes very slow.
  const dir = testDbDir();
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const url = `file:${toPosix(path.join(dir, 'template.db'))}`;
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

export function testDbDir(): string {
  return path.join(tmpdir(), 'dueora-tests');
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}
