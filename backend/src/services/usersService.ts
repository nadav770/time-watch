'use strict';

import bcrypt from 'bcryptjs';
import * as usersRepository from '../repositories/usersRepository';
import db from '../db/knex';
import { ConflictError, NotFoundError, BadRequestError } from '../utils/errors';
import { validatePasswordComplexity } from '../utils/validate';
import { BCRYPT_COST } from '../config/constants';

interface CreateUserInput {
  full_name: string;
  email: string;
  password: string;
  role: string;
}

interface UpdateUserInput {
  full_name: string;
  email: string;
  role: string;
  password?: string;
}

// Creates a new user with hashed password and must_change_password flag set to true
async function createUser({ full_name, email, password, role }: CreateUserInput): Promise<any> {
  validatePasswordComplexity(password);
  const password_hash = await bcrypt.hash(password, BCRYPT_COST);
  try {
    return await usersRepository.create({ full_name, email: email.trim().toLowerCase(), password_hash, role, must_change_password: true });
  } catch (err: any) {
    if (err.code === '23505') throw new ConflictError();
    throw err;
  }
}

// Returns all non-deleted users ordered by name
async function listUsers(): Promise<any[]> {
  return usersRepository.findAll();
}

// Updates full_name/email/role and optionally re-hashes a new password
async function updateUser(id: number | string, { full_name, email, role, password }: UpdateUserInput): Promise<any> {
  const patch: Record<string, unknown> = { full_name, email: email.trim().toLowerCase(), role };
  if (password !== undefined) {
    validatePasswordComplexity(password);
    patch.password_hash = await bcrypt.hash(password, BCRYPT_COST);
  }

  return db.transaction(async (trx) => {
    const existing = await usersRepository.lockUserForUpdate(id, trx);
    if (!existing) throw new NotFoundError('המשתמש לא נמצא');

    // Prevent demoting the last active admin
    if (existing.role === 'admin' && role !== 'admin') {
      const activeAdmins = await usersRepository.lockActiveAdmins(trx);
      if (activeAdmins.length <= 1) {
        throw new BadRequestError('לא ניתן לשנות תפקיד המנהל האחרון הפעיל');
      }
    }

    try {
      const row = await usersRepository.update(id, patch, trx);
      if (!row) throw new NotFoundError('המשתמש לא נמצא');
      return row;
    } catch (err: any) {
      if (err.code === '23505') throw new ConflictError();
      throw err;
    }
  });
}

// Soft-deactivates a user inside a transaction; blocks deactivating the last active admin
async function deactivateUser(id: number | string): Promise<any> {
  return db.transaction(async (trx) => {
    const user = await usersRepository.lockUserForUpdate(id, trx);
    if (!user) throw new NotFoundError('המשתמש לא נמצא');

    if (!user.is_active) {
      return usersRepository.setActiveTx(id, false, trx);
    }

    if (user.role === 'admin') {
      const lockedAdmins = await usersRepository.lockActiveAdmins(trx);
      if (lockedAdmins.length <= 1) {
        throw new BadRequestError('לא ניתן להשבית את המנהל האחרון הפעיל');
      }
    }

    return usersRepository.setActiveTx(id, false, trx);
  });
}

// Reactivates a previously deactivated user
async function activateUser(id: number | string): Promise<any> {
  return db.transaction(async (trx) => {
    const user = await usersRepository.lockUserForUpdate(id, trx);
    if (!user) throw new NotFoundError('המשתמש לא נמצא');
    return usersRepository.setActiveTx(id, true, trx);
  });
}

export { createUser, listUsers, updateUser, deactivateUser, activateUser };
