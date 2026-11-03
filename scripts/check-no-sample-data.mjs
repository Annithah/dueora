#!/usr/bin/env node
/**
 * Fails if the mobile app source contains sample data from the design/brief (company names,
 * people, amounts). DueOra must only ever show data from the API. Test files are exempt:
 * fixtures are allowed inside automated tests.
 *
 *   npm run check:no-sample-data
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../mobile/src');
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
const isTest = (p) => /\.test\.tsx?$/.test(p) || p.includes(`${path.sep}__tests__${path.sep}`) || p.includes(`${path.sep}test${path.sep}`);

const hits = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|json)$/.test(name) && !isTest(p)) {
      readFileSync(p, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const re of PATTERNS) if (re.test(line)) hits.push(`${path.relative(root, p)}:${i + 1}: ${line.trim()}`);
        });
    }
  }
})(root);

if (hits.length) {
  console.error(`❌ Sample data found in the mobile app:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('✅ No hardcoded sample data in mobile/src (tests excluded).');
