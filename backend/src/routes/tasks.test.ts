'use strict';

process.env.JWT_SECRET = 'test-secret-used-only-in-jest-at-least-32-chars!!';

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

jest.mock('../db/knex', () => jest.fn());

import db from '../db/knex';
import { authenticate } from '../middleware/auth';
import errorHandler from '../middleware/errorHandler';
import tasksRouter from './tasks';

const mockDb = db as jest.MockedFunction<any>;

function tokenFor(user: Record<string, any>): string {
  return jwt.sign(user, process.env.JWT_SECRET as string, { expiresIn: '1h' });
}

function queryResult(rows: any[]): any {
  const builder = {
    join: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    then: (resolve: (value: any) => any) => Promise.resolve(rows).then(resolve),
  };
  return builder;
}

function createTestApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', authenticate, tasksRouter);
  app.use(errorHandler);
  return app;
}

describe('GET /api/tasks/mine', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  it('authenticated employee gets their open assigned tasks', async () => {
    const rows = [
      {
        task_id: 7,
        task_name: 'בדיקות',
        project_id: 3,
        project_name: 'מערכת שעות',
        client_id: 2,
        client_name: 'לקוח א',
      },
    ];
    const builder = queryResult(rows);
    mockDb.mockReturnValue(builder);

    const res = await request(app)
      .get('/api/tasks/mine')
      .set('Authorization', `Bearer ${tokenFor({ sub: 42, role: 'employee' })}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(mockDb).toHaveBeenCalledWith('user_tasks');
    expect(builder.join).toHaveBeenCalledWith('tasks', 'user_tasks.task_id', 'tasks.id');
    expect(builder.join).toHaveBeenCalledWith('projects', 'tasks.project_id', 'projects.id');
    expect(builder.join).toHaveBeenCalledWith('clients', 'projects.client_id', 'clients.id');
    expect(builder.where).toHaveBeenCalledWith('user_tasks.user_id', 42);
    expect(builder.where).toHaveBeenCalledWith('tasks.status', 'open');
    expect(builder.whereNull).toHaveBeenCalledWith('user_tasks.deleted_at');
    expect(builder.whereNull).toHaveBeenCalledWith('tasks.deleted_at');
  });

  it('unauthenticated request gets 401', async () => {
    const res = await request(app).get('/api/tasks/mine');

    expect(res.status).toBe(401);
    expect(mockDb).not.toHaveBeenCalled();
  });
});

describe('GET /api/tasks', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  it('employee cannot access the admin task list', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${tokenFor({ sub: 42, role: 'employee' })}`);

    expect(res.status).toBe(403);
    expect(mockDb).not.toHaveBeenCalled();
  });
});

describe('POST /api/tasks', () => {
  it.todo('returns 201 with new task when name and project_id are provided');
  it.todo('returns 400 when required fields are missing');
  it.todo('returns 403 when authenticated as non-admin');
});

describe('PUT /api/tasks/:id', () => {
  it.todo('returns 200 with updated task on valid payload');
  it.todo('returns 404 when task does not exist');
  it.todo('returns 403 when authenticated as non-admin');
});
