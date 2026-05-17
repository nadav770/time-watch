'use strict';

import request from 'supertest';
import express from 'express';
import adminRouter from './admin';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('Admin — user-task assignments', () => {
  it.todo('POST /api/admin/assignments returns 201 when assigning a user to a task');
  it.todo('POST /api/admin/assignments returns 400 when user_id or task_id is missing');
  it.todo('POST /api/admin/assignments returns 409 when assignment already exists');
  it.todo('DELETE /api/admin/assignments/:id returns 200 on successful removal');
  it.todo('DELETE /api/admin/assignments/:id returns 404 when assignment does not exist');
});

describe('Admin — audit log', () => {
  it.todo('GET /api/admin/audit-log returns 200 with list of audit entries');
  it.todo('GET /api/admin/audit-log filters by userId query param');
  it.todo('returns 403 when authenticated as non-admin');
});
