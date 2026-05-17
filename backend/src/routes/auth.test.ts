'use strict';

import request from 'supertest';
import express from 'express';
import authRouter from './auth';

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('POST /api/auth/login', () => {
  it.todo('returns 200 and sets cookie on valid credentials');
  it.todo('returns 401 on wrong password');
  it.todo('returns 400 when email or password is missing');
  it.todo('returns 401 when user does not exist');
});

describe('POST /api/auth/logout', () => {
  it.todo('returns 200 and clears the auth cookie');
});

describe('GET /api/auth/me', () => {
  it.todo('returns 200 with current user when authenticated');
  it.todo('returns 401 when no auth cookie is present');
});
