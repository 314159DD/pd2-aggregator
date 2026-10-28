import { Pool } from 'pg';
import { migrate } from '../../src/db/migrate';

export const DEFAULT_TEST_DATABASE_URL = 'postgres://postgres:postgres@localhost:55433/pd2meta_test';

/** Drops and recreates schema public in TEST_DATABASE_URL, migrates, returns a pool. */
export async function freshDb(): Promise<Pool> {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL });
  await pool.query('drop schema public cascade');
  await pool.query('create schema public');
  await migrate(pool);
  return pool;
}
