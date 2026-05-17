'use strict';

import knexLib from 'knex';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const knexConfigs = require('../../knexfile.cjs');
import { findByEmail, findById, create, incrementFailedAttempts, resetLockout } from '../repositories/usersRepository';
import db from '../db/knex';

let testDb: any;

beforeAll(async () => {
  testDb = knexLib(knexConfigs.test);
  await testDb.migrate.rollback(undefined, true);
  await testDb.migrate.latest();
});

afterEach(async () => {
  await testDb('users').delete();
});

afterAll(async () => {
  await testDb.migrate.rollback(undefined, true);
  await testDb.destroy();
  await db.closeDatabase(); // close the module-level singleton used by the repository
});

const sample = {
  full_name: 'ישראל ישראלי',
  email: 'israel@example.com',
  password_hash: '$2b$12$hashedpassword',
  role: 'employee',
};

describe('usersRepository.create', () => {
  it('inserts a user and returns safe columns (no password_hash)', async () => {
    const user = await create(sample);
    expect(user.email).toBe(sample.email);
    expect(user.full_name).toBe(sample.full_name);
    expect(user.role).toBe('employee');
    expect(user.is_active).toBe(true);
    expect(user).not.toHaveProperty('password_hash');
  });

  it('throws pg error 23505 on duplicate email', async () => {
    await create(sample);
    await expect(create(sample)).rejects.toMatchObject({ code: '23505' });
  });
});

describe('usersRepository.findByEmail', () => {
  it('returns the user row including password_hash', async () => {
    await create(sample);
    const found = await findByEmail(sample.email);
    expect(found.email).toBe(sample.email);
    expect(found).toHaveProperty('password_hash');
  });

  it('is case-insensitive', async () => {
    await create(sample);
    const found = await findByEmail('ISRAEL@EXAMPLE.COM');
    expect(found).toBeDefined();
    expect(found.email).toBe(sample.email);
  });

  it('returns undefined for a soft-deleted user', async () => {
    await testDb('users')
      .insert({ ...sample, deleted_at: new Date() })
      .returning('id');
    const found = await findByEmail(sample.email);
    expect(found).toBeUndefined();
  });

  it('returns the user row even when is_active = false (is_active guard moved to service)', async () => {
    await testDb('users').insert({ ...sample, is_active: false });
    const found = await findByEmail(sample.email);
    expect(found).toBeDefined();
    expect(found.is_active).toBe(false);
  });
});

describe('usersRepository.findById', () => {
  it('returns safe columns for an existing active user', async () => {
    const created = await create(sample);
    const found = await findById(created.id);
    expect(found.id).toBe(created.id);
    expect(found.email).toBe(sample.email);
    expect(found).not.toHaveProperty('password_hash');
    expect(found).not.toHaveProperty('failed_attempts');
    expect(found).not.toHaveProperty('locked_until');
  });

  it('returns undefined for an unknown id', async () => {
    const found = await findById(999999);
    expect(found).toBeUndefined();
  });

  it('returns undefined for a soft-deleted user', async () => {
    const [row] = await testDb('users')
      .insert({ ...sample, deleted_at: new Date() })
      .returning('id');
    const found = await findById(row.id);
    expect(found).toBeUndefined();
  });

  it('returns undefined for an inactive user', async () => {
    const [row] = await testDb('users')
      .insert({ ...sample, is_active: false })
      .returning('id');
    const found = await findById(row.id);
    expect(found).toBeUndefined();
  });
});

describe('usersRepository.incrementFailedAttempts', () => {
  let userId: number;

  beforeEach(async () => {
    const [row] = await testDb('users').insert(sample).returning('id');
    userId = row.id;
  });

  it('increments failed_attempts by 1', async () => {
    const result = await incrementFailedAttempts(userId);
    expect(result.failed_attempts).toBe(1);
  });

  it('does not set locked_until on the 2nd attempt', async () => {
    await testDb('users').where({ id: userId }).update({ failed_attempts: 1 });
    const result = await incrementFailedAttempts(userId);
    expect(result.failed_attempts).toBe(2);
    expect(result.locked_until).toBeNull();
  });

  it('sets locked_until ~15 min from now on the 3rd attempt', async () => {
    await testDb('users').where({ id: userId }).update({ failed_attempts: 2 });
    const before = new Date();
    const result = await incrementFailedAttempts(userId);
    const after = new Date();

    expect(result.failed_attempts).toBe(3);
    expect(result.locked_until).not.toBeNull();

    const lockedUntil = new Date(result.locked_until);
    expect(lockedUntil.getTime()).toBeGreaterThanOrEqual(before.getTime() + 14 * 60 * 1000);
    expect(lockedUntil.getTime()).toBeLessThanOrEqual(after.getTime() + 16 * 60 * 1000);
  });
});

describe('usersRepository.resetLockout', () => {
  let userId: number;

  beforeEach(async () => {
    const [row] = await testDb('users')
      .insert({ ...sample, failed_attempts: 3, locked_until: new Date(Date.now() + 10 * 60 * 1000) })
      .returning('id');
    userId = row.id;
  });

  it('resets failed_attempts to 0', async () => {
    const result = await resetLockout(userId);
    expect(result.failed_attempts).toBe(0);
  });

  it('clears locked_until', async () => {
    const result = await resetLockout(userId);
    expect(result.locked_until).toBeNull();
  });

  it('sets last_login_at to a recent timestamp', async () => {
    const before = new Date();
    const result = await resetLockout(userId);
    const after = new Date();

    expect(result.last_login_at).not.toBeNull();
    const loginAt = new Date(result.last_login_at);
    expect(loginAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(loginAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });
});
