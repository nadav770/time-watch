'use strict';

import bcrypt from 'bcryptjs';
import * as usersRepository from '../repositories/usersRepository';
import { signToken } from '../utils/jwt';
import {
  InvalidCredentialsError, AccountLockedError, AccountInactiveError,
  UnauthorizedError, PasswordReuseError,
} from '../utils/errors';
import { validatePasswordComplexity } from '../utils/validate';
import { BCRYPT_COST } from '../config/constants';

// A validly-formatted bcrypt hash used only to run a constant-time comparison when no user is found
const DUMMY_HASH = '$2b$12$LCGkLdR4exGGhQUDi4Mk8uhaTr4R1K1HYzMMpXE.jqNcbf9AhvzI6';

interface LoginInput {
  email: string;
  password: string;
}

interface ChangePasswordInput {
  current_password: string;
  new_password: string;
}

// Authenticates email/password, returns signed JWT token and safe user object
async function login({ email, password }: LoginInput): Promise<{ token: string; user: Record<string, unknown> }> {
  const user = await usersRepository.findByEmail(email);

  // Always run bcrypt — against the real hash or a dummy — before branching.
  const passwordMatch = await bcrypt.compare(
    password,
    user ? user.password_hash : DUMMY_HASH
  );

  if (!user) {
    throw new InvalidCredentialsError();
  }

  if (user.locked_until && user.locked_until > new Date()) {
    const minutesRemaining = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / (60 * 1000));
    throw new AccountLockedError(minutesRemaining);
  }

  if (!passwordMatch) {
    await usersRepository.incrementFailedAttempts(user.id);
    throw new InvalidCredentialsError();
  }

  if (!user.is_active) {
    throw new AccountInactiveError();
  }

  await usersRepository.resetLockout(user.id);

  const token = signToken({ sub: user.id, role: user.role });

  const { password_hash, failed_attempts, locked_until, deleted_at, ...safeUser } = user;
  return { token, user: safeUser };
}

// Verifies current password, validates new password complexity, updates hash in DB
async function changePassword(userId: number | string, { current_password, new_password }: ChangePasswordInput): Promise<void> {
  const user = await usersRepository.findByIdFull(userId);
  if (!user) throw new UnauthorizedError();

  // Check lockout before expensive bcrypt — userId is known from JWT so no enumeration risk
  if (user.locked_until && user.locked_until > new Date()) {
    const minutesRemaining = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / (60 * 1000));
    throw new AccountLockedError(minutesRemaining);
  }

  const match = await bcrypt.compare(current_password, user.password_hash);
  if (!match) {
    // Mirror login: increment counter; locks after MAX_FAILED_ATTEMPTS wrong attempts
    await usersRepository.incrementFailedAttempts(userId);
    throw new UnauthorizedError('סיסמה נוכחית שגויה');
  }

  // Block deactivated users even with a valid JWT
  if (!user.is_active) throw new AccountInactiveError();

  // Reject reuse of the current password
  const isSamePassword = await bcrypt.compare(new_password, user.password_hash);
  if (isSamePassword) {
    throw new PasswordReuseError();
  }

  validatePasswordComplexity(new_password, 'new_password');

  const newHash = await bcrypt.hash(new_password, BCRYPT_COST);
  await usersRepository.updatePassword(userId, newHash);
  await usersRepository.resetLockout(userId);
}

export { login, changePassword };
