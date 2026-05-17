'use strict'

import cron from 'node-cron';
import { Knex } from 'knex';
import defaultKnex from '../db/knex';

// Finds stale timers (date < today) and resets them to the start of the current day.
export async function runMidnightSplit(database?: any): Promise<void> {
  const db: any = database || defaultKnex

  const staleTimers = await db('timer_state')
    .where('date', '<', db.raw('CURRENT_DATE'))
    .select('*')

  for (const row of staleTimers) {
    await db('timer_state')
      .where({ user_id: row.user_id })
      .update({
        start_time: db.raw('CURRENT_DATE::timestamptz'),
        date: db.raw('CURRENT_DATE'),
      })
  }

  console.log(`[midnightSplit] split ${staleTimers.length} timer(s)`)
}

// Registers a node-cron job that fires at midnight every day and calls runMidnightSplit.
export function scheduleMidnightSplit(): void {
  cron.schedule('0 0 * * *', () => runMidnightSplit())
}
