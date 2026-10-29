import { Pool } from 'pg';

/**
 * jit off everywhere: the planner over-estimates the rows of jsonb_array_elements and JIT-compiled
 * the per-character meta queries, 1.2 s of a 2.1 s query in production. The api pool also raises
 * work_mem so the meta aggregations and sorts stay in memory (the 4MB default spilled them to
 * disk); the collector keeps the server default.
 */
export function createPool(url: string, role: 'api' | 'collector' = 'collector'): Pool {
  const options = role === 'api' ? '-c jit=off -c work_mem=32MB' : '-c jit=off';
  return new Pool({ connectionString: url, max: 20, statement_timeout: 15000, options });
}
