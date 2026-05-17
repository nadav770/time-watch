'use strict';

import { Request, Response, NextFunction } from 'express';
import { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { verifyToken } from '../utils/jwt';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

// Extracts the JWT token from cookie or Authorization header
function extractToken(req: Request): string | null {
  if (req.cookies?.token) return req.cookies.token as string;

  const authHeader = req.get?.('authorization') || req.headers?.authorization;
  if (typeof authHeader !== 'string') return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// Validates JWT signature and expiry only — no DB round-trip.
function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) { next(new UnauthorizedError()); return; }

  try {
    const payload = verifyToken(token);
    // payload.sub is the current standard; payload.id supports tokens issued by the old inline login handler
    req.user = { id: (payload.sub ?? payload.id) as number | string, role: payload.role };
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError || err instanceof JsonWebTokenError) {
      next(new UnauthorizedError()); return;
    }
    next(err);
  }
}

// Guards routes by role — usage: requireRole('admin') or requireRole('admin', 'manager')
function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { next(new UnauthorizedError()); return; }
    if (!roles.includes(req.user.role)) { next(new ForbiddenError()); return; }
    next();
  };
}

export { authenticate, requireRole, extractToken };
