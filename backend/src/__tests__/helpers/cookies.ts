'use strict';

import jwt from 'jsonwebtoken';

export function adminCookie(): string {
  const token = jwt.sign(
    { sub: 'test-admin-id', role: 'admin' },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );
  return `token=${token}`;
}

export function employeeCookie(): string {
  const token = jwt.sign(
    { sub: 'test-employee-id', role: 'employee' },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );
  return `token=${token}`;
}
