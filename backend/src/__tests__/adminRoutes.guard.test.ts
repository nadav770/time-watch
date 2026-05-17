'use strict';

process.env.JWT_SECRET = 'test-secret-used-only-in-jest-at-least-32-chars!!';

import request from 'supertest';
import { createApp } from '../app';
import { adminCookie, employeeCookie } from './helpers/cookies';

const app = createApp();

describe('Admin-only route guards', () => {
  it('GET /api/clients — unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/clients');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('GET /api/clients — employee JWT returns 403', async () => {
    const res = await request(app)
      .get('/api/clients')
      .set('Cookie', employeeCookie());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('1.22 — GET /api/clients — admin JWT passes the guard (not 401/403)', async () => {
    const res = await request(app)
      .get('/api/clients')
      .set('Cookie', adminCookie());
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    // Guard passed — handler may return 200 (with DB) or 500 (no DB in unit test context)
  });
});
