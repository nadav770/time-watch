'use strict';

import request from 'supertest';
import express from 'express';
import reportsRouter from './reports';

const app = express();
app.use(express.json());
app.use('/api/reports', reportsRouter);

describe('GET /api/reports', () => {
  it.todo('returns 200 with list of work entries for the authenticated user');
  it.todo('returns 401 when not authenticated');
});

describe('POST /api/reports', () => {
  it.todo('returns 201 with created work entry on valid payload');
  it.todo('returns 400 when required fields are missing');
  it.todo('returns 400 when end_time is before start_time');
  it.todo('returns 423 when the month is locked');
});

describe("PUT /api/reports/:id", () => {
  it.todo('returns 200 with updated work entry on valid payload');
  it.todo('returns 404 when entry does not exist');
  it.todo("returns 403 when trying to edit another user's entry without admin role");
  it.todo('returns 423 when the month is locked');
});
