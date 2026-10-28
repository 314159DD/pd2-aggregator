// Starts a local embedded Postgres for development: npx tsx scripts/dev-db.ts
import fs from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { createPool } from '../src/db/pool';
import { migrate } from '../src/db/migrate';

const PORT = 55432;
const DB = 'pd2meta';
const DATA_DIR = path.join(__dirname, '..', '.pgdev');

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: true,
  });
  if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(DB);
  } catch {
    // exists
  }
  const url = `postgres://postgres:postgres@localhost:${PORT}/${DB}`;
  const pool = createPool(url);
  const applied = await migrate(pool);
  await pool.end();
  console.log(`dev db ready: DATABASE_URL=${url} (applied: ${applied.join(', ') || 'none'})`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
