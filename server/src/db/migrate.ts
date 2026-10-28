import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';

// Resolved from the source tree so it works from src (tsx/vitest) and from dist.
const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'src', 'db', 'migrations');

/** Applies pending *.sql migrations in name order; returns the names applied. */
export async function migrate(pool: Pool): Promise<string[]> {
  await pool.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const done = new Set(
    (await pool.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name),
  );
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      applied.push(file);
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }
  return applied;
}
