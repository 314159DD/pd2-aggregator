import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { mkChar, seed, seedSynthetic } from './helpers/meta-seed';
import type { CharacterFilter } from '../src/api/filters';
import { buildsUsage } from '../src/api/builds-queries';
import * as q from '../src/api/queries';
import { MOD_DICTIONARY } from '../src/core/static-data';
import { rebuildMetaRollup } from '../src/db/meta-rollup';

const F: CharacterFilter = {
  season: 14, mode: 'softcore', minLevel: 80, maxLevel: 99, classes: [], items: [], skills: [],
  mercTypes: [], mercItems: [], maxGearHr: null,
};

const setReady = (pool: Pool, ready: boolean) => pool.query('update meta_rollup_status set ready = $1', [ready]);

/** Every usage read of /builds/usage and /characters/stats/* for one cohort. */
async function usage(pool: Pool, f: CharacterFilter) {
  // a page past the end: synthetic characters carry no raw payload, only the counts matter here
  const page = await q.charactersPage(pool, f, 100000, 1);
  return {
    builds: await buildsUsage(pool, f),
    items: await q.itemUsage(pool, f),
    mercItems: await q.mercItemUsage(pool, f),
    skills: await q.skillUsage(pool, f),
    mercTypes: await q.mercTypeUsage(pool, f),
    levels: await q.levelDistribution(pool, f),
    page: { total: page.total, breakdown: page.breakdown },
  };
}

/** Sorts rows that tie on count by every field, so row order within a tie does not matter. */
const canon = (x: unknown): unknown =>
  Array.isArray(x)
    ? x.map(canon).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
    : x && typeof x === 'object'
      ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, canon(v)]))
      : x;

describe('usage reads: meta_rollup path equals the per-character queries', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = await freshDb();
    await seedSynthetic(pool, 400, Object.keys(MOD_DICTIONARY));
    await seedSynthetic(pool, 150, Object.keys(MOD_DICTIONARY), 13);
    // below level 80, an unknown merc type, a character without anything
    await seed(pool, [
      mkChar({ name: 'Low', className: 'Paladin', level: 75, skills: [['Blessed Hammer', 20]], merc: 'Might',
        items: [{ name: 'Unique Helm 1', quality: 'Unique', slot: 'Helm', invCode: 'aaa' }] }),
      mkChar({ name: 'Odd', className: 'Druid', level: 85, merc: 'Mystery',
        items: [{ name: 'Unique Helm 1', quality: 'Unique', slot: 'Helm', invCode: 'inv0' }] }),
      mkChar({ name: 'Bare', className: 'Sorceress', level: 99 }),
    ]);
    await pool.query(
      `insert into item_prices (mode, item_type, item_name, median_hr, samples, source, computed_at)
       values ('softcore', 'Unique', 'Unique Helm 1', 2.5, 3, 'ask', now()),
              ('softcore', 'Runeword', 'Runeword 3', 0.75, 4, 'sold', now()),
              ('softcore', 'Unique', 'Merc Unique Helm2', 1, 3, 'ask', now()),
              ('hardcore', 'Unique', 'Unique Helm 1', 9, 3, 'ask', now())`,
    );
    await rebuildMetaRollup(pool);
  }, 120000);
  afterAll(async () => {
    await pool.end();
  });

  const cohorts: Array<[string, Partial<CharacterFilter>]> = [
    ['softcore all', {}],
    ['hardcore all', { mode: 'hardcore' }],
    ['one class', { classes: ['Paladin'] }],
    ['two classes', { classes: ['Sorceress', 'Druid'] }],
    ['window wider than the stored levels', { minLevel: 1 }],
    ['level window', { minLevel: 88, maxLevel: 93 }],
    ['class window cutting the top level', { classes: ['Paladin'], maxLevel: 98 }],
    ['archive season (no prices)', { season: 13, archive: true }],
    ['nobody', { classes: ['Druid'], minLevel: 99, maxLevel: 99, season: 12 }],
  ];
  for (const [label, over] of cohorts) {
    it(label, async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const f = { ...F, ...over };
      await setReady(pool, true);
      const viaRollup = await usage(pool, f);
      await setReady(pool, false);
      const viaScan = await usage(pool, f);
      await setReady(pool, true);
      warn.mockRestore();
      expect(canon(viaRollup)).toEqual(canon(viaScan));
      // the sorted lists keep their order on both paths
      expect(viaRollup.builds.items.map((x) => x.count)).toEqual(viaScan.builds.items.map((x) => x.count));
      if (label !== 'nobody') {
        expect(viaRollup.builds.total).toBeGreaterThan(0);
        expect(viaRollup.builds.items.some((x) => x.medianHr !== null)).toBe(f.archive !== true);
      }
    });
  }

  it('base cohorts read meta_rollup only, filtered cohorts the per-character tables', async () => {
    const sqls: string[] = [];
    const orig = pool.query.bind(pool) as (...a: unknown[]) => unknown;
    const spy = vi.spyOn(pool, 'query').mockImplementation(((...args: unknown[]) => {
      sqls.push(String(args[0]));
      return orig(...args);
    }) as never);
    await usage(pool, { ...F, classes: ['Paladin'] });
    const base = sqls.splice(0);
    await buildsUsage(pool, { ...F, items: ['Unique Helm 1'] });
    const filtered = sqls.splice(0);
    spy.mockRestore();
    const perCharacter = /character_(items|skills|merc)\b|from characters c join filtered/;
    // charactersPage reads its page rows from characters; everything else comes from the rollup
    expect(base.filter((s) => perCharacter.test(s) && !s.includes('c.raw'))).toEqual([]);
    expect(base.filter((s) => s.includes('from meta_rollup r')).length).toBeGreaterThanOrEqual(10);
    expect(filtered.some((s) => s.includes('from character_items i join filtered'))).toBe(true);
  });
});
