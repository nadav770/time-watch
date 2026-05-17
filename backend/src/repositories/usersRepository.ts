'use strict';

import db from '../db/knex';
import { Knex } from 'knex';

const SAFE_COLUMNS = ['id', 'full_name', 'email', 'role', 'is_active', 'must_change_password', 'created_at'];
const MAX_FAILED_ATTEMPTS = 3;

// Returns the full user row (with password_hash) for any non-deleted user; used by login (is_active checked in service)
async function findByEmail(email: string): Promise<any> {
  return db('users')
    .whereRaw('LOWER(email) = LOWER(?)', [email])
    .whereNull('deleted_at')
    .first();
}

// Inserts a new user and returns safe columns
async function create({ full_name, email, password_hash, role, must_change_password = false }: {
  full_name: string;
  email: string;
  password_hash: string;
  role: string;
  must_change_password?: boolean;
}): Promise<any> {
  const [user] = await db('users')
    .insert({ full_name, email, password_hash, role, must_change_password })
    .returning(SAFE_COLUMNS);
  return user;
}

// Increments failed login attempts and sets lockout after threshold
async function incrementFailedAttempts(id: number | string): Promise<any> {
  const [row] = await db('users')
    .where({ id })
    .update({
      failed_attempts: db.raw('failed_attempts + 1'),
      locked_until: db.raw(
        `CASE WHEN failed_attempts + 1 >= ${MAX_FAILED_ATTEMPTS} THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END`
      ),
    })
    .returning(['id', 'failed_attempts', 'locked_until']);
  return row;
}

// Returns safe columns for an active non-deleted user; used by auth/me endpoint
async function findById(id: number | string): Promise<any> {
  return db('users')
    .where({ id, is_active: true })
    .whereNull('deleted_at')
    .select(SAFE_COLUMNS)
    .first();
}

// Returns all columns for any non-deleted user; used by services needing password_hash
async function findByIdFull(id: number | string): Promise<any> {
  return db('users')
    .where({ id })
    .whereNull('deleted_at')
    .first();
}

// Resets lockout state and records last login timestamp
async function resetLockout(id: number | string): Promise<any> {
  const [row] = await db('users')
    .where({ id })
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_login_at: db.raw('NOW()'),
    })
    .returning(['id', 'failed_attempts', 'locked_until', 'last_login_at']);
  return row;
}

// Returns all non-deleted users ordered by full name ascending
async function findAll(): Promise<any[]> {
  return db('users')
    .whereNull('deleted_at')
    .select(SAFE_COLUMNS)
    .orderBy('full_name', 'asc');
}

// Updates allowed fields on a non-deleted user; returns updated safe columns.
// Pass an optional knex transaction (trx) to participate in a caller-managed transaction.
async function update(id: number | string, patch: Record<string, unknown>, trx?: Knex.Transaction): Promise<any> {
  const [row] = await (trx || db)('users')
    .where({ id })
    .whereNull('deleted_at')
    .update({ ...patch, updated_at: db.raw('NOW()') })
    .returning(SAFE_COLUMNS);
  return row;
}

// Acquires a FOR UPDATE row lock on a single user within a transaction
async function lockUserForUpdate(id: number | string, trx: Knex.Transaction): Promise<any> {
  return trx('users')
    .where({ id })
    .whereNull('deleted_at')
    .select(['id', 'role', 'is_active'])
    .forUpdate()
    .first();
}

// Acquires FOR UPDATE locks on all active admin rows within a transaction
async function lockActiveAdmins(trx: Knex.Transaction): Promise<any[]> {
  return trx('users')
    .where({ role: 'admin', is_active: true })
    .whereNull('deleted_at')
    .select('id')
    .forUpdate();
}

// Sets is_active on a user within an existing transaction; returns updated safe columns
async function setActiveTx(id: number | string, isActive: boolean, trx: Knex.Transaction): Promise<any> {
  const [row] = await trx('users')
    .where({ id })
    .whereNull('deleted_at')
    .update({ is_active: isActive, updated_at: db.raw('NOW()') })
    .returning(SAFE_COLUMNS);
  return row;
}

// Updates password hash and clears must_change_password flag
async function updatePassword(userId: number | string, passwordHash: string): Promise<any> {
  const [row] = await db('users')
    .where({ id: userId })
    .whereNull('deleted_at')
    .update({ password_hash: passwordHash, must_change_password: false, updated_at: db.raw('NOW()') })
    .returning(SAFE_COLUMNS);
  return row;
}

export {
  findByEmail,
  findById,
  findByIdFull,
  findAll,
  create,
  update,
  incrementFailedAttempts,
  resetLockout,
  lockUserForUpdate,
  lockActiveAdmins,
  setActiveTx,
  updatePassword,
};
