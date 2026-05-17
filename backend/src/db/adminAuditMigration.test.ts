const migration = require('../../migrations/20260507132000_create_admin_audit_tables.cjs');

function createChainableRecorder(operations: any[]): any {
  let chain: any;

  chain = new Proxy(function noop() {}, {
    get(_target: any, prop: string) {
      if (prop === 'then') {
        return undefined;
      }

      return (...args: any[]) => {
        operations.push({ method: prop, args });
        return chain;
      };
    },
  });

  return chain;
}

function createTableBuilder(operations: any[]): any {
  return new Proxy(
    {},
    {
      get(_target: any, prop: string) {
        return (...args: any[]) => {
          operations.push({ method: prop, args });
          return createChainableRecorder(operations);
        };
      },
    }
  );
}

function createFakeKnex({ hasTable = false, hasColumn = false } = {}): any {
  const createdTables: any[] = [];
  const alteredTables: any[] = [];
  const droppedTables: string[] = [];
  const rawStatements: string[] = [];

  return {
    createdTables,
    alteredTables,
    droppedTables,
    rawStatements,
    fn: {
      now: () => 'CURRENT_TIMESTAMP',
    },
    schema: {
      hasTable: async () => hasTable,
      hasColumn: async () => hasColumn,
      createTable: async (name: string, callback: (t: any) => void) => {
        const operations: any[] = [];
        callback(createTableBuilder(operations));
        createdTables.push({ name, operations });
      },
      alterTable: async (name: string, callback: (t: any) => void) => {
        const operations: any[] = [];
        callback(createTableBuilder(operations));
        alteredTables.push({ name, operations });
      },
      dropTableIfExists: async (name: string) => {
        droppedTables.push(name);
      },
      raw: async (statement: string) => {
        rawStatements.push(statement);
      },
    },
  };
}

function methodsFor(table: any): string[] {
  return table.operations.map((operation: any) => operation.method);
}

function addedColumnsFor(tableName: string, knex: any): string[] {
  return knex.alteredTables
    .filter((table: any) => table.name === tableName)
    .flatMap((table: any) => table.operations)
    .filter((operation: any) =>
      ['integer', 'timestamp', 'text', 'string', 'jsonb'].includes(operation.method)
    )
    .map((operation: any) => operation.args[0]);
}

test('admin audit migration creates month lock and audit tables', async () => {
  const knex = createFakeKnex();

  await migration.up(knex);

  expect(knex.createdTables.map((table: any) => table.name)).toEqual(['month_locks', 'audit_log']);
  expect(methodsFor(knex.createdTables[0])).toEqual(expect.arrayContaining(['integer', 'timestamp', 'text', 'index']));
  expect(methodsFor(knex.createdTables[1])).toEqual(expect.arrayContaining(['integer', 'string', 'jsonb', 'timestamp']));
});

test('admin audit migration adds uniqueness, checks, and audit indexes', async () => {
  const knex = createFakeKnex();

  await migration.up(knex);

  expect(knex.rawStatements).toEqual(
    expect.arrayContaining([
      expect.stringContaining('month_locks_year_month_unique'),
      expect.stringContaining('month_locks_month_range_check'),
      expect.stringContaining('month_locks_year_range_check'),
      expect.stringContaining('audit_log_actor_user_id_idx'),
      expect.stringContaining('audit_log_entity_idx'),
    ])
  );
});

test('admin audit migration reconciles existing tables with missing columns', async () => {
  const knex = createFakeKnex({ hasTable: true, hasColumn: false });

  await migration.up(knex);

  expect(knex.createdTables).toEqual([]);
  expect(addedColumnsFor('month_locks', knex)).toEqual(
    expect.arrayContaining(['year', 'month', 'locked_by', 'locked_at', 'notes', 'created_at', 'updated_at'])
  );
  expect(addedColumnsFor('audit_log', knex)).toEqual(
    expect.arrayContaining([
      'actor_user_id',
      'target_user_id',
      'entity_type',
      'entity_id',
      'action',
      'old_values',
      'new_values',
      'metadata',
      'created_at',
      'updated_at',
    ])
  );
});

test('admin audit migration rolls back audit table before month locks', async () => {
  const knex = createFakeKnex();

  await migration.down(knex);

  expect(knex.droppedTables).toEqual(['audit_log', 'month_locks']);
});
