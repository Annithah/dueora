import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

import { createTestContext } from './helpers/context.js';

const ctx = createTestContext();
const app = createApp(ctx);

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('GET /health', () => {
  it('reports ok with a database round-trip', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'ok', apiVersion: 'v1' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('/api/v1', () => {
  it('serves the versioned root', async () => {
    const res = await request(app).get('/api/v1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'DueOra API', version: 'v1' });
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app).post('/api/v1').set('content-type', 'application/json').send('{"bad"');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});
