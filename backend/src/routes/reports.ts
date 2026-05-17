'use strict'

import { Router, Request, Response } from 'express';
import db from '../db/knex';

const router = Router();

// POST /api/reports         — create work entries for a day (batch from DailyReportPage)
// GET  /api/reports?date=Y-M-D — list the authenticated user's entries for a day
// PUT  /api/reports/:id     — update a single entry

// Map the Hebrew labels shown in the form to the enum used by the DB.
const LOCATION_MAP: Record<string, string> = {
  'משרד': 'office',
  'לקוח': 'client_site',
  'בית': 'home',
  office: 'office',
  client_site: 'client_site',
  home: 'home',
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

function isValidDate(s: unknown): boolean {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function toMinutes(t: unknown): number | null {
  if (typeof t !== 'string' || !TIME_RE.test(t)) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function durationHours(start: unknown, end: unknown): number | null {
  const s = toMinutes(start)
  const e = toMinutes(end)
  if (s == null || e == null) return null
  return (e - s) / 60
}

function dateToIso(d: unknown): string | null {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  if (d instanceof Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return String(d)
}

// Resolve a task id from the form values; tries (project + task) name first, then task-name-only lookup.
async function findTaskId(taskName: unknown, projectName: unknown, conn: any = db): Promise<number | null> {
  if (!taskName) return null
  const lowerTask = String(taskName).toLowerCase()
  if (projectName) {
    const row = await conn('tasks')
      .join('projects', 'projects.id', 'tasks.project_id')
      .whereRaw('LOWER(tasks.name) = ?', [lowerTask])
      .andWhereRaw('LOWER(projects.name) = ?', [String(projectName).toLowerCase()])
      .whereNull('tasks.deleted_at')
      .whereNull('projects.deleted_at')
      .select('tasks.id')
      .first()
    if (row) return row.id
  }
  const row = await conn('tasks')
    .whereRaw('LOWER(name) = ?', [lowerTask])
    .whereNull('deleted_at')
    .first()
  return row ? row.id : null
}

async function isMonthLocked(isoDate: string, conn: any = db): Promise<boolean> {
  const [y, m] = isoDate.split('-').map(Number)
  const row = await conn('month_locks').where({ year: y, month: m }).first()
  return Boolean(row)
}

// POST /api/reports — accepts the daily-report form batch payload
router.post('/', async (req: Request, res: Response) => {
  try {
    const { date, entries } = req.body || {}

    if (!date || !isValidDate(date)) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' })
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries must be a non-empty array' })
    }

    if (await isMonthLocked(date)) {
      return res.status(423).json({ error: 'This month is locked and cannot be modified' })
    }

    const userId = req.user && req.user.id
    if (!userId) return res.status(401).json({ error: 'Authentication required' })

    // Validate + normalize each entry against the DB schema before any inserts
    const normalized: any[] = []
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i] || {}
      const idx = `entries[${i}]`

      if (!e.startTime || !e.endTime) {
        return res.status(400).json({ error: `${idx}: startTime and endTime are required` })
      }
      const dur = durationHours(e.startTime, e.endTime)
      if (dur == null) {
        return res.status(400).json({ error: `${idx}: invalid time format` })
      }
      if (dur <= 0) {
        return res.status(400).json({ error: `${idx}: endTime must be greater than startTime` })
      }

      const location = LOCATION_MAP[e.location]
      if (!location) {
        return res.status(400).json({ error: `${idx}: invalid location` })
      }

      if (!e.task) {
        return res.status(400).json({ error: `${idx}: task is required` })
      }
      const taskId = await findTaskId(e.task, e.project)
      if (!taskId) {
        return res.status(400).json({
          error: `${idx}: task "${e.task}" not found. Seed the tasks table or send a known task name.`,
        })
      }

      normalized.push({
        user_id: userId,
        task_id: taskId,
        date,
        location,
        start_time: e.startTime,
        end_time: e.endTime,
        duration_hours: dur,
        description: e.notes ? String(e.notes) : null,
      })
    }

    // Cap the day at 24h across existing + new entries
    const existingRows = await db('work_entries')
      .where({ user_id: userId, date })
      .whereNull('deleted_at')
      .select('duration_hours')
    const existingTotal = existingRows.reduce((s: number, r: any) => s + Number(r.duration_hours), 0)
    const newTotal = normalized.reduce((s, r) => s + r.duration_hours, 0)
    if (existingTotal + newTotal > 24) {
      return res.status(400).json({
        error: `Day total would exceed 24 hours (existing ${existingTotal}h + new ${newTotal}h)`,
      })
    }

    const inserted = await db.transaction(async (trx: any) => {
      const out: any[] = []
      for (const row of normalized) {
        const [r] = await trx('work_entries').insert(row).returning('*')
        out.push({ ...r, date: dateToIso(r.date) })
      }
      return out
    })

    res.status(201).json({ count: inserted.length, entries: inserted })
  } catch (err) {
    console.error('[reports POST]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/reports?date=YYYY-MM-DD — list the user's entries for the day
router.get('/', async (req: Request, res: Response) => {
  try {
    const { date } = req.query
    if (!date || !isValidDate(date)) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' })
    }
    const userId = req.user && req.user.id
    if (!userId) return res.status(401).json({ error: 'Authentication required' })

    const rows = await db('work_entries')
      .where({ user_id: userId, date })
      .whereNull('deleted_at')
      .orderBy('start_time', 'asc')

    res.json(rows.map((r: any) => ({ ...r, date: dateToIso(r.date) })))
  } catch (err) {
    console.error('[reports GET]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/reports/:id — update a single entry
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'invalid id' })
    }

    const existing = await db('work_entries').where({ id }).whereNull('deleted_at').first()
    if (!existing) return res.status(404).json({ error: 'Work entry not found' })

    const userId = req.user && req.user.id
    if (existing.user_id !== userId && (!req.user || req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    if (await isMonthLocked(dateToIso(existing.date) as string)) {
      return res.status(423).json({ error: 'This month is locked and cannot be modified' })
    }

    const body = req.body || {}
    const patch: Record<string, unknown> = {}

    if (body.startTime != null) patch.start_time = body.startTime
    if (body.endTime != null) patch.end_time = body.endTime
    if (body.notes !== undefined) patch.description = body.notes ? String(body.notes) : null

    if (body.location != null) {
      const loc = LOCATION_MAP[body.location]
      if (!loc) return res.status(400).json({ error: 'invalid location' })
      patch.location = loc
    }

    if (body.task != null) {
      const tid = await findTaskId(body.task, body.project)
      if (!tid) return res.status(400).json({ error: `task "${body.task}" not found` })
      patch.task_id = tid
    }

    const start = ((patch.start_time || existing.start_time || '') as string).slice(0, 5)
    const end = ((patch.end_time || existing.end_time || '') as string).slice(0, 5)
    const dur = durationHours(start, end)
    if (dur == null || dur <= 0) {
      return res.status(400).json({ error: 'endTime must be greater than startTime' })
    }
    patch.duration_hours = dur
    patch.updated_at = db.fn.now()

    const [updated] = await db('work_entries').where({ id }).update(patch).returning('*')
    res.json({ ...updated, date: dateToIso(updated.date) })
  } catch (err) {
    console.error('[reports PUT]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router;
