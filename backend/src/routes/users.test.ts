'use strict';

import request from 'supertest';
import express from 'express';
import usersRouter from './users';

const app = express();
app.use(express.json());
app.use('/api/users', usersRouter);

describe('GET /api/users', () => {
  it.todo('returns 200 with list of all active users (admin only)');
  it.todo('returns 401 when not authenticated');
  it.todo('returns 403 when authenticated as non-admin');
});

describe('POST /api/users', () => {
  it.todo('returns 201 with new user when all required fields provided');
  it.todo('returns 400 when required fields are missing');
  it.todo('returns 409 when email already exists');
  it.todo('returns 403 when authenticated as non-admin');
});

describe('PUT /api/users/:id', () => {
  it.todo('returns 200 with updated user on valid payload');
  it.todo('returns 404 when user does not exist');
  it.todo('returns 400 on invalid fields');
  it.todo('returns 403 when authenticated as non-admin');
});

describe('PATCH /api/users/:id/deactivate', () => {
  it.todo('returns 200 and soft-deletes the user');
  it.todo('returns 404 when user does not exist');
  it.todo('returns 403 when authenticated as non-admin');
});
