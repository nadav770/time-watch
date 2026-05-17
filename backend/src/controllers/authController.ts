'use strict';

import { Request, Response, NextFunction } from 'express';
import { login as loginService, changePassword as changePasswordService } from '../services/authService';
import * as usersRepository from '../repositories/usersRepository';
import { validateLogin } from '../utils/validate';
import { ValidationError, UnauthorizedError } from '../utils/errors';

// Evaluated per-request so that NODE_ENV can be overridden in tests
function cookieBase(): Record<string, unknown> {
  const prod = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: prod ? 'none' : 'lax',
    secure: prod,
  };
}

const MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

// Handles POST /api/auth/login; validates input and sets HttpOnly cookie on success
async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { valid, errors } = validateLogin(req.body);
    if (!valid) { next(new ValidationError(errors)); return; }

    const { token, user } = await loginService(req.body);

    res.cookie('token', token, { ...cookieBase(), maxAge: MAX_AGE_MS });

    res.status(200).json({
      id: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role,
      must_change_password: user.must_change_password,
    });
  } catch (err) {
    next(err);
  }
}

// Handles POST /api/auth/logout; clears the session cookie
function logout(req: Request, res: Response): void {
  res.cookie('token', '', { ...cookieBase(), maxAge: 0 });
  res.status(200).json({ message: 'התנתקת בהצלחה' });
}

// Handles GET /api/auth/me; returns the current user's profile from DB
async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await usersRepository.findById(req.user!.id);
    if (!user) { next(new UnauthorizedError()); return; }
    res.status(200).json({ id: user.id, name: user.full_name, email: user.email, role: user.role, must_change_password: user.must_change_password ?? false });
  } catch (err) {
    next(err);
  }
}

// Handles POST /api/auth/change-password; requires valid session via authenticate middleware
async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await changePasswordService(req.user!.id, req.body);
    res.status(200).json({ message: 'הסיסמה שונתה בהצלחה' });
  } catch (err) {
    next(err);
  }
}

export { login, logout, me, changePassword };
