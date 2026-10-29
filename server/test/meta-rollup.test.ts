import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { DEFAULT_TEST_DATABASE_URL, freshDb } from './helpers/db';
import { createPool } from '../src/db/pool';
import { mkChar, seed, seedSynthetic } from './helpers/meta-seed';
import type { CharacterFilter } from '../src/api/filters';
import { metaCohort } from '../src/api/meta/cohort';
import { skillUsage } from '../src/api/meta/skills';
import { MOD_DICTIONARY } from '../src/core/static-data';
import { metaRollupReady, rebuildMetaRollup } from '../src/db/meta-rollup';
import { upsertCharacter } from '../src/db/characters-repo';
import { backfillItems } from '../src/scripts/backfill-items';
import { enrichRaw, toCompact } from '../src/core/compact';
import ladder from './fixtures/character-ladder.json';

const fx = ladder as any;

const F: CharacterFilter = {
  season: 14, mode: 'softcore', minLevel: 80, maxLevel: 99, classes: [], items: [], skills: [],
  mercTypes: [], mercItems: [], maxGearHr: null,
};

const setReady = (pool: Pool, ready: boolean) => pool.query('update meta_rollup_status set ready = $1', [ready]);
const rollupRows = async (pool: Pool) =>
  (
    await pool.query(
      `select season, mode, class, level, kind, k1, k2, k3, val, n::text, total::text, entries::text from meta_rollup
       order by season, mode, class, level, kind, k1, k2, k3, val`,
    )
  ).rows;

/** Same cohort through the rollup (ready) and through the per-character queries (not ready). */
async function bothPaths(pool: Pool, f: CharacterFilter) {
  await setReady(pool, true);
  const viaRollup = await metaCohort(pool, f);
  await setReady(pool, false);
  const viaScan = await metaCohort(pool, f);
  await setReady(pool, true);
  return { viaRollup, viaScan };
}

describe('meta rollup equals the per-character queries', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = await freshDb();
    await seedSynthetic(pool, 400, Object.keys(MOD_DICTIONARY));
    await rebuildMetaRollup(pool);
  }, 120000);
  afterAll(async () => {
    await pool.end();
  });

  const cohorts: Array<[string, Partial<CharacterFilter>]> = [
    ['softcore all', {}],
    ['hardcore all', { mode: 'hardcore' }],
    ['one class', { classes: ['Paladin'] }],
    ['two classes', { classes: ['Sorceress', 'Necromancer'] }],
    ['window wider than the stored levels (all-levels rows)', { minLevel: 1 }],
    ['window cutting the top level (per-level rows)', { classes: ['Paladin'], maxLevel: 98 }],
    ['level window', { minLevel: 88, maxLevel: 93 }],
    ['class above 95', { classes: ['Amazon'], minLevel: 95 }],
    ['nobody', { classes: ['Druid'], minLevel: 99, maxLevel: 99, season: 13 }],
  ];
  for (const [label, over] of cohorts) {
    it(label, async () => {
      const { viaRollup, viaScan } = await bothPaths(pool, { ...F, ...over });
      expect(viaRollup).toEqual(viaScan);
      if (label !== 'nobody') expect(viaRollup.poolSize).toBeGreaterThan(0);
    });
  }

  it('skill usage of a class asked for another class cohort uses the per-character query', async () => {
    const f = { ...F, classes: ['Paladin', 'Amazon'] };
    const a = await skillUsage(pool, f, 'Paladin');
    await setReady(pool, false);
    const b = await skillUsage(pool, f, 'Paladin');
    await setReady(pool, true);
    expect(a).toEqual(b);
  });

  it('skill-filtered cohorts keep the per-character queries', async () => {
    const f = { ...F, classes: ['Paladin'], skills: [{ name: 'Blessed Hammer', minLevel: 5 }] };
    const { viaRollup, viaScan } = await bothPaths(pool, f);
    expect(viaRollup).toEqual(viaScan);
  });
});

describe('meta rollup maintenance', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = await freshDb();
  });
  afterAll(async () => {
    await pool.end();
  });

  it('is ready on a fresh database and stays equal to a rebuild through upserts, class/level changes and backfill', async () => {
    expect(await metaRollupReady(pool)).toBe(true);
    const items = [
      { name: 'Shako', quality: 'Unique', slot: 'Helm', mods: [['maxhp', 30], ['item_allskills', 2]] as Array<[string, number]> },
      { quality: 'Rare', slot: 'Left Ring', mods: [['maxhp', 20], ['item_fastercastrate', 10]] as Array<[string, number]> },
      { quality: 'Magic', charm: 'Small Charm' as const, mods: [['maxhp', 20]] as Array<[string, number]> },
      { name: 'Annihilus', quality: 'Unique', charm: 'Small Charm' as const, mods: [['item_allskills', 1]] as Array<[string, number]> },
    ];
    await seed(pool, [
      mkChar({ name: 'A', className: 'Paladin', level: 90, skills: [['Blessed Hammer', 20], ['Holy Bolt', 1]], items, merc: 'Might' }),
      mkChar({ name: 'B', className: 'Sorceress', level: 85, skills: [['Blizzard', 20]], items: items.slice(1) }),
    ]);
    // A changes class, level, items, skills and merc; B loses everything.
    await seed(pool, [
      mkChar({ name: 'A', className: 'Amazon', level: 93, skills: [['Jab', 1]], items: items.slice(2), merc: 'Holy Freeze' }),
      mkChar({ name: 'B', className: 'Sorceress', level: 86 }),
    ]);
    const incremental = await rollupRows(pool);
    expect(incremental.every((r) => Number(r.entries) > 0)).toBe(true);
    await rebuildMetaRollup(pool);
    expect(await rollupRows(pool)).toEqual(incremental);
  });

  it('a populated database starts not ready until the rebuild', async () => {
    await pool.query("update meta_rollup_status set ready = false");
    expect(await metaRollupReady(pool)).toBe(false);
    expect(await rebuildMetaRollup(pool)).toBe(2);
    expect(await metaRollupReady(pool)).toBe(true);
  });

  it('backfill-items keeps the rollup in step', async () => {
    const real = toCompact(fx, 'ACC');
    await upsertCharacter(pool, 14, real, enrichRaw(fx, 'ACC'));
    await pool.query("delete from characters where name in ('A', 'B')");
    await rebuildMetaRollup(pool);
    const full = await rollupRows(pool);
    await pool.query('delete from character_items');
    await rebuildMetaRollup(pool);
    expect(await rollupRows(pool)).not.toEqual(full);
    expect(await backfillItems(pool, 14)).toBe(1);
    expect(await rollupRows(pool)).toEqual(full);
  });

  it('a failed write leaves the rollup unchanged', async () => {
    const before = await rollupRows(pool);
    const real = toCompact(fx, 'ACC');
    const bad = mkChar({ name: real.name, mode: real.mode as 'softcore' | 'hardcore', className: 'Druid', items: [{ quality: 'Rare', slot: 'Helm', mods: [['maxhp', 5]] }] });
    (bad as { level: unknown }).level = 'not a level';
    await expect(upsertCharacter(pool, 14, bad, {})).rejects.toThrow();
    expect(await rollupRows(pool)).toEqual(before);
  });
});

describe('meta rollup scale', () => {
  let pool: Pool;
  let api: Pool;
  beforeAll(async () => {
    pool = await freshDb();
    await seedSynthetic(pool, 5000, Object.keys(MOD_DICTIONARY));
    await rebuildMetaRollup(pool);
    await pool.query('analyze');
    api = createPool(process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL); // the api's session settings
  }, 600000);
  afterAll(async () => {
    await api.end();
    await pool.end();
  });

  // 5,000 characters x 35 items x ~5.5 mods (about the production shape per character, 0.8x its
  // character count). See task-7b-report.md for how this bound maps to 50k characters on the VPS.
  it('computes an all-classes cohort of 5,000 characters in under 400 ms', async () => {
    await metaCohort(api, F); // buffers, as the api warm-up does
    const t0 = performance.now();
    const out = await metaCohort(api, F);
    const ms = performance.now() - t0;
    expect(out.poolSize).toBe(3500);
    expect(ms, `metaCohort took ${Math.round(ms)} ms`).toBeLessThan(400);
  }, 60000);
});
