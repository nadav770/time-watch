'use strict';

// Must be set before any module that reads JWT_SECRET is required.
process.env.JWT_SECRET = 'test-secret-used-only-in-jest-at-least-32-chars!!';

import request from 'supertest';
import knexLib from 'knex';
import jwt from 'jsonwebtoken';
const knexConfigs = require('../../knexfile.cjs');
import { createApp } from '../app';
import db from '../db/knex';
import { adminCookie, employeeCookie } from './helpers/cookies';

let testDb: ReturnType<typeof knexLib>;
let app: ReturnType<typeof createApp>;

const validBody = {
  full_name: 'ישראל ישראלי',
  email: 'israel@example.com',
  password: 'Temp1234!',
  role: 'employee',
};

beforeAll(async () => {
  testDb = knexLib(knexConfigs.test);
  await testDb.migrate.rollback(undefined, true);
  await testDb.migrate.latest();
  app = createApp();
});

afterEach(async () => {
  await testDb('users').delete();
});

afterAll(async () => {
  await testDb.migrate.rollback(undefined, true);
  await testDb.destroy();
  await db.closeDatabase(); // close the module-level singleton used by the app
});

// Seed row used by GET tests — no plaintext password needed
const seedUser = {
  full_name: 'שרה כהן',
  email: 'sarah@example.com',
  password_hash: '$2b$12$LCGkLdR4exGGhQUDi4Mk8uhaTr4R1K1HYzMMpXE.jqNcbf9AhvzI6',
  role: 'employee',
  must_change_password: false,
};

describe('GET /api/users', () => {
  it('3.4 — 401 when no auth cookie is provided', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('3.5 — 403 when authenticated as employee', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Cookie', employeeCookie());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('3.6 — 200 with user array containing expected fields', async () => {
    await testDb('users').insert(seedUser);

    const res = await request(app)
      .get('/api/users')
      .set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);

    const user = res.body[0];
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('full_name', seedUser.full_name);
    expect(user).toHaveProperty('email', seedUser.email);
    expect(user).toHaveProperty('role', seedUser.role);
    expect(user).toHaveProperty('is_active', true);
    expect(user).toHaveProperty('must_change_password', false);
  });

  it('3.7 — response does not include sensitive fields', async () => {
    await testDb('users').insert(seedUser);

    const res = await request(app)
      .get('/api/users')
      .set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    const user = res.body[0];
    expect(user).not.toHaveProperty('password_hash');
    expect(user).not.toHaveProperty('failed_attempts');
    expect(user).not.toHaveProperty('locked_until');
  });

  // Security trade-off (documented): admin CRUD routes trust the JWT role claim and do NOT
  // re-check the caller's DB row on every request.  A deactivated admin's token therefore
  // remains valid for these routes until the 8-hour JWT expires.
  // Only /me and /change-password re-check the DB — those are the only two routes that
  // return 401/403 immediately when the caller is inactive.
  it('deactivated admin JWT still passes admin routes — JWT expiry is the only eviction', async () => {
    const [deactivatedAdmin] = await testDb('users')
      .insert({ ...seedUser, email: 'deactivated-admin@example.com', role: 'admin', full_name: 'אדמין מבוטל', is_active: false })
      .returning('*');

    const cookie = `token=${jwt.sign({ sub: deactivatedAdmin.id, role: 'admin' }, process.env.JWT_SECRET as string, { expiresIn: '8h' })}`;

    const res = await request(app).get('/api/users').set('Cookie', cookie);

    // 200 — the route does not consult the DB for the caller; JWT alone is trusted
    expect(res.status).toBe(200);
  });
});

describe('POST /api/users', () => {
  it('201 — creates user and excludes password_hash from response', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie())
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.email).toBe(validBody.email);
    expect(res.body.role).toBe('employee');
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it('401 — no auth cookie', async () => {
    const res = await request(app).post('/api/users').send(validBody);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('403 — authenticated as employee (non-admin)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', employeeCookie())
      .send(validBody);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('409 — duplicate email', async () => {
    await request(app).post('/api/users').set('Cookie', adminCookie()).send(validBody);
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie())
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_CONFLICT');
  });

  // ISSUE-07: email normalization
  it('normalizes mixed-case email to lowercase before storing', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie())
      .send({ ...validBody, email: 'Israel@Example.COM' });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('israel@example.com');
  });

  it('409 — email differing only by case is treated as a duplicate', async () => {
    await request(app).post('/api/users').set('Cookie', adminCookie()).send(validBody); // israel@example.com
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie())
      .send({ ...validBody, full_name: 'אחר', email: 'Israel@Example.COM' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_CONFLICT');
  });

  // Validation: required fields
  it('400 — missing full_name', async () => {
    const { full_name, ...body } = validBody;
    const res = await request(app).post('/api/users').set('Cookie', adminCookie()).send(body);
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'full_name' })]));
  });

  it('400 — missing email', async () => {
    const { email, ...body } = validBody;
    const res = await request(app).post('/api/users').set('Cookie', adminCookie()).send(body);
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'email' })]));
  });

  it('400 — invalid email format', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie())
      .send({ ...validBody, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'email' })]));
  });

  it('400 — invalid role', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie())
      .send({ ...validBody, role: 'superuser' });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'role' })]));
  });

  // Password complexity — validated in service, returns 422
  it('422 — password too short', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie())
      .send({ ...validBody, password: 'Ab1!' });
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'password' })]));
  });

  it('422 — password missing uppercase', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie())
      .send({ ...validBody, password: 'temp1234!' });
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'password' })]));
  });

  it('422 — password missing lowercase', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie())
      .send({ ...validBody, password: 'TEMP1234!' });
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'password' })]));
  });

  it('422 — password missing digit', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie())
      .send({ ...validBody, password: 'TempTemp!' });
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'password' })]));
  });

  it('422 — password missing special character', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie())
      .send({ ...validBody, password: 'Temp12345' });
    expect(res.status).toBe(422);
    expect(res.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'password' })]));
  });

  it('4.8 — 201 response includes must_change_password: true', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', adminCookie())
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('must_change_password', true);
  });
});

describe('PUT /api/users/:id', () => {
  let userId: number;

  beforeEach(async () => {
    const [row] = await testDb('users').insert(seedUser).returning('id');
    userId = row.id;
  });

  it('5.4 — admin JWT + valid body → 200 with updated fields', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}`)
      .set('Cookie', adminCookie())
      .send({ full_name: 'שרה לוי', email: 'sarah.levy@example.com', role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('full_name', 'שרה לוי');
    expect(res.body).toHaveProperty('email', 'sarah.levy@example.com');
    expect(res.body).toHaveProperty('role', 'admin');
    expect(res.body).not.toHaveProperty('password_hash');
  });

  it('5.5 — non-existent id → 404', async () => {
    const res = await request(app)
      .put('/api/users/999999')
      .set('Cookie', adminCookie())
      .send({ full_name: 'לא קיים', email: 'nobody@example.com', role: 'employee' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('5.6 — email taken by another user → 409', async () => {
    await testDb('users').insert({ ...seedUser, email: 'other@example.com', full_name: 'אחר' });

    const res = await request(app)
      .put(`/api/users/${userId}`)
      .set('Cookie', adminCookie())
      .send({ full_name: 'שרה כהן', email: 'other@example.com', role: 'employee' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_CONFLICT');
  });

  it('5.7 — new password fails complexity → 422', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}`)
      .set('Cookie', adminCookie())
      .send({ full_name: 'שרה כהן', email: 'sarah@example.com', role: 'employee', password: 'weakpass' });

    expect(res.status).toBe(422);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'password' })])
    );
  });

  it('5.8 — employee JWT → 403', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}`)
      .set('Cookie', employeeCookie())
      .send({ full_name: 'שרה כהן', email: 'sarah@example.com', role: 'employee' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('400 — non-numeric id → 404', async () => {
    const res = await request(app)
      .put('/api/users/not-a-number')
      .set('Cookie', adminCookie())
      .send({ full_name: 'שרה כהן', email: 'sarah@example.com', role: 'employee' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('400 — missing full_name', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}`)
      .set('Cookie', adminCookie())
      .send({ email: 'sarah@example.com', role: 'employee' });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'full_name' })])
    );
  });

  it('400 — invalid email format', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}`)
      .set('Cookie', adminCookie())
      .send({ full_name: 'שרה כהן', email: 'not-an-email', role: 'employee' });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })])
    );
  });

  it('400 — invalid role', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}`)
      .set('Cookie', adminCookie())
      .send({ full_name: 'שרה כהן', email: 'sarah@example.com', role: 'superuser' });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'role' })])
    );
  });

  // ISSUE-07: email normalization on update
  it('normalizes mixed-case email to lowercase before updating', async () => {
    const res = await request(app)
      .put(`/api/users/${userId}`)
      .set('Cookie', adminCookie())
      .send({ full_name: 'שרה כהן', email: 'Sarah@Example.COM', role: 'employee' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('sarah@example.com');
  });

  // ISSUE-02: last-active-admin protection on role change
  it('5.9 — demoting the only active admin to employee → 400 BAD_REQUEST', async () => {
    const [adminRow] = await testDb('users')
      .insert({ ...seedUser, email: 'sole-admin@example.com', role: 'admin', full_name: 'אדמין יחיד' })
      .returning('id');

    const res = await request(app)
      .put(`/api/users/${adminRow.id}`)
      .set('Cookie', adminCookie())
      .send({ full_name: 'אדמין לשעבר', email: 'sole-admin@example.com', role: 'employee' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('5.10 — demoting one of two active admins to employee → 200', async () => {
    await testDb('users')
      .insert({ ...seedUser, email: 'admin2@example.com', role: 'admin', full_name: 'אדמין שני' });
    const [adminRow] = await testDb('users')
      .insert({ ...seedUser, email: 'admin1@example.com', role: 'admin', full_name: 'אדמין ראשון' })
      .returning('id');

    const res = await request(app)
      .put(`/api/users/${adminRow.id}`)
      .set('Cookie', adminCookie())
      .send({ full_name: 'אדמין ראשון', email: 'admin1@example.com', role: 'employee' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('role', 'employee');
  });
});

describe('PATCH /api/users/:id/deactivate', () => {
  let employeeId: number;
  let adminId: number;

  beforeEach(async () => {
    const [emp] = await testDb('users').insert(seedUser).returning('id');
    const [adm] = await testDb('users')
      .insert({ ...seedUser, email: 'admin1@example.com', role: 'admin', full_name: 'אדמין ראשי' })
      .returning('id');
    employeeId = emp.id;
    adminId = adm.id;
  });

  it('6.4 — deactivate regular employee → 200, is_active false', async () => {
    const res = await request(app)
      .patch(`/api/users/${employeeId}/deactivate`)
      .set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('is_active', false);
    expect(res.body).toHaveProperty('id', employeeId);
  });

  it('6.5 — deactivate one of two active admins → 200', async () => {
    await testDb('users').insert({ ...seedUser, email: 'admin2@example.com', role: 'admin', full_name: 'אדמין שני' });

    const res = await request(app)
      .patch(`/api/users/${adminId}/deactivate`)
      .set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('is_active', false);
  });

  it('6.6 — deactivate the only remaining active admin → 400', async () => {
    const res = await request(app)
      .patch(`/api/users/${adminId}/deactivate`)
      .set('Cookie', adminCookie());

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BAD_REQUEST');
    expect(res.body.message).toBe('לא ניתן להשבית את המנהל האחרון הפעיל');
  });

  it('6.9 — already-inactive user → 200 idempotent', async () => {
    await testDb('users').where({ id: employeeId }).update({ is_active: false });

    const res = await request(app)
      .patch(`/api/users/${employeeId}/deactivate`)
      .set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('is_active', false);
  });

  it('6.10 — employee JWT → 403', async () => {
    const res = await request(app)
      .patch(`/api/users/${employeeId}/deactivate`)
      .set('Cookie', employeeCookie());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('6.11 — non-existent user id → 404', async () => {
    const res = await request(app)
      .patch('/api/users/999999/deactivate')
      .set('Cookie', adminCookie());

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
