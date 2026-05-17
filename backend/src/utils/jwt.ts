'use strict';

import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not set');
}

export interface JwtPayload {
  sub?: number | string;
  id?: number | string;
  role: string;
  iat?: number;
  exp?: number;
}

// Signs a JWT token with the given payload
export function signToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'],
  });
}

// Verifies a JWT token and returns the decoded payload
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;
}
