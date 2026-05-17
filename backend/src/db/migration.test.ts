import knexLib from 'knex';
const knexConfigs = require('../../knexfile.cjs');

let testDb: ReturnType<typeof knexLib>;

beforeAll(async () => {
  testDb = knexLib(knexConfigs.test);
  await testDb.migrate.rollback(undefined, true);
  await testDb.migrate.latest();
});

afterAll(async () => {
  await testDb.migrate.rollback();
  await testDb.destroy();
});

describe('users table', () => {
  it('exists after migration', async () => {
    const exists = await testDb.schema.hasTable('users');
    expect(exists).toBe(true);
  });

  it('has the expected columns', async () => {
    const cols = await testDb('users').columnInfo();
    expect(cols).toHaveProperty('id');
    expect(cols).toHaveProperty('email');
    expect(cols).toHaveProperty('password_hash');
    expect(cols).toHaveProperty('full_name');
    expect(cols).toHaveProperty('role');
    expect(cols).toHaveProperty('is_active');
    expect(cols).toHaveProperty('created_at');
    expect(cols).toHaveProperty('updated_at');
  });

  it('inserts and retrieves a user', async () => {
    const [{ id }] = await testDb('users').insert({
      email: 'test@example.com',
      password_hash: 'hashed',
      full_name: 'Test User',
      role: 'employee',
      is_active: true,
    }).returning('id');

    const user = await testDb('users').where({ id }).first();
    expect(user.email).toBe('test@example.com');
    expect(user.role).toBe('employee');
    expect(user.is_active).toBe(true);
  });

  it('enforces unique email constraint', async () => {
    await testDb('users').insert({
      email: 'unique@example.com',
      password_hash: 'hashed',
      full_name: 'First',
      role: 'employee',
      is_active: true,
    });

    await expect(
      testDb('users').insert({
        email: 'unique@example.com',
        password_hash: 'hashed',
        full_name: 'Second',
        role: 'employee',
        is_active: true,
      })
    ).rejects.toThrow();
  });
});
