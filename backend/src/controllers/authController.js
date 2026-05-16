'use strict';

const { login: loginService, changePassword: changePasswordService } = require('../services/authService');
const usersRepository = require('../repositories/usersRepository');
const { validateLogin } = require('../utils/validate');
const { ValidationError, UnauthorizedError } = require('../utils/errors');

// Evaluated per-request so that NODE_ENV can be overridden in tests (e.g. to assert the Secure flag)
function cookieBase() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}

const MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

async function login(req, res, next) {
  try {
    const { valid, errors } = validateLogin(req.body);
    if (!valid) return next(new ValidationError(errors));

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

function logout(req, res) {
  res.cookie('token', '', { ...cookieBase(), maxAge: 0 });
  res.status(200).json({ message: 'התנתקת בהצלחה' });
}

async function me(req, res, next) {
  try {
    const user = await usersRepository.findById(req.user.id);
    if (!user) return next(new UnauthorizedError());
    res.status(200).json({ id: user.id, name: user.full_name, email: user.email, role: user.role, must_change_password: user.must_change_password ?? false });
  } catch (err) {
    next(err);
  }
}

// Handles POST /api/auth/change-password; requires valid session via authenticate middleware
async function changePassword(req, res, next) {
  try {
    await changePasswordService(req.user.id, req.body);
    res.status(200).json({ message: 'הסיסמה שונתה בהצלחה' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, me, changePassword };
