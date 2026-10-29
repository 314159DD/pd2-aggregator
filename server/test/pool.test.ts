import { describe, it, expect } from 'vitest';
import { createPool } from '../src/db/pool';

describe('createPool', () => {
  it('caps connections at 20 and sets a 15s statement timeout', async () => {
    const pool = createPool('postgres://u:p@localhost:1/db');
    const o = pool.options as { max?: number; statement_timeout?: number };
    expect(o.max).toBe(20);
    expect(o.statement_timeout).toBe(15000);
    await pool.end();
  });

  it('turns JIT off everywhere and raises work_mem only for the api', async () => {
    const opt = (p: ReturnType<typeof createPool>) => (p.options as { options?: string }).options;
    const collector = createPool('postgres://u:p@localhost:1/db');
    const api = createPool('postgres://u:p@localhost:1/db', 'api');
    expect(opt(collector)).toBe('-c jit=off');
    expect(opt(api)).toBe('-c jit=off -c work_mem=32MB');
    await collector.end();
    await api.end();
  });
});
