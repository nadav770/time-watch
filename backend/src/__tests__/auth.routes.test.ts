'use strict';

process.env.JWT_SECRET = 'test-secret-used-only-in-jest-at-least-32-chars!!';

import request from 'supertest';
import knexLib from 'knex';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
const knexConfigs = require('../../knexfile.cjs');
import { createApp } from '../app';
import db from '../db/knex';

let testDb: ReturnType<typeof knexLib>;
let app: ReturnType<typeof createApp>;
let passwordHash: string;

const TEST_PASSWORD = 'Temp1234!';
const TEST_USER = {
  full_name: 'ישראל ישראלי',
  email: 'israel@example.com',
  role: 'employee',
  is_active: true,
};

beforeAll(async () => {
  testDb = knexLib(knexConfigs.test);
  await testDb.migrate.rollback(undefined, true);
  await testDb.migrate.latest();
  app = createApp();
  passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
});

afterEach(async () => {
  await testDb('users').delete();
});

afterAll(async () => {
  await testDb.migrate.rollback(undefined, true);
  await testDb.destroy();
  await db.closeDatabase();
});

async function insertUser(overrides: Record<string, any> = {}): Promise<any> {
  const [row] = await testDb('users')
    .insert({ ...TEST_USER, password_hash: passwordHash, ...overrides })
    .returning('*');
  return row;
}

describe('POST /api/auth/login', () => {
  it('200 — valid credentials set HttpOnly cookie and return safe user fields', async () => {
    await insertUser();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieStr).toMatch(/^token=/);
    expect(cookieStr).toMatch(/HttpOnly/i);
    expect(cookieStr).toMatch(/SameSite=Strict/i);
    // 8 hours = 28 800 seconds; verify a reasonable session lifetime
    expect(cookieStr).toMatch(/Max-Age=28800/i);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe(TEST_USER.full_name);
    expect(res.body.email).toBe(TEST_USER.email);
    expect(res.body.role).toBe(TEST_USER.role);
    expect(res.body).not.toHaveProperty('full_name');
    expect(res.body).not.toHaveProperty('password_hash');
    expect(res.body).not.toHaveProperty('failed_attempts');
    expect(res.body).not.toHaveProperty('locked_until');
  });

  it('Secure flag is set on cookie when NODE_ENV=production', async () => {
    await insertUser();
    const orig = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_USER.email, password: TEST_PASSWORD });
      const cookieStr = Array.isArray(res.headers['set-cookie'])
        ? res.headers['set-cookie'][0]
        : res.headers['set-cookie'];
      expect(cookieStr).toMatch(/;\s*Secure/i);
    } finally {
      process.env.NODE_ENV = orig;
    }
  });

  it('400 — missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: TEST_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })])
    );
  });

  it('400 — missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'password' })])
    );
  });

  it('400 — invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: TEST_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })])
    );
  });

  it('401 — wrong password returns INVALID_CREDENTIALS', async () => {
    await insertUser();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'WrongPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('401 — unknown email returns same status and message as wrong password (anti-enumeration)', async () => {
    await insertUser();

    const wrongPasswordRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'WrongPass1!' });

    const unknownEmailRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: TEST_PASSWORD });

    expect(unknownEmailRes.status).toBe(wrongPasswordRes.status);
    expect(unknownEmailRes.body.code).toBe(wrongPasswordRes.body.code);
    expect(unknownEmailRes.body.message).toBe(wrongPasswordRes.body.message);
  });

  // Intentional trade-off: for this internal, admin-managed app we surface ACCOUNT_INACTIVE
  // only when the password is correct. An attacker who already knows the password learns
  // nothing new; wrong passwords still receive INVALID_CREDENTIALS (see 7.6 below).
  it('7.4 — inactive user + correct password → 403 ACCOUNT_INACTIVE', async () => {
    await insertUser({ is_active: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_INACTIVE');
  });

  it('7.5 — active user + correct password → 200 (regression guard)', async () => {
    await insertUser();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body.role).toBe(TEST_USER.role);
  });

  it('7.6 — inactive user + wrong password → 401 (password check runs before inactive guard)', async () => {
    await insertUser({ is_active: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'WrongPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('7.7 — must_change_password: true → 200 with must_change_password: true in body', async () => {
    await insertUser({ must_change_password: true });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('must_change_password', true);
  });

  it('7.8 — must_change_password: false → 200 with must_change_password: false in body', async () => {
    await insertUser({ must_change_password: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('must_change_password', false);
  });

  it('423 — locked account returns ACCOUNT_LOCKED with minutesRemaining in message', async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
    await insertUser({ locked_until: lockedUntil });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_PASSWORD });

    expect(res.status).toBe(423);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
    expect(res.body.message).toMatch(/\d+/);
  });
});

describe('GET /api/auth/me', () => {
  it('200 — valid JWT cookie returns { id, name, email, role } without sensitive fields', async () => {
    await insertUser();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_PASSWORD });
    const cookie = loginRes.headers['set-cookie'][0];

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(TEST_USER.full_name);
    expect(res.body.email).toBe(TEST_USER.email);
    expect(res.body.role).toBe(TEST_USER.role);
    expect(res.body).toHaveProperty('id');
    expect(res.body).not.toHaveProperty('full_name');
    expect(res.body).not.toHaveProperty('password_hash');
    expect(res.body).not.toHaveProperty('failed_attempts');
  });

  it('401 — user deactivated after token was issued', async () => {
    const user = await insertUser();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_PASSWORD });
    const cookie = loginRes.headers['set-cookie'][0];

    await testDb('users').where({ id: user.id }).update({ is_active: false });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('401 — no cookie present', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('401 — malformed / invalid JWT token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'token=this.is.not.a.valid.jwt');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('401 — expired JWT token', async () => {
    const expired = jwt.sign(
      { sub: 999999, role: 'employee' },
      process.env.JWT_SECRET as string,
      { expiresIn: -1 }
    );
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `token=${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });
});

describe('Global auth middleware — public path exemptions', () => {
  it('POST /api/auth/login is reachable without a cookie (reaches the controller)', async () => {
    // Invalid email format triggers 400 VALIDATION_ERROR — proves the request
    // was not blocked by the auth middleware with 401 UNAUTHENTICATED.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/health is reachable without a cookie', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('GET /api-docs is reachable without a cookie', async () => {
    const res = await request(app).get('/api-docs');
    expect(res.status).not.toBe(401);
  });

  it('POST /api/auth/login/ with trailing slash is reachable without a cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login/')
      .send({ email: 'not-an-email', password: '' });
    expect(res.status).not.toBe(401);
  });

  it('GET /api/health/ with trailing slash returns 200 without a cookie', async () => {
    const res = await request(app).get('/api/health/');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/change-password', () => {
  const NEW_PASSWORD = 'NewPass1@';
  let userCookie: string;

  beforeEach(async () => {
    await insertUser({ must_change_password: true });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_PASSWORD });
    userCookie = loginRes.headers['set-cookie'][0];
  });

  it('8.4 — wrong current_password → 401', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', userCookie)
      .send({ current_password: 'WrongPass1!', new_password: NEW_PASSWORD });

    expect(res.status).toBe(401);
  });

  it('8.5 — new_password fails complexity → 422 with rule description', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', userCookie)
      .send({ current_password: TEST_PASSWORD, new_password: 'weakpass' });

    expect(res.status).toBe(422);
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'new_password' })])
    );
  });

  it('8.6 — valid request → 200; must_change_password = false and new hash in DB', async () => {
    const before = await testDb('users').where({ email: TEST_USER.email }).first();

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', userCookie)
      .send({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('הסיסמה שונתה בהצלחה');

    const after = await testDb('users').where({ email: TEST_USER.email }).first();
    expect(after.must_change_password).toBe(false);
    expect(after.password_hash).not.toBe(before.password_hash);
  });

  it('8.7 — after successful change, login response includes must_change_password: false', async () => {
    await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', userCookie)
      .send({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: NEW_PASSWORD });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.must_change_password).toBe(false);
  });

  it('8.8 — unauthenticated request (no cookie) → 401', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  // new_password must differ from current — uses PASSWORD_REUSE (not PASSWORD_COMPLEXITY)
  // so the client can show a targeted message rather than a generic complexity error
  it('8.9 — new_password same as current_password → 422 PASSWORD_REUSE', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', userCookie)
      .send({ current_password: TEST_PASSWORD, new_password: TEST_PASSWORD });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PASSWORD_REUSE');
  });

  // ISSUE-03: deactivated user with a forged-but-valid JWT must be blocked
  it('8.10 — deactivated user with valid JWT → 403 ACCOUNT_INACTIVE', async () => {
    const inactiveUser = await insertUser({ email: 'inactive@example.com', is_active: false });
    const forgedToken = jwt.sign(
      { sub: inactiveUser.id, role: inactiveUser.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '8h' }
    );

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', `token=${forgedToken}`)
      .send({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_INACTIVE');
  });

  // ISSUE-06: locked account is rejected before the password check
  it('8.11 — locked account → 423 ACCOUNT_LOCKED', async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
    const lockedUser = await insertUser({ email: 'locked@example.com', locked_until: lockedUntil });
    const forgedToken = jwt.sign(
      { sub: lockedUser.id, role: lockedUser.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '8h' }
    );

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', `token=${forgedToken}`)
      .send({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD });

    expect(res.status).toBe(423);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  // ISSUE-06: wrong current_password increments failed_attempts (mirrors login lockout)
  it('8.12 — wrong current_password increments failed_attempts in DB', async () => {
    await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', userCookie)
      .send({ current_password: 'WrongPass1!', new_password: NEW_PASSWORD });

    const row = await testDb('users').where({ email: TEST_USER.email }).first();
    expect(row.failed_attempts).toBe(1);
  });

  // Consistency with login lockout: 3 consecutive wrong current_password values lock the account
  it('8.13 — 3 wrong current_password attempts → account locked (423 ACCOUNT_LOCKED)', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', userCookie)
        .send({ current_password: 'WrongPass1!', new_password: NEW_PASSWORD });
    }

    // Even the correct password is now blocked by the lockout check
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', userCookie)
      .send({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD });

    expect(res.status).toBe(423);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('8.14 — successful password change resets failed_attempts counter to 0', async () => {
    // Two wrong attempts to bump the counter
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post('/api/auth/change-password')
        .set('Cookie', userCookie)
        .send({ current_password: 'WrongPass1!', new_password: NEW_PASSWORD });
    }

    // Correct change
    await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', userCookie)
      .send({ current_password: TEST_PASSWORD, new_password: NEW_PASSWORD });

    const row = await testDb('users').where({ email: TEST_USER.email }).first();
    expect(row.failed_attempts).toBe(0);
  });
});

describe('POST /api/auth/logout', () => {
  it('200 — with a valid cookie clears it and returns success message', async () => {
    await insertUser();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_PASSWORD });
    const cookie = loginRes.headers['set-cookie'][0];

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('התנתקת בהצלחה');

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieStr).toMatch(/Max-Age=0/i);
  });

  it('200 — without any cookie also returns 200 (idempotent)', async () => {
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('התנתקת בהצלחה');

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieStr).toMatch(/Max-Age=0/i);
  });
});
