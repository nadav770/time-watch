'use strict';

import request from 'supertest';
import express from 'express';

jest.mock('../repositories/timerRepository');
import { findActiveTimer, createTimer, deleteTimer } from '../repositories/timerRepository';

jest.mock('../db/knex', () => {
  const mockReturning = jest.fn();
  const mockInsert = jest.fn(() => ({ returning: mockReturning }));
  const mockKnex: any = jest.fn(() => ({ insert: mockInsert }));
  mockKnex.__mockReturning = mockReturning;
  mockKnex.__mockInsert = mockInsert;
  return mockKnex;
});
import db from '../db/knex';
const knex = db as any;

import timerRouter from './timer';

const mockFindActiveTimer = findActiveTimer as jest.MockedFunction<typeof findActiveTimer>;
const mockCreateTimer = createTimer as jest.MockedFunction<typeof createTimer>;
const mockDeleteTimer = deleteTimer as jest.MockedFunction<typeof deleteTimer>;

// Builds an express app with a fake-auth middleware that injects req.user from the X-Test-User header.
// Lets each test request authenticate as any user without needing real JWTs.
function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const userId = Number(req.headers['x-test-user']);
    const role = (req.headers['x-test-role'] as string) || 'employee';
    if (Number.isInteger(userId) && userId > 0) {
      req.user = { id: userId, role };
    }
    next();
  });
  app.use('/api/timer', timerRouter);
  return app;
}

const app = buildApp();

describe('GET /api/timer/status', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns 401 when no authenticated user', async () => {
    const res = await request(app).get('/api/timer/status');
    expect(res.status).toBe(401);
  });

  it('returns 200 with { timer: <row> } when an active timer exists for the authenticated user', async () => {
    const fakeTimer = {
      id: 42,
      user_id: 7,
      start_time: '2026-05-10T08:00:00.000Z',
      date: '2026-05-10',
      created_at: '2026-05-10T08:00:00.000Z',
    };
    mockFindActiveTimer.mockResolvedValue(fakeTimer);

    const res = await request(app).get('/api/timer/status').set('X-Test-User', '7');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ timer: fakeTimer });
    expect(mockFindActiveTimer).toHaveBeenCalledWith(7);
  });

  it('returns 200 with { timer: null } when no active timer exists', async () => {
    mockFindActiveTimer.mockResolvedValue(undefined);

    const res = await request(app).get('/api/timer/status').set('X-Test-User', '7');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ timer: null });
    expect(mockFindActiveTimer).toHaveBeenCalledWith(7);
  });

  it('scopes the timer lookup to the authenticated user — user B never sees user A timer', async () => {
    // findActiveTimer is mocked: it would only be called with the authenticated user's id.
    mockFindActiveTimer.mockImplementation(async (uid) =>
      uid === 1 ? { id: 1, user_id: 1, start_time: '2026-05-10T08:00:00.000Z', date: '2026-05-10' } : undefined
    );

    const resA = await request(app).get('/api/timer/status').set('X-Test-User', '1');
    const resB = await request(app).get('/api/timer/status').set('X-Test-User', '2');

    expect(resA.body.timer).not.toBeNull();
    expect(resA.body.timer.user_id).toBe(1);
    expect(resB.body.timer).toBeNull();
    expect(mockFindActiveTimer).toHaveBeenCalledWith(1);
    expect(mockFindActiveTimer).toHaveBeenCalledWith(2);
  });

  it('returns 500 when the repository throws', async () => {
    mockFindActiveTimer.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app).get('/api/timer/status').set('X-Test-User', '1');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Internal server error' });
  });
});

describe('POST /api/timer/start', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns 401 when no authenticated user', async () => {
    const res = await request(app).post('/api/timer/start');
    expect(res.status).toBe(401);
  });

  it('returns 201 and starts the timer for the authenticated user only', async () => {
    const newTimer = {
      id: 7,
      user_id: 5,
      start_time: '2026-05-10T09:00:00.000Z',
      date: '2026-05-10',
      created_at: '2026-05-10T09:00:00.000Z',
    };
    mockFindActiveTimer.mockResolvedValue(undefined);
    mockCreateTimer.mockResolvedValue(newTimer);

    const res = await request(app).post('/api/timer/start').set('X-Test-User', '5');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ timer: newTimer });
    expect(mockFindActiveTimer).toHaveBeenCalledWith(5);
    expect(mockCreateTimer).toHaveBeenCalledWith(5);
  });

  it('returns 409 and does not call createTimer when a timer is already active for that user', async () => {
    mockFindActiveTimer.mockResolvedValue({
      id: 3,
      user_id: 5,
      start_time: '2026-05-10T08:00:00.000Z',
      date: '2026-05-10',
    });

    const res = await request(app).post('/api/timer/start').set('X-Test-User', '5');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: 'Timer already active' });
    expect(mockCreateTimer).not.toHaveBeenCalled();
  });

  it('user B can start a timer even if user A has one running — isolation by user_id', async () => {
    mockFindActiveTimer.mockImplementation(async (uid) =>
      uid === 1 ? { id: 1, user_id: 1, start_time: '2026-05-10T08:00:00.000Z', date: '2026-05-10' } : undefined
    );
    const newTimer = { id: 9, user_id: 2, start_time: '2026-05-10T10:00:00.000Z', date: '2026-05-10' };
    mockCreateTimer.mockResolvedValue(newTimer);

    const res = await request(app).post('/api/timer/start').set('X-Test-User', '2');

    expect(res.status).toBe(201);
    expect(res.body.timer.user_id).toBe(2);
    expect(mockCreateTimer).toHaveBeenCalledWith(2);
  });

  it('returns 500 when findActiveTimer throws', async () => {
    mockFindActiveTimer.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app).post('/api/timer/start').set('X-Test-User', '1');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Internal server error' });
  });
});

describe('POST /api/timer/stop', () => {
  beforeEach(() => {
    // Restore the knex chain after jest.resetAllMocks() clears it.
    knex.__mockInsert.mockReturnValue({ returning: knex.__mockReturning });
    knex.mockReturnValue({ insert: knex.__mockInsert });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns 401 when no authenticated user', async () => {
    const res = await request(app)
      .post('/api/timer/stop')
      .send({ location: 'משרד' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when no active timer exists for the authenticated user', async () => {
    mockFindActiveTimer.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/timer/stop')
      .set('X-Test-User', '3')
      .send({ task_id: 5, location: 'משרד' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'No active timer' });
    expect(mockFindActiveTimer).toHaveBeenCalledWith(3);
  });

  it('returns 200 with { start_time, date } from the authenticated user timer', async () => {
    const fakeTimer = {
      id: 42,
      user_id: 8,
      start_time: '2026-05-10T08:00:00.000Z',
      date: '2026-05-10',
      created_at: '2026-05-10T08:00:00.000Z',
    };

    mockFindActiveTimer.mockResolvedValue(fakeTimer);
    mockDeleteTimer.mockResolvedValue();

    const res = await request(app)
      .post('/api/timer/stop')
      .set('X-Test-User', '8')
      .send({ task_id: 5, location: 'משרד', description: 'worked hard' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ start_time: fakeTimer.start_time, date: fakeTimer.date });
    expect(mockDeleteTimer).toHaveBeenCalledWith(8);
  });

  it('returns 500 when findActiveTimer throws', async () => {
    mockFindActiveTimer.mockRejectedValue(new Error('DB exploded'));

    const res = await request(app)
      .post('/api/timer/stop')
      .set('X-Test-User', '1')
      .send({ task_id: 5, location: 'משרד' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Internal server error' });
  });
});
