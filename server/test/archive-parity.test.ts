import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { mkChar } from './helpers/meta-seed';
import { writeArchivePage } from '../src/archive/write';
import { loadConfig } from '../src/config';
import {
  PARITY_SETS,
  applyExplained,
  compareBreakdown,
  compareUsage,
  explainItems,
  formatTable,
  type Check,
} from '../src/archive/parity';

const cfg = loadConfig({ DATABASE_URL: 'postgres://x', CURRENT_SEASON: '14' } as any);
const opts = { tolerance: 1, topN: 25, minPct: 1, exclude: ['Annihilus'] };

describe('compareBreakdown', () => {
  it('passes on equal counts and lists mismatches', () => {
    expect(compareBreakdown({ Paladin: 5, total: 5 }, { Paladin: 5, total: 5 }).pass).toBe(true);
    const r = compareBreakdown({ Paladin: 4, total: 5 }, { Paladin: 5, total: 5 });
    expect(r.pass).toBe(false);
    expect(r.failures).toEqual(['Paladin 4 vs 5']);
  });
});

describe('compareUsage', () => {
  it('applies the tolerance', () => {
    expect(compareUsage([{ name: 'A', pct: 10 }], [{ name: 'A', pct: 10.9 }], opts).pass).toBe(true);
    expect(compareUsage([{ name: 'A', pct: 10 }], [{ name: 'A', pct: 11.1 }], opts).pass).toBe(false);
  });
  it('ignores excluded names', () => {
    expect(compareUsage([{ name: 'Annihilus', pct: 90 }], [], opts).pass).toBe(true);
  });
  it('counts a missing name as 0', () => {
    const r = compareUsage([], [{ name: 'B', pct: 3 }], opts);
    expect(r.pass).toBe(false);
    expect(r.failures[0]).toContain('ours 0');
  });
  it('skips names under minPct on both sides', () => {
    const r = compareUsage([{ name: 'C', pct: 0.5 }], [{ name: 'C', pct: 0.5 }], opts);
    expect(r.compared).toBe(0);
    expect(r.pass).toBe(true);
  });
});

describe('explainItems', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = await freshDb();
    const row = (name: string, items: object[]) => ({
      compact: mkChar({ name }),
      raw: { character: { name }, items },
      lastUpdated: new Date('2025-06-01T00:00:00Z'),
    });
    await writeArchivePage(pool, {
      season: 13, mode: 'softcore', pass: 1, page: 1, upstreamTotal: 2,
      rows: [
        row('WithRF', [
          { name: 'Raven Frost', quality: { name: 'Unique' }, is_runeword: false, location: { zone: 'Stored', storage: 'Inventory' } },
          { name: 'Raven Frost', quality: { name: 'Magic' }, is_runeword: false },
        ]),
        row('Without', [{ name: 'Rare Thing', quality: { name: 'Rare' } }]),
      ],
      counts: { received: 2, belowMin: 0, invalid: 0 }, done: true, rollup: false,
    });
  });
  afterAll(() => pool.end());

  it('counts a name found only in raw.items', async () => {
    const m = await explainItems(pool, cfg, { season: '13', gameMode: 'softcore', minLevel: '80' }, ['Raven Frost']);
    expect(m.get('Raven Frost')).toBe(50);
  });

  it('turns a matching recount into an explained row', () => {
    const base = compareUsage([], [{ name: 'Raven Frost', pct: 50 }], opts);
    expect(base.pass).toBe(false);
    const r = applyExplained(base, [{ name: 'Raven Frost', pct: 50 }], new Map([['Raven Frost', 50]]));
    expect(r.pass).toBe(true);
    expect(r.explained).toEqual(['Raven Frost']);
    const kept = applyExplained(base, [{ name: 'Raven Frost', pct: 50 }], new Map([['Raven Frost', 10]]));
    expect(kept.pass).toBe(false);
  });
});

describe('PARITY_SETS and formatTable', () => {
  it('uses season 13 everywhere', () => {
    expect(PARITY_SETS.length).toBeGreaterThanOrEqual(7);
    for (const s of PARITY_SETS) expect(s.query.season).toBe('13');
  });
  it('prints PASS and FAIL rows without em dashes', () => {
    const mk = (pass: boolean): Check => ({
      set: 'all-sc', check: 'items', compared: 3, maxDelta: 0.5, failures: pass ? [] : ['X ours 0 vs theirs 3'], explained: [], pass,
    });
    const out = formatTable([mk(true), mk(false)]);
    expect(out).toContain('PASS');
    expect(out).toContain('FAIL');
    expect(out).not.toContain('—');
  });
});
