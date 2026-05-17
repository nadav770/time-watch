/**
 * Integration tests for /api/absences.
 * Uses the real database; documents are stored as BLOBs — no disk I/O.
 * Run via: docker compose exec backend npx jest absences
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import db from '../db/knex';
import { createApp } from '../app';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const app = createApp();

// --- Auth helpers ---

function authCookie(userId: number, role = 'employee'): string {
  return `token=${jwt.sign({ id: userId, role }, process.env.JWT_SECRET as string)}`;
}

// --- DB helpers ---

// Inserts a test absence and returns the full row.
async function insertAbsence(overrides: Record<string, any> = {}): Promise<any> {
  const [row] = await db('absences')
    .insert({
      user_id: owner.id,
      type: 'vacation',
      start_date: '2024-01-15',
      end_date: '2024-01-19',
      is_partial: false,
      ...overrides,
    })
    .returning('*');
  return row;
}

// --- Test users (created once, reused across tests) ---

let owner: any;  // regular employee
let admin: any;  // admin user
let other: any;  // another employee (used for ownership tests)

beforeAll(async () => {
  await db.migrate.latest();

  await db('users')
    .whereIn('email', ['owner@int.test', 'admin@int.test', 'other@int.test'])
    .delete();

  const rows = await db('users')
    .insert([
      { email: 'owner@int.test', password_hash: 'x', full_name: 'Owner', role: 'employee', is_active: true },
      { email: 'admin@int.test', password_hash: 'x', full_name: 'Admin', role: 'admin',    is_active: true },
      { email: 'other@int.test', password_hash: 'x', full_name: 'Other', role: 'employee', is_active: true },
    ])
    .returning('*');

  owner = rows[0];
  admin = rows[1];
  other = rows[2];
}, 30_000);

beforeEach(async () => {
  await db('absences')
    .whereIn('user_id', [owner.id, admin.id, other.id])
    .delete();
  await db('month_locks').where({ year: 2024 }).delete();
});

afterAll(async () => {
  await db('absences')
    .whereIn('user_id', [owner.id, admin.id, other.id])
    .delete();
  await db('month_locks').where({ year: 2024 }).delete();
  await db('users')
    .whereIn('email', ['owner@int.test', 'admin@int.test', 'other@int.test'])
    .delete();
  await db.destroy();
}, 30_000);

// ============================================================
// GET /api/absences
// ============================================================

describe('GET /api/absences', () => {
  it('returns all absences for the authenticated user', async () => {
    await insertAbsence({ start_date: '2024-01-15', end_date: '2024-01-17' });
    await insertAbsence({ start_date: '2024-02-05', end_date: '2024-02-07' });

    const res = await request(app)
      .get('/api/absences')
      .set('Cookie', authCookie(owner.id));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('does not return absences belonging to a different user', async () => {
    await insertAbsence({ user_id: other.id });

    const res = await request(app)
      .get('/api/absences')
      .set('Cookie', authCookie(owner.id));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('filters by ?month= and returns only absences in that month', async () => {
    await insertAbsence({ start_date: '2024-01-15', end_date: '2024-01-19' });
    await insertAbsence({ start_date: '2024-02-05', end_date: '2024-02-07' });

    const res = await request(app)
      .get('/api/absences?month=2024-01')
      .set('Cookie', authCookie(owner.id));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].start_date).toMatch(/^2024-01/);
  });

  it('does not return soft-deleted absences', async () => {
    const absence = await insertAbsence();
    await db('absences').where({ id: absence.id }).update({ deleted_at: new Date() });

    const res = await request(app)
      .get('/api/absences')
      .set('Cookie', authCookie(owner.id));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('returns 401 without an auth cookie', async () => {
    const res = await request(app).get('/api/absences');
    expect(res.status).toBe(401);
  });
});

// ============================================================
// POST /api/absences
// ============================================================

describe('POST /api/absences', () => {
  it('creates an absence in the DB and returns 201', async () => {
    const res = await request(app)
      .post('/api/absences')
      .set('Cookie', authCookie(owner.id))
      .send({ type: 'vacation', start_date: '2024-01-15', end_date: '2024-01-19' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'vacation', user_id: owner.id });

    const row = await db('absences').where({ id: res.body.id }).first();
    expect(row).toBeTruthy();
    expect(row.type).toBe('vacation');
  });

  it('clips end_date to the last day of start_date month (multi-month split)', async () => {
    const res = await request(app)
      .post('/api/absences')
      .set('Cookie', authCookie(owner.id))
      .send({ type: 'vacation', start_date: '2024-01-25', end_date: '2024-02-10' });

    expect(res.status).toBe(201);

    const row = await db('absences').where({ id: res.body.id }).first();
    expect(row.end_date.toISOString().startsWith('2024-01-31')).toBe(true);
  });

  it('returns 400 for an unrecognised absence type', async () => {
    const res = await request(app)
      .post('/api/absences')
      .set('Cookie', authCookie(owner.id))
      .send({ type: 'holiday', start_date: '2024-01-15', end_date: '2024-01-15' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid absence type/);
  });

  it('returns 400 when vacation has a future start_date', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    // Advance off Fri/Sat so working-days check doesn't fire before the future-date check
    if (future.getDay() === 5) future.setDate(future.getDate() + 2);
    if (future.getDay() === 6) future.setDate(future.getDate() + 1);
    const d = future.toISOString().split('T')[0];

    const res = await request(app)
      .post('/api/absences')
      .set('Cookie', authCookie(owner.id))
      .send({ type: 'vacation', start_date: d, end_date: d });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/future dates/);
  });

  it('allows sick leave with a future start_date', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    if (future.getDay() === 5) future.setDate(future.getDate() + 2);
    if (future.getDay() === 6) future.setDate(future.getDate() + 1);
    const d = future.toISOString().split('T')[0];

    const res = await request(app)
      .post('/api/absences')
      .set('Cookie', authCookie(owner.id))
      .send({ type: 'sick', start_date: d, end_date: d });

    expect(res.status).toBe(201);
  });

  it('returns 400 for a Friday–Saturday only range (no working days)', async () => {
    const res = await request(app)
      .post('/api/absences')
      .set('Cookie', authCookie(owner.id))
      .send({ type: 'vacation', start_date: '2024-01-05', end_date: '2024-01-06' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no working days/);
  });

  it('returns 423 when the target month is locked', async () => {
    await db('month_locks').insert({ year: 2024, month: 1 });

    const res = await request(app)
      .post('/api/absences')
      .set('Cookie', authCookie(owner.id))
      .send({ type: 'vacation', start_date: '2024-01-15', end_date: '2024-01-19' });

    expect(res.status).toBe(423);
    expect(res.body.error).toMatch(/locked/);
  });
});

// ============================================================
// PUT /api/absences/:id
// ============================================================

describe('PUT /api/absences/:id', () => {
  it('returns 403 when a non-owner employee tries to update', async () => {
    const absence = await insertAbsence({ user_id: other.id });

    const res = await request(app)
      .put(`/api/absences/${absence.id}`)
      .set('Cookie', authCookie(owner.id, 'employee'))
      .send({ type: 'sick', start_date: '2024-01-15', end_date: '2024-01-15' });

    expect(res.status).toBe(403);
  });

  it('allows the absence owner to update their record', async () => {
    const absence = await insertAbsence();

    const res = await request(app)
      .put(`/api/absences/${absence.id}`)
      .set('Cookie', authCookie(owner.id, 'employee'))
      .send({ type: 'sick', start_date: '2024-01-15', end_date: '2024-01-15' });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('sick');

    const row = await db('absences').where({ id: absence.id }).first();
    expect(row.type).toBe('sick');
  });

  it('allows admin to update an absence they do not own', async () => {
    const absence = await insertAbsence({ user_id: other.id });

    const res = await request(app)
      .put(`/api/absences/${absence.id}`)
      .set('Cookie', authCookie(admin.id, 'admin'))
      .send({ type: 'sick', start_date: '2024-01-15', end_date: '2024-01-15' });

    expect(res.status).toBe(200);
  });

  it('returns 404 for a non-existent absence', async () => {
    const res = await request(app)
      .put('/api/absences/99999')
      .set('Cookie', authCookie(owner.id))
      .send({ type: 'sick', start_date: '2024-01-15', end_date: '2024-01-15' });

    expect(res.status).toBe(404);
  });

  it('returns 423 when the month is locked during update', async () => {
    const absence = await insertAbsence();
    await db('month_locks').insert({ year: 2024, month: 1 });

    const res = await request(app)
      .put(`/api/absences/${absence.id}`)
      .set('Cookie', authCookie(owner.id))
      .send({ type: 'sick', start_date: '2024-01-15', end_date: '2024-01-15' });

    expect(res.status).toBe(423);
  });
});

// ============================================================
// POST /api/absences/:id/document
// ============================================================

describe('POST /api/absences/:id/document', () => {
  it('returns 400 for an invalid mime type', async () => {
    const absence = await insertAbsence();

    const res = await request(app)
      .post(`/api/absences/${absence.id}/document`)
      .set('Cookie', authCookie(owner.id))
      .attach('document', Buffer.from('fake content'), { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PDF|JPEG|PNG/i);
  });

  it('returns 413 when the file exceeds 20 MB', async () => {
    const absence = await insertAbsence();

    const res = await request(app)
      .post(`/api/absences/${absence.id}/document`)
      .set('Cookie', authCookie(owner.id))
      .attach('document', Buffer.alloc(21 * 1024 * 1024), { filename: 'big.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/20 MB/);
  }, 15_000);

  it('stores the file as a BLOB in the DB', async () => {
    const absence = await insertAbsence();
    const fileContent = Buffer.from('%PDF-1.4 fake pdf content');

    const res = await request(app)
      .post(`/api/absences/${absence.id}/document`)
      .set('Cookie', authCookie(owner.id))
      .attach('document', fileContent, { filename: 'report.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.document_filename).toBe('report.pdf');
    expect(res.body.document_mimetype).toBe('application/pdf');
    expect(res.body.document_uploaded_at).toBeTruthy();

    // Verify the raw bytes were persisted.
    const row = await db('absences').where({ id: absence.id }).first();
    expect(row.document_data).toEqual(fileContent);
    expect(row.document_filename).toBe('report.pdf');
  });

  it('overwrites an existing BLOB when a new file is uploaded', async () => {
    const absence = await insertAbsence({
      document_data: Buffer.from('old content'),
      document_filename: 'old.pdf',
      document_mimetype: 'application/pdf',
    });

    const newContent = Buffer.from('%PDF-1.4 new content');

    const res = await request(app)
      .post(`/api/absences/${absence.id}/document`)
      .set('Cookie', authCookie(owner.id))
      .attach('document', newContent, { filename: 'new.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.document_filename).toBe('new.pdf');

    const row = await db('absences').where({ id: absence.id }).first();
    expect(row.document_data).toEqual(newContent);
  });

  it('returns 404 for a non-existent absence', async () => {
    const res = await request(app)
      .post('/api/absences/99999/document')
      .set('Cookie', authCookie(owner.id))
      .attach('document', Buffer.from('%PDF-1.4 orphan'), { filename: 'orphan.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(404);
  });

  it('returns 403 when a non-owner tries to upload a document', async () => {
    const absence = await insertAbsence({ user_id: other.id });

    const res = await request(app)
      .post(`/api/absences/${absence.id}/document`)
      .set('Cookie', authCookie(owner.id, 'employee'))
      .attach('document', Buffer.from('%PDF-1.4'), { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(403);
  });
});

// ============================================================
// GET /api/absences/:id/document
// ============================================================

describe('GET /api/absences/:id/document', () => {
  it('streams the stored BLOB back with the correct Content-Type', async () => {
    const fileContent = Buffer.from('%PDF-1.4 serve me');
    const absence = await insertAbsence({
      document_data: fileContent,
      document_filename: 'serve.pdf',
      document_mimetype: 'application/pdf',
    });

    const res = await request(app)
      .get(`/api/absences/${absence.id}/document`)
      .set('Cookie', authCookie(owner.id));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(Buffer.from(res.body)).toEqual(fileContent);
  });

  it('returns 404 when the absence has no document', async () => {
    const absence = await insertAbsence();

    const res = await request(app)
      .get(`/api/absences/${absence.id}/document`)
      .set('Cookie', authCookie(owner.id));

    expect(res.status).toBe(404);
  });

  it('returns 403 when a non-owner tries to download a document', async () => {
    const absence = await insertAbsence({
      user_id: other.id,
      document_data: Buffer.from('%PDF-1.4'),
      document_filename: 'file.pdf',
      document_mimetype: 'application/pdf',
    });

    const res = await request(app)
      .get(`/api/absences/${absence.id}/document`)
      .set('Cookie', authCookie(owner.id, 'employee'));

    expect(res.status).toBe(403);
  });
});

// ============================================================
// DELETE /api/absences/:id/document
// ============================================================

describe('DELETE /api/absences/:id/document', () => {
  it('returns 403 when a non-owner tries to delete the document', async () => {
    const absence = await insertAbsence({
      user_id: other.id,
      document_data: Buffer.from('pdf'),
      document_filename: 'file.pdf',
      document_mimetype: 'application/pdf',
    });

    const res = await request(app)
      .delete(`/api/absences/${absence.id}/document`)
      .set('Cookie', authCookie(owner.id, 'employee'));

    expect(res.status).toBe(403);
  });

  it('returns 404 when the absence has no document', async () => {
    const absence = await insertAbsence();

    const res = await request(app)
      .delete(`/api/absences/${absence.id}/document`)
      .set('Cookie', authCookie(owner.id));

    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-existent absence', async () => {
    const res = await request(app)
      .delete('/api/absences/99999/document')
      .set('Cookie', authCookie(owner.id));

    expect(res.status).toBe(404);
  });

  it('nulls all document columns in DB and returns 200', async () => {
    const absence = await insertAbsence({
      document_data: Buffer.from('%PDF-1.4 delete me'),
      document_filename: 'delete.pdf',
      document_mimetype: 'application/pdf',
    });

    const res = await request(app)
      .delete(`/api/absences/${absence.id}/document`)
      .set('Cookie', authCookie(owner.id));

    expect(res.status).toBe(200);
    expect(res.body.document_filename).toBeNull();
    expect(res.body.document_mimetype).toBeNull();
    expect(res.body.document_uploaded_at).toBeNull();

    const row = await db('absences').where({ id: absence.id }).first();
    expect(row.document_data).toBeNull();
    expect(row.document_filename).toBeNull();
  });

  it('admin can delete a document on any absence', async () => {
    const absence = await insertAbsence({
      user_id: other.id,
      document_data: Buffer.from('admin delete'),
      document_filename: 'file.pdf',
      document_mimetype: 'application/pdf',
    });

    const res = await request(app)
      .delete(`/api/absences/${absence.id}/document`)
      .set('Cookie', authCookie(admin.id, 'admin'));

    expect(res.status).toBe(200);
    expect(res.body.document_filename).toBeNull();
  });
});
