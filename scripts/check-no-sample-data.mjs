#!/usr/bin/env node
/**
 * Fails if the mobile app or backend source contains sample data from the design/brief (company
 * names, people, amounts). DueOra must only ever show data from the API. Test files and the
 * generated Prisma client are exempt: fixtures are allowed inside automated tests.
 *
 *   npm run check:no-sample-data
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const roots = ['../mobile/src', '../backend/src', '../backend/prisma'].map((r) => path.resolve(import.meta.dirname, r));
const repo = path.resolve(import.meta.dirname, '..');
const PATTERNS = [
  /kigali\s*today/i,
  /\bKT\s*Radio\b/i,
  /\bAnitha\b/i,
  /\bIsaac\b/i,
  /\bNadine\b/i,
  /\bEric\b/,
  /1,?523/,
  /\$\s?240(\.00)?\b/,
  /\$\s?132(\.00)?\b/,
  /\b18,?880\b/,
  /Google Workspace/i,
  /DigitalOcean/i,
  /\bCloudflare\b/i,
];
const isSkipped = (p) => p.includes(`${path.sep}generated${path.sep}`) || p.includes(`${path.sep}migrations${path.sep}`);
const isTest = (p) => /\.test\.tsx?$/.test(p) || p.includes(`${path.sep}__tests__${path.sep}`) || p.includes(`${path.sep}test${path.sep}`);

const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (isSkipped(p)) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|json|prisma)$/.test(name) && !isTest(p)) {
      readFileSync(p, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const re of PATTERNS) if (re.test(line)) hits.push(`${path.relative(repo, p)}:${i + 1}: ${line.trim()}`);
        });
    }
  }
}
for (const r of roots) walk(r);

if (hits.length) {
  console.error(`❌ Sample data found in app or backend source:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('✅ No hardcoded sample data in mobile/src, backend/src or backend/prisma (tests excluded).');
