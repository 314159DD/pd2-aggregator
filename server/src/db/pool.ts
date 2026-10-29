import { Pool } from 'pg';

/**
 * jit off: the planner over-estimates the rows of jsonb_array_elements and JIT-compiled the
 * per-character meta queries, 1.2 s of a 2.1 s query in production. work_mem 32MB keeps the meta
 * aggregations and sorts in memory (the 4MB default spilled them to disk).
 */
export function createPool(url: string): Pool {
  return new Pool({ connectionString: url, max: 20, statement_timeout: 15000, options: '-c jit=off -c work_mem=32MB' });
}
