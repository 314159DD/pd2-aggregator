import fs from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const PORT = 55433;
const DB = 'pd2meta_test';
const DATA_DIR = path.join(__dirname, '..', '.pgtest');

export default async function setup(): Promise<() => Promise<void>> {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });
  if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(DB);
  } catch {
    // already exists from a previous run
  }
  process.env.TEST_DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/${DB}`;
  return async () => {
    await pg.stop();
  };
}
