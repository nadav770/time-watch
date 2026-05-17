'use strict';

process.env.JWT_SECRET = 'test-secret-used-only-in-jest-at-least-32-chars!!';

jest.mock('../repositories/usersRepository');
jest.mock('../db/knex', () => ({ transaction: jest.fn() }));

import * as usersRepository from '../repositories/usersRepository';
import db from '../db/knex';
import { createUser, updateUser, deactivateUser } from '../services/usersService';
import { PasswordComplexityError, BadRequestError } from '../utils/errors';

const mockUsersRepository = usersRepository as jest.Mocked<typeof usersRepository>;
const mockDb = db as any;

describe('createUser unit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('4.4 — stores bcrypt hash (not plain password), sets must_change_password: true, returns repo row', async () => {
    const fakeRow = {
      id: 1,
      full_name: 'ישראל ישראלי',
      email: 'israel@example.com',
      role: 'employee',
      is_active: true,
      must_change_password: true,
      created_at: new Date(),
    };
    mockUsersRepository.create.mockResolvedValue(fakeRow);

    const result = await createUser({
      full_name: 'ישראל ישראלי',
      email: 'israel@example.com',
      password: 'Temp1234!',
      role: 'employee',
    });

    const callArg = mockUsersRepository.create.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('password');
    expect(callArg.password_hash).toMatch(/^\$2[ab]\$/);
    expect(callArg.must_change_password).toBe(true);
    expect(result).toEqual(fakeRow);
  });

  it('throws PasswordComplexityError before calling repository when password is weak', async () => {
    await expect(
      createUser({ full_name: 'Test', email: 'test@example.com', password: 'weak', role: 'employee' })
    ).rejects.toBeInstanceOf(PasswordComplexityError);
    expect(mockUsersRepository.create).not.toHaveBeenCalled();
  });
});

describe('updateUser unit', () => {
  let mockTrx: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTrx = {
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    mockDb.transaction.mockImplementation(async (cb: (trx: any) => Promise<any>) => {
      try {
        const result = await cb(mockTrx);
        await mockTrx.commit();
        return result;
      } catch (err) {
        await mockTrx.rollback();
        throw err;
      }
    });
  });

  it('5.A — demoting last active admin → throws BadRequestError, update never called', async () => {
    mockUsersRepository.lockUserForUpdate.mockResolvedValue({ id: 1, role: 'admin', is_active: true });
    mockUsersRepository.lockActiveAdmins.mockResolvedValue([{ id: 1 }]);

    await expect(
      updateUser(1, { full_name: 'Test', email: 'test@example.com', role: 'employee' })
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(mockUsersRepository.update).not.toHaveBeenCalled();
  });

  it('5.B — demoting last active admin → transaction rolled back, never committed', async () => {
    mockUsersRepository.lockUserForUpdate.mockResolvedValue({ id: 1, role: 'admin', is_active: true });
    mockUsersRepository.lockActiveAdmins.mockResolvedValue([{ id: 1 }]);

    await expect(
      updateUser(1, { full_name: 'Test', email: 'test@example.com', role: 'employee' })
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(mockTrx.rollback).toHaveBeenCalledTimes(1);
    expect(mockTrx.commit).not.toHaveBeenCalled();
  });
});

describe('deactivateUser unit', () => {
  let mockTrx: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTrx = {
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    // Simulate Knex transaction: commit on resolve, rollback on throw
    mockDb.transaction.mockImplementation(async (cb: (trx: any) => Promise<any>) => {
      try {
        const result = await cb(mockTrx);
        await mockTrx.commit();
        return result;
      } catch (err) {
        await mockTrx.rollback();
        throw err;
      }
    });
  });

  it('6.7 — last active admin → throws BadRequestError, setActiveTx never called', async () => {
    mockUsersRepository.lockUserForUpdate.mockResolvedValue({ id: 1, role: 'admin', is_active: true });
    mockUsersRepository.lockActiveAdmins.mockResolvedValue([{ id: 1 }]);

    await expect(deactivateUser(1)).rejects.toBeInstanceOf(BadRequestError);
    expect(mockUsersRepository.setActiveTx).not.toHaveBeenCalled();
  });

  it('6.8 — last active admin → transaction rolled back, never committed', async () => {
    mockUsersRepository.lockUserForUpdate.mockResolvedValue({ id: 1, role: 'admin', is_active: true });
    mockUsersRepository.lockActiveAdmins.mockResolvedValue([{ id: 1 }]);

    await expect(deactivateUser(1)).rejects.toBeInstanceOf(BadRequestError);
    expect(mockTrx.rollback).toHaveBeenCalledTimes(1);
    expect(mockTrx.commit).not.toHaveBeenCalled();
  });
});
