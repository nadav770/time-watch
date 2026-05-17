'use strict';

import request from 'supertest';
import express from 'express';
import projectsRouter from './projects';

const app = express();
app.use(express.json());
app.use('/api/projects', projectsRouter);

describe('GET /api/projects', () => {
  it.todo('returns 200 with list of active projects');
  it.todo('filters by clientId query param when provided');
  it.todo('returns 401 when not authenticated');
});

describe('POST /api/projects', () => {
  it.todo('returns 201 with new project when name and client_id are provided');
  it.todo('returns 400 when required fields are missing');
  it.todo('returns 403 when authenticated as non-admin');
});

describe('PUT /api/projects/:id', () => {
  it.todo('returns 200 with updated project on valid payload');
  it.todo('returns 404 when project does not exist');
  it.todo('returns 403 when authenticated as non-admin');
});
