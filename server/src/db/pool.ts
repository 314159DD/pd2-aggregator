import { Pool } from 'pg';

export function createPool(url: string): Pool {
  return new Pool({ connectionString: url, max: 20, statement_timeout: 15000 });
}
