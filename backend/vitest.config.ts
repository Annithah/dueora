import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['test/globalSetup.ts'],
    // Native SQLite + one DB file per test file: run files in parallel forks.
    pool: 'forks',
    testTimeout: 20000,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/generated/**'],
      // The scheduling engine must stay exhaustively tested (brief: > 95%).
      thresholds: {
        'src/domain/schedule.ts': { statements: 95, branches: 95, functions: 95, lines: 95 },
      },
    },
  },
});
