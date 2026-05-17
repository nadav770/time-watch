'use strict';

import request from 'supertest';
import express from 'express';
import monthsRouter from './months';

const app = express();
app.use(express.json());
app.use('/api/months', monthsRouter);

describe('GET /api/months', () => {
  it.todo('returns 200 with list of locked months');
  it.todo('returns 401 when not authenticated');
});

describe('POST /api/months (lock a month)', () => {
  it.todo('returns 201 with lock record when month and year are provided');
  it.todo('returns 400 when month/year are missing');
  it.todo('returns 409 when month is already locked');
  it.todo('returns 403 when authenticated as non-admin');
});

describe('DELETE /api/months/:id (unlock a month)', () => {
  it.todo('returns 200 after unlocking the month');
  it.todo('returns 404 when lock record does not exist');
  it.todo('returns 403 when authenticated as non-admin');
});
