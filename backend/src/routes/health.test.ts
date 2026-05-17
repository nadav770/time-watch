'use strict';

import request from 'supertest';
import express from 'express';
import healthRouter from './health';

const app = express();
app.use('/api/health', healthRouter);

describe('GET /api/health', () => {
  it('returns 200 with { status: "ok" }', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
