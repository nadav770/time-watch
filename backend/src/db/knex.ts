import knexLib, { Knex } from 'knex';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const knexConfigs = require('../../knexfile.cjs');

const nodeEnv = process.env.NODE_ENV || 'development';
const config: Knex.Config = knexConfigs[nodeEnv] || knexConfigs.development;

// Extend the Knex instance type with custom helpers
interface DbInstance extends Knex {
  runMigrations: (database?: Knex) => Promise<any>;
  closeDatabase: (database?: Knex) => Promise<void>;
}

const db = knexLib(config) as DbInstance;

db.runMigrations = async (database: Knex = db) => database.migrate.latest();
db.closeDatabase  = async (database: Knex = db) => database.destroy();

export = db;
