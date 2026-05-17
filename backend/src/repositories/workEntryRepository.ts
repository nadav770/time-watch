import knex from '../db/knex';

interface InsertWorkEntryInput {
  date: string;
  start_time: string;
  end_time: string;
  location?: string | null;
  task_id?: number | null;
  description?: string | null;
}

// Fetch all work entries for a given user within a calendar month, joined with task/project/client names.
async function getMonthlyEntries(userId: number, month: string): Promise<any[]> {
  // Derive first and last day of the month from the "YYYY-MM" string
  const [year, mon] = month.split('-').map(Number)
  const firstDay = new Date(Date.UTC(year, mon - 1, 1))
  const lastDay = new Date(Date.UTC(year, mon, 0))

  const firstStr = firstDay.toISOString().slice(0, 10)
  const lastStr = lastDay.toISOString().slice(0, 10)

  const rows = await knex('work_entries')
    .leftJoin('tasks',    'work_entries.task_id',    'tasks.id')
    .leftJoin('projects', 'tasks.project_id',        'projects.id')
    .leftJoin('clients',  'projects.client_id',      'clients.id')
    .where('work_entries.user_id', userId)
    .andWhere('work_entries.date', '>=', firstStr)
    .andWhere('work_entries.date', '<=', lastStr)
    .whereNull('work_entries.deleted_at')
    .select(
      'work_entries.*',
      'tasks.name as task_name',
      'projects.name as project_name',
      'clients.name as client_name'
    )
    .orderBy('work_entries.date', 'asc')
    .orderBy('work_entries.start_time', 'asc')

  return rows
}

// Fetch all absences for a given user within a calendar month.
async function getMonthlyAbsences(userId: number, month: string): Promise<any[]> {
  const [year, mon] = month.split('-').map(Number)
  const firstDay = new Date(Date.UTC(year, mon - 1, 1))
  const lastDay = new Date(Date.UTC(year, mon, 0))

  const firstStr = firstDay.toISOString().slice(0, 10)
  const lastStr = lastDay.toISOString().slice(0, 10)

  const rows = await knex('absences')
    .where('user_id', userId)
    .andWhere('start_date', '>=', firstStr)
    .andWhere('start_date', '<=', lastStr)
    .whereNull('deleted_at')
    .orderBy('start_date', 'asc')

  return rows
}

// Insert a single work entry row and return the created record
async function insertWorkEntry(userId: number, { date, start_time, end_time, location, task_id, description }: InsertWorkEntryInput): Promise<any> {
  const [sh, sm] = start_time.split(':').map(Number)
  const [eh, em] = end_time.split(':').map(Number)
  const duration_hours = parseFloat(((eh + em / 60) - (sh + sm / 60)).toFixed(2))

  const [row] = await knex('work_entries').insert({
    user_id: userId,
    task_id: task_id ?? null,
    date,
    location: location ?? null,
    start_time,
    end_time,
    duration_hours,
    description: description ?? null,
  }).returning('*')
  return row
}

export { getMonthlyEntries, getMonthlyAbsences, insertWorkEntry }
