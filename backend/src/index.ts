import 'dotenv/config';
import { createApp } from './app';
import db from './db/knex';
import { scheduleMidnightSplit } from './cron/midnightSplit';

const PORT = Number(process.env.PORT) || 3000;
const shouldRunMigrations = process.env.RUN_MIGRATIONS_ON_STARTUP !== 'false';

async function startServer(): Promise<void> {
  if (shouldRunMigrations) {
    console.log('Running database migrations...');
    await db.runMigrations();
  }

  const app = createApp();

  scheduleMidnightSplit();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend is LIVE! Listening on port: ${PORT}`);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`Local Swagger UI: http://localhost:${PORT}/api-docs`);
    }
  });
}

startServer().catch((error) => {
  console.error('Failed to start backend', error);
  process.exit(1);
});
