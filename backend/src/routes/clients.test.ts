'use strict';

import request from 'supertest';
import express from 'express';
import clientsRouter from './clients';

const app = express();
app.use(express.json());
app.use('/api/clients', clientsRouter);

describe('GET /api/clients', () => {
  it.todo('returns 200 with list of active clients');
  it.todo('returns 401 when not authenticated');
});

describe('POST /api/clients', () => {
  it.todo('returns 201 with new client when name is provided');
  it.todo('returns 400 when name is missing');
  it.todo('returns 403 when authenticated as non-admin');
});

describe('PUT /api/clients/:id', () => {
  it.todo('returns 200 with updated client on valid payload');
  it.todo('returns 404 when client does not exist');
  it.todo('returns 403 when authenticated as non-admin');
});
