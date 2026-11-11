import type { Express } from 'express';

import { addMember, client, register, type Session } from './api.js';
import type { TestContext } from './context.js';

/** Parse a server-sent-events body into { event, data } pairs. */
export function parseSse(text: string): { event: string; data: Record<string, unknown> }[] {
  return text
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)?.[1] ?? 'message';
      const data = JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? '{}') as Record<string, unknown>;
      return { event, data };
    });
}

export const SCHOOL_KEY = 'RS-HOST-7731-QX9Z';
export const CLINIC_KEY = 'LK-CLINIC-0042-ZZ8P';

export interface AiFixture {
  school: { workspaceId: string; sessions: Record<'admin' | 'finance' | 'viewer', Session>; subs: Record<string, string> };
  clinic: { workspaceId: string; admin: Session };
}

/**
 * Two fictional organisations: a school with two companies, and a clinic (to prove the
 * assistant never mixes workspaces). Clock: 2 Nov 2026.
 */
export async function buildAiFixture(app: Express, ctx: TestContext): Promise<AiFixture> {
  const admin = await register(app, 'Grace Mwangi', 'grace@riverside-school.test');
  const ws = await client(app, admin).post('/api/v1/workspaces').send({ name: 'Riverside School', timezone: 'Africa/Nairobi', firstCompanyName: 'Riverside School' });
  const workspaceId = ws.body.id as string;
  const finance = await addMember(app, ctx, admin, workspaceId, 'Omar Haddad', 'omar@riverside-school.test', 'FINANCE');
  const viewer = await addMember(app, ctx, admin, workspaceId, 'Ivy Chen', 'ivy@riverside-school.test', 'VIEWER');
  const as = client(app, admin, workspaceId);
  const school = (await as.get('/api/v1/companies')).body[0].id as string;
  const canteen = (await as.post('/api/v1/companies').send({ name: 'Riverside Canteen' })).body.id as string;
  const cats = (await as.get('/api/v1/categories')).body as { id: string; name: string }[];
  const cat = (n: string) => cats.find((c) => c.name === n)!.id;
  const add = async (body: Record<string, unknown>) => (await as.post('/api/v1/subscriptions').send(body)).body.id as string;
  const subs = {
    internet: await add({ name: 'Internet', companyId: school, categoryId: cat('Communication & internet'), amountCents: 5_000, frequencyUnit: 'MONTH', startDate: '2026-11-05' }),
    exam: await add({ name: 'Exam software', companyId: school, categoryId: cat('Technology & software'), amountCents: 120_000, frequencyUnit: 'YEAR', startDate: '2027-01-15' }),
    hosting: await add({ name: 'Hosting', companyId: school, categoryId: cat('Hosting & domains'), amountCents: 24_000, frequencyUnit: 'YEAR', startDate: '2026-11-20', subscriptionKey: SCHOOL_KEY }),
    cleaning: await add({ name: 'Cleaning', companyId: canteen, categoryId: cat('Office & rent'), amountCents: 4_000, frequencyUnit: 'WEEK', startDate: '2026-10-26', nextDueDate: '2026-10-26' }),
    canteenGas: await add({ name: 'Cooking gas', companyId: canteen, categoryId: cat('Utilities'), amountCents: 9_000, frequencyUnit: 'MONTH', startDate: '2026-11-25' }),
  };

  const clinicAdmin = await register(app, 'Dr. Sam Okoro', 'sam@lakeview-clinic.test');
  const clinicWs = (await client(app, clinicAdmin).post('/api/v1/workspaces').send({ name: 'Lakeview Clinic', timezone: 'Africa/Lagos', firstCompanyName: 'Lakeview Clinic' })).body.id as string;
  const cAs = client(app, clinicAdmin, clinicWs);
  const clinicCompany = (await cAs.get('/api/v1/companies')).body[0].id;
  const clinicCats = (await cAs.get('/api/v1/categories')).body as { id: string; name: string }[];
  await cAs.post('/api/v1/subscriptions').send({
    name: 'Patient records system',
    companyId: clinicCompany,
    categoryId: clinicCats.find((c) => c.name === 'Technology & software')!.id,
    amountCents: 99_000,
    frequencyUnit: 'MONTH',
    subscriptionKey: CLINIC_KEY,
  });

  return { school: { workspaceId, sessions: { admin, finance, viewer }, subs }, clinic: { workspaceId: clinicWs, admin: clinicAdmin } };
}
