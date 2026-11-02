import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

/** Build one migrated SQLite template; each test file copies it (see helpers/context.ts). */
export default function setup() {
  const dir = path.resolve('test/.tmp');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const url = `file:${toPosix(path.join(dir, 'template.db'))}`;
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}
