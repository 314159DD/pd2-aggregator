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
  recountItems,
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
  it('fails an empty pd2.tools cohort', () => {
    const r = compareBreakdown({ Paladin: 0, total: 0 }, { Paladin: 0, total: 0 });
    expect(r.pass).toBe(false);
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

describe('compareUsage guards', () => {
  it('fails or throws on NaN pct on either side', () => {
    expect(() => compareUsage([{ name: 'A', pct: NaN }], [{ name: 'A', pct: 5 }], opts)).toThrow();
    expect(() => compareUsage([{ name: 'A', pct: 5 }], [{ name: 'A', pct: NaN }], opts)).toThrow();
    expect(() => compareUsage([{ name: '', pct: 5 }], [], opts)).toThrow();
  });
  it('fails an empty comparison when rows are required', () => {
    expect(compareUsage([], [], { ...opts, requireRows: true }).pass).toBe(false);
    expect(compareUsage([], [], opts).pass).toBe(true);
  });
});

describe('recountItems', () => {
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

  it('counts a name found only in raw.items the pd2.tools way and not our way', async () => {
    const m = await recountItems(pool, cfg, { season: '13', gameMode: 'softcore', minLevel: '80' }, ['Raven Frost']);
    expect(m.theirs.get('Raven Frost')).toBe(50);
    expect(m.ours.get('Raven Frost')).toBe(0);
  });

  const theirs = [{ name: 'Raven Frost', pct: 50 }];
  it('explains a row when both recounts agree with the two sides', () => {
    const base = compareUsage([], theirs, opts);
    expect(base.pass).toBe(false);
    const r = applyExplained(base, [], theirs, { theirs: new Map([['Raven Frost', 50]]), ours: new Map([['Raven Frost', 0]]) });
    expect(r.pass).toBe(true);
    expect(r.explained).toEqual(['Raven Frost']);
  });
  it('fails when our own recount says we are missing the item', () => {
    const base = compareUsage([], theirs, opts);
    const r = applyExplained(base, [], theirs, { theirs: new Map([['Raven Frost', 50]]), ours: new Map([['Raven Frost', 50]]) });
    expect(r.pass).toBe(false);
    expect(r.explained).toEqual([]);
  });
  it('fails when the pd2.tools-style recount does not match theirs', () => {
    const base = compareUsage([], theirs, opts);
    const r = applyExplained(base, [], theirs, { theirs: new Map([['Raven Frost', 10]]), ours: new Map([['Raven Frost', 0]]) });
    expect(r.pass).toBe(false);
  });
  it('keeps an empty-comparison failure', () => {
    const base = compareUsage([], [], { ...opts, requireRows: true });
    expect(applyExplained(base, [], [], { theirs: new Map(), ours: new Map() }).pass).toBe(false);
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
