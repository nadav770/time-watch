'use strict';

import { PasswordComplexityError } from './errors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = new Set(['employee', 'admin']);

interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}

interface CreateUserInput {
  full_name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
}

interface UpdateUserInput {
  full_name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  is_active?: unknown;
}

interface LoginInput {
  email?: unknown;
  password?: unknown;
}

// Validates fields required for creating a new user
export function validateCreateUser({ full_name, email, password, role }: CreateUserInput = {}): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) {
    errors.push({ field: 'full_name', message: 'שם מלא הוא שדה חובה' });
  } else if (full_name.trim().length > 150) {
    errors.push({ field: 'full_name', message: 'שם מלא לא יכול לעלות על 150 תווים' });
  }

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.push({ field: 'email', message: 'אימייל הוא שדה חובה' });
  } else if (!EMAIL_RE.test(email.trim())) {
    errors.push({ field: 'email', message: 'אימייל לא תקין' });
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    errors.push({ field: 'password', message: 'סיסמה היא שדה חובה' });
  }

  if (!role || typeof role !== 'string') {
    errors.push({ field: 'role', message: 'תפקיד הוא שדה חובה' });
  } else if (!VALID_ROLES.has(role)) {
    errors.push({ field: 'role', message: 'תפקיד לא תקין. ערכים מותרים: employee, admin' });
  }

  return { valid: errors.length === 0, errors };
}

// Validates a PUT /api/users/:id body — full_name/email/role required; password complexity delegated to service
export function validateUpdateUser({ full_name, email, password, role, is_active }: UpdateUserInput = {}): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) {
    errors.push({ field: 'full_name', message: 'שם מלא הוא שדה חובה' });
  } else if (full_name.trim().length > 150) {
    errors.push({ field: 'full_name', message: 'שם מלא לא יכול לעלות על 150 תווים' });
  }

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.push({ field: 'email', message: 'אימייל הוא שדה חובה' });
  } else if (!EMAIL_RE.test(email.trim())) {
    errors.push({ field: 'email', message: 'אימייל לא תקין' });
  }

  if (!role || typeof role !== 'string') {
    errors.push({ field: 'role', message: 'תפקיד הוא שדה חובה' });
  } else if (!VALID_ROLES.has(role)) {
    errors.push({ field: 'role', message: 'תפקיד לא תקין. ערכים מותרים: employee, admin' });
  }

  if (is_active !== undefined && typeof is_active !== 'boolean')
    errors.push({ field: 'is_active', message: 'is_active חייב להיות ערך בוליאני' });

  return { valid: errors.length === 0, errors };
}

// Validates login input fields
export function validateLogin({ email, password }: LoginInput = {}): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.push({ field: 'email', message: 'אימייל הוא שדה חובה' });
  } else if (!EMAIL_RE.test(email.trim())) {
    errors.push({ field: 'email', message: 'אימייל לא תקין' });
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    errors.push({ field: 'password', message: 'סיסמה היא שדה חובה' });
  }

  return { valid: errors.length === 0, errors };
}

// Validates password complexity requirements and throws PasswordComplexityError if not met
export function validatePasswordComplexity(password: string, fieldName = 'password'): void {
  const missing: string[] = [];
  if (password.length < 8)             missing.push('לפחות 8 תווים');
  if (!/[A-Z]/.test(password))         missing.push('אות גדולה אחת לפחות');
  if (!/[a-z]/.test(password))         missing.push('אות קטנה אחת לפחות');
  if (!/\d/.test(password))            missing.push('ספרה אחת לפחות');
  if (!/[^A-Za-z0-9]/.test(password))  missing.push('תו מיוחד אחד לפחות');
  if (missing.length > 0) {
    throw new PasswordComplexityError([{ field: fieldName, message: `הסיסמה חייבת לכלול: ${missing.join(', ')}` }]);
  }
}
