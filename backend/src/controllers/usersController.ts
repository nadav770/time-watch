'use strict';

import { Request, Response, NextFunction } from 'express';
import { createUser, listUsers, updateUser, deactivateUser, activateUser } from '../services/usersService';
import { validateCreateUser, validateUpdateUser } from '../utils/validate';
import { ValidationError, NotFoundError } from '../utils/errors';

// Creates a new user; admin only
async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { valid, errors } = validateCreateUser(req.body);
    if (!valid) { next(new ValidationError(errors)); return; }

    const user = await createUser(req.body);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

// Returns all non-deleted users; admin only
async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await listUsers();
    res.status(200).json(users);
  } catch (err) {
    next(err);
  }
}

// Updates full_name/email/role (and optionally password) for a user; admin only
async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { next(new NotFoundError('המשתמש לא נמצא')); return; }

    const { valid, errors } = validateUpdateUser(req.body);
    if (!valid) { next(new ValidationError(errors)); return; }

    const user = await updateUser(id, req.body);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}

// Soft-deactivates a user; admin only
async function deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { next(new NotFoundError('המשתמש לא נמצא')); return; }

    const user = await deactivateUser(id);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}

// Reactivates a soft-deactivated user; admin only
async function activate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { next(new NotFoundError('המשתמש לא נמצא')); return; }
    const user = await activateUser(id);
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
}

export { create, list, update, deactivate, activate };
