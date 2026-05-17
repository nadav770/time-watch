import multer from 'multer';
import { Router, Request, Response } from 'express';
import db from '../db/knex';

const router = Router();

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_FILE_SIZE = 20 * 1024 * 1024

const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(Object.assign(new Error('Invalid file type'), { code: 'INVALID_MIME_TYPE' }) as any)
    }
    cb(null, true)
  },
})

const VALID_TYPES = ['vacation', 'half_day_vac', 'sick', 'military_reserve']
const FUTURE_ALLOWED_TYPES = ['sick', 'military_reserve']

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const MAX_NOTES_LENGTH = 1000

// Returns true if value is a positive integer (route :id params).
function isPositiveInt(val: unknown): boolean {
  const n = Number(val)
  return Number.isInteger(n) && n > 0
}

// Returns a Date if str is a valid YYYY-MM-DD calendar date, otherwise null.
function parseDate(str: unknown): Date | null {
  if (!str || !DATE_RE.test(str as string)) return null
  const [y, m, d] = (str as string).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return date
}

function countWorkingDays(start: Date, end: Date): number {
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const day = cur.getDay()
    if (day !== 5 && day !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface AbsenceBodyInput {
  type?: string;
  start_date?: string;
  end_date?: string;
  is_partial?: boolean;
  partial_hours?: unknown;
  notes?: unknown;
}

interface ValidationOk { clippedEndStr: string }
interface ValidationErr { status: number; error: string }
type ValidationResult = ValidationOk | ValidationErr

// Validates the absence body and returns { error, status } or { clippedEndStr } on success.
async function validateAbsenceBody({ type, start_date, end_date, is_partial, partial_hours, notes }: AbsenceBodyInput): Promise<ValidationResult> {
  if (!VALID_TYPES.includes(type as string)) {
    return { status: 400, error: 'Invalid absence type' }
  }
  if (notes !== null && notes !== undefined) {
    if (typeof notes !== 'string') return { status: 400, error: 'notes must be a string' }
    if ((notes as string).length > MAX_NOTES_LENGTH) return { status: 400, error: `notes must not exceed ${MAX_NOTES_LENGTH} characters` }
  }
  if (!start_date || !end_date) {
    return { status: 400, error: 'start_date and end_date are required' }
  }
  const start = parseDate(start_date)
  const end = parseDate(end_date)
  if (!start || !end) {
    return { status: 400, error: 'start_date and end_date must be valid dates in YYYY-MM-DD format' }
  }
  if (end < start) {
    return { status: 400, error: 'end_date must be on or after start_date' }
  }
  if (countWorkingDays(start, end) === 0) {
    return { status: 400, error: 'Date range contains no working days (Friday and Saturday are not working days)' }
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (!FUTURE_ALLOWED_TYPES.includes(type as string) && start > today) {
    return { status: 400, error: 'Only sick leave and military reserve may be reported for future dates' }
  }
  // half_day_vac is always partial with fixed 4.5 h — skip manual partial_hours validation
  if (type !== 'half_day_vac' && is_partial) {
    const hours = Number(partial_hours)
    if (partial_hours === null || partial_hours === undefined || isNaN(hours) || hours <= 0 || hours >= 9) {
      return { status: 400, error: 'partial_hours must be a number greater than 0 and less than 9 when is_partial is true' }
    }
  }
  const year = start.getFullYear()
  const month = start.getMonth() + 1
  const lock = await db('month_locks').where({ year, month }).first()
  if (lock) {
    return { status: 423, error: 'This month is locked and cannot be modified' }
  }
  const lastOfMonth = new Date(year, month, 0)
  const clippedEnd = end > lastOfMonth ? lastOfMonth : end
  return { clippedEndStr: toDateStr(clippedEnd) }
}

// GET / — returns all absence entries for the logged-in user, excluding soft-deleted rows.
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id
    const { month } = req.query

    let query = db('absences')
      .select('id', 'user_id', 'type', 'start_date', 'end_date', 'is_partial',
              'partial_hours', 'notes', 'document_filename', 'document_mimetype',
              'document_uploaded_at', 'created_at', 'updated_at', 'deleted_at')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .orderBy('start_date', 'asc')

    if (month) {
      if (!MONTH_RE.test(month as string)) {
        return res.status(400).json({ error: 'month must be in YYYY-MM format' })
      }
      const [y, m] = (month as string).split('-').map(Number)
      const firstDay = `${month}-01`
      const lastDay = toDateStr(new Date(y, m, 0))
      query = query.where('start_date', '<=', lastDay).where('end_date', '>=', firstDay)
    }

    const absences = await query
    res.json(absences)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST / — creates a new absence entry for the authenticated user.
router.post('/', async (req: Request, res: Response) => {
  try {
    const { type, start_date, end_date, notes = null } = req.body
    const isHalfDay = type === 'half_day_vac'
    const is_partial = isHalfDay ? true : Boolean(req.body.is_partial)
    const partial_hours = isHalfDay ? 4.5 : (req.body.partial_hours ?? null)
    const userId = req.user!.id

    const validation = await validateAbsenceBody({ type, start_date, end_date, is_partial, partial_hours, notes })
    if ('error' in validation) {
      return res.status(validation.status).json({ error: validation.error })
    }

    const [absence] = await db('absences')
      .insert({
        user_id: userId,
        type,
        start_date,
        end_date: validation.clippedEndStr,
        is_partial,
        partial_hours: is_partial ? partial_hours : null,
        notes,
      })
      .returning(['id', 'user_id', 'type', 'start_date', 'end_date', 'is_partial',
                  'partial_hours', 'notes', 'document_filename', 'document_mimetype',
                  'document_uploaded_at', 'created_at', 'updated_at', 'deleted_at'])

    res.status(201).json(absence)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /:id — updates an existing absence entry. Only the owner or an admin may update.
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (!isPositiveInt(id)) return res.status(400).json({ error: 'Invalid absence id' })
    const { type, start_date, end_date } = req.body
    const isHalfDay = type === 'half_day_vac'
    const is_partial = isHalfDay ? true : Boolean(req.body.is_partial)
    const partial_hours = isHalfDay ? 4.5 : (req.body.partial_hours ?? null)
    const userId = req.user!.id

    const existing = await db('absences').where({ id }).whereNull('deleted_at').first()
    if (!existing) {
      return res.status(404).json({ error: 'Absence not found' })
    }

    const notes = req.body.notes !== undefined ? req.body.notes : existing.notes

    if (existing.user_id !== userId && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const validation = await validateAbsenceBody({ type, start_date, end_date, is_partial, partial_hours, notes })
    if ('error' in validation) {
      return res.status(validation.status).json({ error: validation.error })
    }

    const [updated] = await db('absences')
      .where({ id })
      .update({
        type,
        start_date,
        end_date: validation.clippedEndStr,
        is_partial,
        partial_hours: is_partial ? partial_hours : null,
        notes,
        updated_at: db.fn.now(),
      })
      .returning(['id', 'user_id', 'type', 'start_date', 'end_date', 'is_partial',
                  'partial_hours', 'notes', 'document_filename', 'document_mimetype',
                  'document_uploaded_at', 'created_at', 'updated_at', 'deleted_at'])

    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /:id/document — upload a supporting document; stored as BLOB in the DB.
router.post('/:id/document', (req: Request, res: Response) => {
  uploadDocument.single('document')(req, res, async (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File exceeds the maximum size of 20 MB' })
      }
      if (err.code === 'INVALID_MIME_TYPE') {
        return res.status(400).json({ error: 'Only PDF, JPEG, and PNG files are accepted' })
      }
      return res.status(500).json({ error: 'File upload failed' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' })
    }

    try {
      const { id } = req.params
      if (!isPositiveInt(id)) return res.status(400).json({ error: 'Invalid absence id' })
      let updated: any
      await db.transaction(async (trx) => {
        const absence = await trx('absences').where({ id }).whereNull('deleted_at').forUpdate().first()
        if (!absence) throw Object.assign(new Error('Absence not found'), { httpStatus: 404 })
        if (absence.user_id !== req.user!.id && req.user!.role !== 'admin') {
          throw Object.assign(new Error('Forbidden'), { httpStatus: 403 })
        }
        const d = new Date(absence.start_date)
        const lock = await trx('month_locks').where({ year: d.getFullYear(), month: d.getMonth() + 1 }).first()
        if (lock) throw Object.assign(new Error('This month is locked and cannot be modified'), { httpStatus: 423 })
        ;[updated] = await trx('absences')
          .where({ id })
          .update({
            document_data: req.file!.buffer,
            document_filename: req.file!.originalname,
            document_mimetype: req.file!.mimetype,
            document_uploaded_at: db.fn.now(),
            updated_at: db.fn.now(),
          })
          .returning(['id', 'user_id', 'type', 'start_date', 'end_date', 'is_partial',
                      'partial_hours', 'notes', 'document_filename', 'document_mimetype',
                      'document_uploaded_at', 'created_at', 'updated_at', 'deleted_at'])
      })
      res.json(updated)
    } catch (dbErr: any) {
      if (dbErr.httpStatus) return res.status(dbErr.httpStatus).json({ error: dbErr.message })
      res.status(500).json({ error: 'Internal server error' })
    }
  })
})

// GET /:id/document — streams the stored BLOB back to the client.
router.get('/:id/document', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (!isPositiveInt(id)) return res.status(400).json({ error: 'Invalid absence id' })
    const absence = await db('absences')
      .select('user_id', 'document_data', 'document_filename', 'document_mimetype')
      .where({ id })
      .whereNull('deleted_at')
      .first()

    if (!absence || !absence.document_data) {
      return res.status(404).json({ error: 'Document not found' })
    }

    if (absence.user_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const encoded = encodeURIComponent(absence.document_filename || 'document')
    res.set('Content-Type', absence.document_mimetype || 'application/octet-stream')
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encoded}`)
    res.send(absence.document_data)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /:id — soft-deletes the absence entry. Only owner or admin; month-lock respected.
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (!isPositiveInt(id)) return res.status(400).json({ error: 'Invalid absence id' })
    const existing = await db('absences').where({ id }).whereNull('deleted_at').first()
    if (!existing) {
      return res.status(404).json({ error: 'Absence not found' })
    }
    if (existing.user_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const d = new Date(existing.start_date)
    const lock = await db('month_locks').where({ year: d.getFullYear(), month: d.getMonth() + 1 }).first()
    if (lock) {
      return res.status(423).json({ error: 'This month is locked and cannot be modified' })
    }
    await db('absences').where({ id }).update({ deleted_at: db.fn.now(), updated_at: db.fn.now() })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /:id/document — removes the stored document from the DB record.
router.delete('/:id/document', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (!isPositiveInt(id)) return res.status(400).json({ error: 'Invalid absence id' })
    const absence = await db('absences').where({ id }).whereNull('deleted_at').first()

    if (!absence || !absence.document_data) {
      return res.status(404).json({ error: 'Absence or document not found' })
    }

    if (absence.user_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const d = new Date(absence.start_date)
    const lock = await db('month_locks').where({ year: d.getFullYear(), month: d.getMonth() + 1 }).first()
    if (lock) return res.status(423).json({ error: 'This month is locked and cannot be modified' })

    const [updated] = await db('absences')
      .where({ id })
      .update({
        document_data: null,
        document_filename: null,
        document_mimetype: null,
        document_uploaded_at: null,
        updated_at: db.fn.now(),
      })
      .returning(['id', 'user_id', 'type', 'start_date', 'end_date', 'is_partial',
                  'partial_hours', 'notes', 'document_filename', 'document_mimetype',
                  'document_uploaded_at', 'created_at', 'updated_at', 'deleted_at'])

    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router;
