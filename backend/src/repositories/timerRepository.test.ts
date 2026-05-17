'use strict';

// ---------------------------------------------------------------------------
// Mock knex before requiring the repository so the module cache picks up
// the mock.  We build a chainable builder because the repository uses:
//   knex('timer_state').where(...).limit(...).first()
//   knex('timer_state').insert(...).returning(...)
//   knex('timer_state').where(...).delete()
// ---------------------------------------------------------------------------

const mockFirst = jest.fn();
const mockLimit = jest.fn(() => ({ first: mockFirst }));
const mockDelete = jest.fn();
const mockWhere = jest.fn(() => ({ limit: mockLimit, delete: mockDelete }));
const mockReturning = jest.fn();
const mockInsert = jest.fn(() => ({ returning: mockReturning }));

// knex.raw just needs to return a placeholder value; it is used in the INSERT
// object so knex can embed raw SQL expressions — the mock doesn't need to
// evaluate them.
const mockRaw = jest.fn((sql: string) => `__raw:${sql}`);

// The default export of knex.js is the knex instance itself (a function).
// When called as knex('timer_state') it returns the query-builder chain.
const mockKnex: any = jest.fn(() => ({
  where: mockWhere,
  insert: mockInsert,
  limit: mockLimit,
  first: mockFirst,
}));
mockKnex.raw = mockRaw;

jest.mock('../db/knex', () => mockKnex);

// Now require the repository — it will receive the mocked knex.
import { findActiveTimer, createTimer, deleteTimer } from './timerRepository';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// findActiveTimer
// ---------------------------------------------------------------------------

describe('findActiveTimer', () => {
  test('returns the row when a timer exists for the user', async () => {
    const fakeRow = { id: 1, user_id: 42, start_time: new Date(), date: '2026-05-10' };
    mockFirst.mockResolvedValueOnce(fakeRow);

    const result = await findActiveTimer(42);

    expect(mockKnex).toHaveBeenCalledWith('timer_state');
    expect(mockWhere).toHaveBeenCalledWith({ user_id: 42 });
    expect(mockLimit).toHaveBeenCalledWith(1);
    expect(mockFirst).toHaveBeenCalled();
    expect(result).toEqual(fakeRow);
  });

  test('returns undefined when no timer exists for the user', async () => {
    mockFirst.mockResolvedValueOnce(undefined);

    const result = await findActiveTimer(99);

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// createTimer
// ---------------------------------------------------------------------------

describe('createTimer', () => {
  test('calls INSERT with NOW() and CURRENT_DATE and returns the inserted row', async () => {
    const fakeRow = { id: 7, user_id: 42, start_time: new Date(), date: '2026-05-10' };
    mockReturning.mockResolvedValueOnce([fakeRow]);

    const result = await createTimer(42);

    expect(mockKnex).toHaveBeenCalledWith('timer_state');
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 42,
      start_time: '__raw:NOW()',
      date: '__raw:CURRENT_DATE',
    });
    expect(mockReturning).toHaveBeenCalledWith('*');
    expect(result).toEqual(fakeRow);
  });
});

// ---------------------------------------------------------------------------
// deleteTimer
// ---------------------------------------------------------------------------

describe('deleteTimer', () => {
  test('calls DELETE for the correct userId', async () => {
    mockDelete.mockResolvedValueOnce(1);

    await deleteTimer(42);

    expect(mockKnex).toHaveBeenCalledWith('timer_state');
    expect(mockWhere).toHaveBeenCalledWith({ user_id: 42 });
    expect(mockDelete).toHaveBeenCalled();
  });
});
