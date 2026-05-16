'use strict';

// Creates a new admin user in the database
// Usage: node scripts/create-admin.cjs
require('dotenv').config();
const bcrypt = require('bcryptjs');
const knex = require('knex');

const connection = process.env.DATABASE_URL || {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5433,
  database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'timewatch',
  user: process.env.PGUSER || process.env.POSTGRES_USER || 'timewatch',
  password: process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || 'timewatch',
};

const db = knex({ client: 'pg', connection });

async function createAdmin() {
  const email = 'oskeisar@gmail.com';
  const password = 'ozKeisar123456!';
  const full_name = 'Os Keisar';

  const existing = await db('users').where({ email }).whereNull('deleted_at').first();
  if (existing) {
    console.log(`משתמש עם המייל ${email} כבר קיים (id: ${existing.id})`);
    return;
  }

  const password_hash = await bcrypt.hash(password, 12);
  const [user] = await db('users')
    .insert({ email, password_hash, full_name, role: 'admin', is_active: true })
    .returning(['id', 'email', 'full_name', 'role']);

  console.log('אדמין נוצר בהצלחה:', user);
}

createAdmin()
  .then(() => process.exit(0))
  .catch((err) => { console.error('שגיאה:', err.message); process.exit(1); })
  .finally(() => db.destroy());
