import knex from '../db/knex';

// Find the active timer row for a given user; returns the row or undefined if none exists.
async function findActiveTimer(userId: number): Promise<any | undefined> {
  const row = await knex('timer_state').where({ user_id: userId }).limit(1).first()
  return row
}

// Create a new timer row for a user with current server timestamp and date.
async function createTimer(userId: number): Promise<any> {
  const [row] = await knex('timer_state')
    .insert({
      user_id: userId,
      start_time: knex.raw('NOW()'),
      date: knex.raw('CURRENT_DATE'),
    })
    .returning('*')
  return row
}

// Delete the timer row for a given user.
async function deleteTimer(userId: number): Promise<void> {
  await knex('timer_state').where({ user_id: userId }).delete()
}

export { findActiveTimer, createTimer, deleteTimer }
