'use strict';

import request from 'supertest';
import express from 'express';

// Mock the repository and db so POST tests don't need a real DB connection
jest.mock('../repositories/workEntryRepository');
// Mock db/knex so POST task-validation queries don't need a real DB.
// Note: jest.mock is hoisted. We use a stable builder that returns assigned task rows.
jest.mock('../db/knex', () => {
  const makeBuilder = () => ({
    join: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue([{ task_id: 7 }, { task_id: 1 }, { task_id: 2 }]),
  });
  const mockKnex: any = jest.fn(() => makeBuilder());
  return mockKnex;
});

import { getMonthlyEntries, getMonthlyAbsences, insertWorkEntry } from '../repositories/workEntryRepository';

import workEntriesRouter from './workEntries';

const mockGetMonthlyEntries = getMonthlyEntries as jest.MockedFunction<typeof getMonthlyEntries>;
const mockGetMonthlyAbsences = getMonthlyAbsences as jest.MockedFunction<typeof getMonthlyAbsences>;
const mockInsertWorkEntry = insertWorkEntry as jest.MockedFunction<typeof insertWorkEntry>;

// Builds an express app with a fake-auth middleware that reads req.user from headers.
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
  app.use('/api/work-entries', workEntriesRouter);
  return app;
}

const app = buildApp();

// App with stub auth — for POST tests (req.user.id = 42)
const authApp = express();
authApp.use(express.json());
authApp.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
  req.user = { id: 42, role: 'employee' };
  next();
});
authApp.use('/api/work-entries', workEntriesRouter);

describe('GET /api/work-entries', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when no authenticated user', async () => {
    const res = await request(app).get('/api/work-entries?month=2025-05');
    expect(res.status).toBe(401);
  });

  it('returns 400 when month param is missing', async () => {
    const res = await request(app).get('/api/work-entries').set('X-Test-User', '1');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'month query parameter is required' });
  });

  it('returns 400 when month is not in YYYY-MM format', async () => {
    const res = await request(app).get('/api/work-entries?month=05-2025').set('X-Test-User', '1');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'month must be in YYYY-MM format' });
  });

  it('returns 400 when month is a full date string', async () => {
    const res = await request(app).get('/api/work-entries?month=2025-05-01').set('X-Test-User', '1');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'month must be in YYYY-MM format' });
  });

  it('returns 200 with correct structure for a valid month (no data)', async () => {
    mockGetMonthlyEntries.mockResolvedValue([]);
    mockGetMonthlyAbsences.mockResolvedValue([]);

    const res = await request(app).get('/api/work-entries?month=2025-05').set('X-Test-User', '7');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('month', '2025-05');
    expect(res.body).toHaveProperty('userId', 7);
    expect(res.body).toHaveProperty('days');
    expect(Array.isArray(res.body.days)).toBe(true);
    expect(res.body.days).toHaveLength(31); // May has 31 days
  });

  it('returns correct day shape in days array', async () => {
    mockGetMonthlyEntries.mockResolvedValue([]);
    mockGetMonthlyAbsences.mockResolvedValue([]);

    const res = await request(app).get('/api/work-entries?month=2025-05').set('X-Test-User', '1');

    const day = res.body.days[0];
    expect(day).toHaveProperty('date', '2025-05-01');
    expect(day).toHaveProperty('status');
    expect(day).toHaveProperty('totalHours');
    expect(day).toHaveProperty('entries');
    expect(day).toHaveProperty('absence');
    expect(Array.isArray(day.entries)).toBe(true);
    expect(day.absence).toBeNull();
  });

  it('uses the authenticated user id when userId param is omitted', async () => {
    mockGetMonthlyEntries.mockResolvedValue([]);
    mockGetMonthlyAbsences.mockResolvedValue([]);

    const res = await request(app).get('/api/work-entries?month=2025-05').set('X-Test-User', '42');

    expect(mockGetMonthlyEntries).toHaveBeenCalledWith(42, '2025-05');
    expect(mockGetMonthlyAbsences).toHaveBeenCalledWith(42, '2025-05');
    expect(res.body.userId).toBe(42);
  });

  it('uses the authenticated user id when userId param is "me"', async () => {
    mockGetMonthlyEntries.mockResolvedValue([]);
    mockGetMonthlyAbsences.mockResolvedValue([]);

    const res = await request(app).get('/api/work-entries?month=2025-05&userId=me').set('X-Test-User', '42');

    expect(mockGetMonthlyEntries).toHaveBeenCalledWith(42, '2025-05');
    expect(res.body.userId).toBe(42);
  });

  it("returns 403 when an employee requests another user's data via userId param", async () => {
    mockGetMonthlyEntries.mockResolvedValue([]);
    mockGetMonthlyAbsences.mockResolvedValue([]);

    const res = await request(app).get('/api/work-entries?month=2025-05&userId=99').set('X-Test-User', '1');

    expect(res.status).toBe(403);
    expect(mockGetMonthlyEntries).not.toHaveBeenCalled();
  });

  it('isolates data: user A and user B receive only their own entries', async () => {
    // Repository returns different rows depending on which userId is queried — verifies the
    // route never bleeds another user's data into the response.
    mockGetMonthlyEntries.mockImplementation(async (uid) =>
      uid === 1
        ? [{ date: '2025-05-05', start_time: '09:00:00', end_time: '18:00:00' }]
        : []
    );
    mockGetMonthlyAbsences.mockResolvedValue([]);

    const resA = await request(app).get('/api/work-entries?month=2025-05').set('X-Test-User', '1');
    const resB = await request(app).get('/api/work-entries?month=2025-05').set('X-Test-User', '2');

    const dayA = resA.body.days.find((d: any) => d.date === '2025-05-05');
    const dayB = resB.body.days.find((d: any) => d.date === '2025-05-05');
    expect(dayA.entries.length).toBe(1);
    expect(dayB.entries.length).toBe(0);
    expect(resA.body.userId).toBe(1);
    expect(resB.body.userId).toBe(2);
  });

  it("allows an admin to query another user's data via userId param", async () => {
    mockGetMonthlyEntries.mockResolvedValue([]);
    mockGetMonthlyAbsences.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/work-entries?month=2025-05&userId=99')
      .set('X-Test-User', '1')
      .set('X-Test-Role', 'admin');

    expect(res.status).toBe(200);
    expect(mockGetMonthlyEntries).toHaveBeenCalledWith(99, '2025-05');
    expect(res.body.userId).toBe(99);
  });

  it('assigns correct status to days with entries', async () => {
    // 2025-05-05 is a Monday
    mockGetMonthlyEntries.mockResolvedValue([
      {
        date: '2025-05-05',
        start_time: '09:00:00',
        end_time: '18:00:00', // 9h → full
      },
    ]);
    mockGetMonthlyAbsences.mockResolvedValue([]);

    const res = await request(app).get('/api/work-entries?month=2025-05').set('X-Test-User', '1');

    const day5 = res.body.days.find((d: any) => d.date === '2025-05-05');
    expect(day5.status).toBe('full');
    expect(day5.totalHours).toBe(9);
    expect(day5.entries).toHaveLength(1);
  });

  it('marks weekends correctly', async () => {
    mockGetMonthlyEntries.mockResolvedValue([]);
    mockGetMonthlyAbsences.mockResolvedValue([]);

    const res = await request(app).get('/api/work-entries?month=2025-05').set('X-Test-User', '1');

    // 2025-05-02 is Friday, 2025-05-03 is Saturday
    const friday = res.body.days.find((d: any) => d.date === '2025-05-02');
    const saturday = res.body.days.find((d: any) => d.date === '2025-05-03');
    expect(friday.status).toBe('weekend');
    expect(saturday.status).toBe('weekend');
  });

  it('returns 500 when repository throws', async () => {
    mockGetMonthlyEntries.mockRejectedValue(new Error('DB exploded'));

    const res = await request(app).get('/api/work-entries?month=2025-05').set('X-Test-User', '1');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Internal server error' });
  });
});

describe('POST /api/work-entries', () => {
  const validEntry = { start_time: '09:00', end_time: '18:00', task_id: 7, location: 'משרד' };
  const validBody = { date: '2025-05-13', entries: [validEntry] };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 201 with created entries on valid payload', async () => {
    const created = { id: 1, user_id: 42, task_id: 7, date: '2025-05-13', start_time: '09:00:00', end_time: '18:00:00', location: 'משרד' };
    mockInsertWorkEntry.mockResolvedValue(created);

    const res = await request(authApp).post('/api/work-entries').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body).toEqual([created]);
    expect(mockInsertWorkEntry).toHaveBeenCalledTimes(1);
    expect(mockInsertWorkEntry).toHaveBeenCalledWith(42, { date: '2025-05-13', ...validEntry });
  });

  it('returns 201 and calls insertWorkEntry once per entry row when multiple rows are sent', async () => {
    mockInsertWorkEntry.mockResolvedValue({});
    const body = {
      date: '2025-05-13',
      entries: [
        { start_time: '09:00', end_time: '13:00', task_id: 1, location: 'משרד' },
        { start_time: '14:00', end_time: '18:00', task_id: 2, location: 'בית' },
      ],
    };

    const res = await request(authApp).post('/api/work-entries').send(body);

    expect(res.status).toBe(201);
    expect(mockInsertWorkEntry).toHaveBeenCalledTimes(2);
  });

  it('returns 400 when date is missing', async () => {
    const res = await request(authApp).post('/api/work-entries').send({ entries: [validEntry] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/date/);
  });

  it('returns 400 when date is not in YYYY-MM-DD format', async () => {
    const res = await request(authApp).post('/api/work-entries').send({ date: '13-05-2025', entries: [validEntry] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/date/);
  });

  it('returns 400 when entries is missing', async () => {
    const res = await request(authApp).post('/api/work-entries').send({ date: '2025-05-13' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/entries/);
  });

  it('returns 400 when entries is an empty array', async () => {
    const res = await request(authApp).post('/api/work-entries').send({ date: '2025-05-13', entries: [] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/entries/);
  });

  it('returns 400 when start_time is missing from an entry', async () => {
    const res = await request(authApp).post('/api/work-entries').send({
      date: '2025-05-13',
      entries: [{ end_time: '18:00', task_id: 7, location: 'משרד' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/start_time/);
  });

  it('returns 400 when end_time is missing from an entry', async () => {
    const res = await request(authApp).post('/api/work-entries').send({
      date: '2025-05-13',
      entries: [{ start_time: '09:00', task_id: 7, location: 'משרד' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/end_time/);
  });

  it('returns 400 when end_time is not after start_time', async () => {
    const res = await request(authApp).post('/api/work-entries').send({
      date: '2025-05-13',
      entries: [{ start_time: '18:00', end_time: '09:00', task_id: 7, location: 'משרד' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/end_time/);
  });

  it('returns 400 when start_time equals end_time', async () => {
    const res = await request(authApp).post('/api/work-entries').send({
      date: '2025-05-13',
      entries: [{ start_time: '09:00', end_time: '09:00', task_id: 7, location: 'משרד' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/end_time/);
  });

  it('returns 500 when insertWorkEntry throws', async () => {
    mockInsertWorkEntry.mockRejectedValue(new Error('DB exploded'));

    const res = await request(authApp).post('/api/work-entries').send(validBody);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Internal server error' });
  });
});
