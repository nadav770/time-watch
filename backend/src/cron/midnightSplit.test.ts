'use strict';

// ---------------------------------------------------------------------------
// We do NOT mock knex globally.  Instead we construct a minimal fake knex
// instance and pass it directly to runMidnightSplit(fakeKnex).
//
// The query chain exercised by the function is:
//
//   SELECT path:
//     db('timer_state').where('date', '<', db.raw('CURRENT_DATE')).select('*')
//
//   UPDATE path (one call per stale row):
//     db('timer_state').where({ user_id }).update({ start_time, date })
// ---------------------------------------------------------------------------

import { runMidnightSplit } from './midnightSplit';

// ---------------------------------------------------------------------------
// Fake knex factory
// ---------------------------------------------------------------------------

/**
 * Build a fake knex callable that returns a query-builder stub when called as
 * fakeKnex('timer_state'), exposes fakeKnex.raw(), and records every
 * .where().select() and .where().update() call so tests can assert on them.
 */
function buildFakeKnex(selectResult: any[]): { db: any; mocks: any } {
  const mocks = {
    select: jest.fn().mockResolvedValue(selectResult),
    update: jest.fn().mockResolvedValue(1),
    // Each .where() call returns an object with both select and update so the
    // same builder stub handles both code paths.
    where: jest.fn(),
  };

  // .where() always returns an object exposing both terminal methods.
  mocks.where.mockReturnValue({
    select: mocks.select,
    update: mocks.update,
  });

  // The knex instance is itself a function (knex('table') → builder).
  const db: any = jest.fn().mockReturnValue({
    where: mocks.where,
  });

  // knex.raw() just returns a tagged placeholder — the function treats the
  // return value opaquely and passes it into .update() / .where().
  db.raw = jest.fn((sql: string) => `__raw:${sql}`);

  return { db, mocks };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runMidnightSplit', () => {
  test('no stale timers — UPDATE is never called and logs "split 0 timer(s)"', async () => {
    const { db, mocks } = buildFakeKnex([]);

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runMidnightSplit(db);

    // SELECT was issued
    expect(mocks.where).toHaveBeenCalledWith('date', '<', '__raw:CURRENT_DATE');
    expect(mocks.select).toHaveBeenCalledWith('*');

    // UPDATE must NOT have been called
    expect(mocks.update).not.toHaveBeenCalled();

    // Correct log message
    expect(consoleSpy).toHaveBeenCalledWith('[midnightSplit] split 0 timer(s)');

    consoleSpy.mockRestore();
  });

  test('one stale timer — UPDATE is called once with correct fields and logs "split 1 timer(s)"', async () => {
    const staleRow = { id: 1, user_id: 7, start_time: new Date('2026-05-09T22:00:00Z'), date: '2026-05-09' };
    const { db, mocks } = buildFakeKnex([staleRow]);

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runMidnightSplit(db);

    // SELECT path
    expect(mocks.where).toHaveBeenCalledWith('date', '<', '__raw:CURRENT_DATE');
    expect(mocks.select).toHaveBeenCalledWith('*');

    // UPDATE path — called exactly once for user_id 7
    expect(mocks.where).toHaveBeenCalledWith({ user_id: 7 });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({
      start_time: '__raw:CURRENT_DATE::timestamptz',
      date: '__raw:CURRENT_DATE',
    });

    expect(consoleSpy).toHaveBeenCalledWith('[midnightSplit] split 1 timer(s)');

    consoleSpy.mockRestore();
  });

  test('multiple stale timers — UPDATE is called once per row', async () => {
    const staleRows = [
      { id: 1, user_id: 3, start_time: new Date('2026-05-09T20:00:00Z'), date: '2026-05-09' },
      { id: 2, user_id: 8, start_time: new Date('2026-05-09T21:30:00Z'), date: '2026-05-09' },
    ];
    const { db, mocks } = buildFakeKnex(staleRows);

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runMidnightSplit(db);

    // UPDATE must fire twice — once per stale row
    expect(mocks.update).toHaveBeenCalledTimes(2);

    // Verify each user_id was targeted
    expect(mocks.where).toHaveBeenCalledWith({ user_id: 3 });
    expect(mocks.where).toHaveBeenCalledWith({ user_id: 8 });

    expect(consoleSpy).toHaveBeenCalledWith('[midnightSplit] split 2 timer(s)');

    consoleSpy.mockRestore();
  });
});
