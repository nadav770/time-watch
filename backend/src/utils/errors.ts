'use strict';

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: Array<{ field: string; message: string }>;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(details: Array<{ field: string; message: string }>) {
    super(400, 'VALIDATION_ERROR', 'שגיאת קלט');
    this.details = details;
  }
}

export class ConflictError extends AppError {
  constructor(message = 'כתובת האימייל כבר קיימת במערכת') {
    super(409, 'EMAIL_CONFLICT', message);
  }
}

export class PasswordComplexityError extends AppError {
  constructor(details: Array<{ field: string; message: string }>) {
    super(422, 'PASSWORD_COMPLEXITY', 'הסיסמה אינה עומדת בדרישות');
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'נדרשת התחברות') {
    super(401, 'UNAUTHENTICATED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'אין לך הרשאה לבצע פעולה זו') {
    super(403, 'FORBIDDEN', message);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super(401, 'INVALID_CREDENTIALS', 'אימייל או סיסמה שגויים');
  }
}

export class AccountLockedError extends AppError {
  minutesRemaining: number;

  constructor(minutesRemaining: number) {
    super(423, 'ACCOUNT_LOCKED', `החשבון נעול זמנית. נסה שוב בעוד ${minutesRemaining} דקות.`);
    this.minutesRemaining = minutesRemaining;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'המשאב לא נמצא') {
    super(404, 'NOT_FOUND', message);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'בקשה לא תקינה') {
    super(400, 'BAD_REQUEST', message);
  }
}

export class AccountInactiveError extends AppError {
  constructor() {
    super(403, 'ACCOUNT_INACTIVE', 'החשבון אינו פעיל');
  }
}

// Distinct from PASSWORD_COMPLEXITY: fired specifically when new_password === current_password
export class PasswordReuseError extends AppError {
  constructor() {
    super(422, 'PASSWORD_REUSE', 'הסיסמה החדשה חייבת להיות שונה מהסיסמה הנוכחית');
  }
}
