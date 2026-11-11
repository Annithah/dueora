import 'dotenv/config';

import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_BASE_URL: z.url().default('http://localhost:4000'),
    APP_URL: z.string().min(1).default('dueora://'),
    /** Comma-separated list; empty = allow any origin (mobile apps send none). */
    CORS_ORIGINS: z.string().default(''),

    DATABASE_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('DueOra <reminders@example.com>'),

    EXPO_ACCESS_TOKEN: z.string().optional(),

    /** DueOra AI (Google Gemini). Unset = the assistant is off; the rest of the app works the same. */
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
    AI_MESSAGES_PER_HOUR: z.coerce.number().int().positive().default(30),

    /** Error reporting (Sentry). Unset = off. */
    SENTRY_DSN: z.string().optional(),

    /** Key material for encrypting subscription keys at rest (AES-256-GCM). */
    SUBSCRIPTION_KEY_SECRET: z.string().min(32, 'SUBSCRIPTION_KEY_SECRET must be at least 32 characters'),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** Run the job worker inside the API process (handy for single-instance hosting). */
    RUN_WORKER_IN_API: bool.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.API_BASE_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['API_BASE_URL'], message: 'must be https:// in production' });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Parse and validate environment variables; throws a readable error listing every problem. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Lazily-loaded singleton for app code. Tests build their own via loadEnv(). */
export function env(): Env {
  cached ??= loadEnv();
  return cached;
}
