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
});
