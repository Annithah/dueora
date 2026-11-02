import type { Express } from 'express';

import { seedDemo, type DemoSeedResult, type DemoUserKey } from '../../src/db/seed/demo.js';

import { login, type Session } from './api.js';
import type { TestContext } from './context.js';

export const DEMO_PASSWORD = 'demo-password-123';

export interface SeededWorkspace extends DemoSeedResult {
  sessions: Record<DemoUserKey, Session>;
}

/** Load the Kigali Today demo workspace and log every demo user in. */
export async function seedAndLogin(app: Express, ctx: TestContext): Promise<SeededWorkspace> {
  const seeded = await seedDemo(ctx.db, { password: DEMO_PASSWORD });
  const sessions = {} as Record<DemoUserKey, Session>;
  for (const [key, email] of [
    ['anitha', 'anitha@kigalitoday.com'],
    ['isaac', 'isaac@kigalitoday.com'],
    ['nadine', 'nadine@kigalitoday.com'],
    ['eric', 'eric@kigalitoday.com'],
  ] as const) {
    sessions[key] = await login(app, email, DEMO_PASSWORD);
  }
  return { ...seeded, sessions };
}
