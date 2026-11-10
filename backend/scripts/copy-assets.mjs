#!/usr/bin/env node
// Copies non-TypeScript runtime files (the DueOra AI knowledge base) into dist/ after `tsc`.
import { cpSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
cpSync(path.join(root, 'src/ai/knowledge'), path.join(root, 'dist/ai/knowledge'), { recursive: true });
console.log('Copied src/ai/knowledge -> dist/ai/knowledge');
