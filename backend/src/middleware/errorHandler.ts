'use strict';

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

// Global error handler middleware — maps AppError subclasses to structured JSON responses
function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = { code: err.code, message: err.message };
    if (err.details) body.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }
  console.error(err);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'שגיאת שרת' });
}

export default errorHandler;
