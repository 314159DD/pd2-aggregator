import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Pool } from 'pg';
import { DEFAULT_TEST_DATABASE_URL, freshDb } from './helpers/db';
import { createPool } from '../src/db/pool';
import { mkChar, seed, seedSynthetic } from './helpers/meta-seed';
import type { CharacterFilter } from '../src/api/filters';
import { metaCohort } from '../src/api/meta/cohort';
import { skillUsage } from '../src/api/meta/skills';
import { MOD_DICTIONARY } from '../src/core/static-data';
import { META_FACTS_FINGERPRINT, metaRollupState, rebuildMetaRollup } from '../src/db/meta-rollup';
import { rollupScope } from '../src/api/meta/rollup';
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
    expect(await metaRollupState(pool)).toBe('ok');
    expect((await pool.query('select fingerprint from meta_rollup_status')).rows[0].fingerprint).toBeNull();
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
    // the first write stamped the fingerprint of the code that wrote it
    expect((await pool.query('select fingerprint from meta_rollup_status')).rows[0].fingerprint).toBe(META_FACTS_FINGERPRINT);
    await rebuildMetaRollup(pool);
    expect(await rollupRows(pool)).toEqual(incremental);
  });

  it('a populated database starts not ready until the rebuild', async () => {
    await pool.query("update meta_rollup_status set ready = false");
    expect(await metaRollupState(pool)).toBe('not-ready');
    expect(await rebuildMetaRollup(pool)).toBe(2);
    expect(await metaRollupState(pool)).toBe('ok');
  });

  it('re-ingesting an unchanged character writes no rollup rows, a one-mod change only its keys', async () => {
    const xmins = async () => (await pool.query('select xmin::text as x from meta_rollup')).rows.map((r) => r.x).sort();
    const before = await xmins();
    await seed(pool, [mkChar({ name: 'B', className: 'Sorceress', level: 86 })]);
    expect(await xmins()).toEqual(before);
    const ring = (v: number) => [{ quality: 'Rare', slot: 'Left Ring', mods: [['maxhp', v]] as Array<[string, number]> }];
    await seed(pool, [mkChar({ name: 'B', className: 'Sorceress', level: 86, items: ring(20) })]);
    const mid = await xmins();
    await seed(pool, [mkChar({ name: 'B', className: 'Sorceress', level: 86, items: ring(21) })]);
    const after = await xmins();
    const changed = after.filter((x) => !mid.includes(x)).length;
    // avg maxhp (x2 level rows) + affix maxhp 20 -> 21 (old key removed, new key added, x2)
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(6);
    const incremental = await rollupRows(pool);
    await rebuildMetaRollup(pool);
    expect(await rollupRows(pool)).toEqual(incremental);
  });

  it('a rollup stamped by other fact code is not read until the rebuild, and says so once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = { ...F, minLevel: 1 };
    expect(await rollupScope(pool, f)).not.toBeNull();
    await pool.query("update meta_rollup_status set fingerprint = 'other-code'");
    expect(await metaRollupState(pool)).toBe('stale');
    expect(await rollupScope(pool, f)).toBeNull();
    expect(await rollupScope(pool, f)).toBeNull();
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('meta rollup fingerprint mismatch, run backfill-meta'))).toHaveLength(1);
    await rebuildMetaRollup(pool);
    expect(await rollupScope(pool, f)).not.toBeNull();
    warn.mockRestore();
  });

  it('non-finite and non-numeric mod values count 0 instead of failing the write', async () => {
    const odd = (v: string) => ({ quality: 'Rare', slot: 'Helm', mods: [['maxhp', v as unknown as number], ['strength', 5]] as Array<[string, number]> });
    await seed(pool, [mkChar({ name: 'Odd', className: 'Druid', items: [odd('NaN'), { ...odd('Infinity'), slot: 'Armor' }, { ...odd('x'), slot: 'Gloves' }] })]);
    const r = await pool.query("select total::text from meta_rollup where kind = 'avg' and k1 = 'maxhp' and class = 'Druid' and level = 0");
    expect(r.rows).toEqual([{ total: '0' }]);
  });

  it('backfill-items keeps the rollup in step', async () => {
    const real = toCompact(fx, 'ACC');
    await upsertCharacter(pool, 14, real, enrichRaw(fx, 'ACC'));
    await pool.query('delete from characters where name <> $1', [real.name]);
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
    api = createPool(process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL, 'api'); // the api's session settings
  }, 600000);
  afterAll(async () => {
    await api.end();
    await pool.end();
  });

  // 5,000 characters x 35 items x ~5.5 mods (about the production shape per character, 0.8x its
  // character count). The rollup path must be taken; the time bound is generous (measured ~120 ms
  // here, the per-character path takes ~1.8 s). See task-7b-report.md for the 50k projection.
  it('answers an all-classes cohort of 5,000 characters from the rollup', async () => {
    await metaCohort(api, F); // buffers, as the api warm-up does
    const sqls: string[] = [];
    const orig = api.query.bind(api) as (...a: unknown[]) => unknown;
    const spy = vi.spyOn(api, 'query').mockImplementation(((...args: unknown[]) => {
      sqls.push(String(args[0]));
      return orig(...args);
    }) as never);
    const t0 = performance.now();
    const out = await metaCohort(api, F);
    const ms = performance.now() - t0;
    spy.mockRestore();
    expect(out.poolSize).toBe(3500);
    expect(sqls.filter((q) => q.includes('from meta_rollup r')).length).toBeGreaterThanOrEqual(8);
    expect(sqls.filter((q) => q.includes('jsonb_array_elements'))).toEqual([]);
    expect(sqls.filter((q) => q.includes('meta_rollup_status'))).toHaveLength(1); // scope resolved once
    expect(ms, `metaCohort took ${Math.round(ms)} ms`).toBeLessThan(1500);
  }, 60000);
});
