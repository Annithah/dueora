/** Development helper: set every demo user's password to SEED_ADMIN_PASSWORD (no data is deleted). */
import 'dotenv/config';

import { createDb } from '../src/db/client.js';
import { DEMO_USERS } from '../src/db/seed/demo.js';
import { hashPassword } from '../src/lib/password.js';

const password = process.env.SEED_ADMIN_PASSWORD;
if (!password) throw new Error('Set SEED_ADMIN_PASSWORD in backend/.env first');
const db = createDb(process.env.DATABASE_URL!);
const hash = await hashPassword(password);
const res = await db.user.updateMany({ where: { email: { in: Object.values(DEMO_USERS).map((u) => u.email) } }, data: { passwordHash: hash } });
process.stdout.write(`Updated ${res.count} demo users\n`);
await db.$disconnect();
