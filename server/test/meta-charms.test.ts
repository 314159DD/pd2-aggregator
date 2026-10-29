import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { mkChar, seed, type MkItem } from './helpers/meta-seed';
import type { CharacterFilter } from '../src/api/filters';
import { charmsAggregate } from '../src/api/meta/charms';

let pool: Pool;
beforeEach(async () => {
  pool = await freshDb();
});
afterEach(async () => {
  await pool.end();
});

const F: CharacterFilter = {
  season: 14, mode: 'softcore', minLevel: 1, maxLevel: 99, classes: [], items: [], skills: [],
  mercTypes: [], mercItems: [], maxGearHr: null,
};

const charm = (c: MkItem['charm'], o: Partial<MkItem> = {}): MkItem => ({ quality: 'Magic', charm: c, ...o });
const run = async (n: number) => charmsAggregate(pool, F, n);

describe('charmsAggregate', () => {
  it('returns zeros for an empty pool', async () => {
    expect(await run(0)).toEqual({
      avgCount: 0,
      annihilus: { count: 0, pct: 0 },
      torch: { count: 0, pct: 0 },
      gheeds: { count: 0, pct: 0 },
      topGcMods: [],
      topScMods: [],
    });
  });

  it('detects Annihilus by name and Unique quality', async () => {
    await seed(pool, [
      mkChar({ name: 'A', items: [charm('Small Charm', { quality: 'Unique', name: 'Annihilus' })] }),
      mkChar({ name: 'B', items: [charm('Small Charm', { name: 'Small Charm of Vita' })] }),
    ]);
    expect((await run(2)).annihilus).toEqual({ count: 1, pct: 0.5 });
  });

  it('does not count a non-unique charm named Annihilus', async () => {
    await seed(pool, [mkChar({ name: 'A', items: [charm('Small Charm', { name: 'Annihilus' })] })]);
    expect((await run(1)).annihilus.count).toBe(0);
  });

  it('detects the Hellfire Torch on a Medium Charm', async () => {
    await seed(pool, [
      mkChar({
        name: 'A',
        items: [
          charm('Medium Charm', { quality: 'Unique', name: 'Hellfire Torch' }),
          charm('Medium Charm', { quality: 'Unique', name: 'Hellfire Torch' }),
        ],
      }),
    ]);
    expect((await run(1)).torch).toEqual({ count: 2, pct: 2 });
  });

  it("detects Gheed's Fortune on a Large Charm", async () => {
    await seed(pool, [
      mkChar({ name: 'A', items: [charm('Large Charm', { quality: 'Unique', name: "Gheed's Fortune" })] }),
      mkChar({ name: 'B' }),
    ]);
    expect((await run(2)).gheeds).toEqual({ count: 1, pct: 0.5 });
  });

  it('buckets Grand Charm mods into topGcMods', async () => {
    await seed(pool, [
      mkChar({
        name: 'A',
        items: [charm('Large Charm', { mods: [['item_allskills', 1]] }), charm('Large Charm', { mods: [['item_allskills', 1]] })],
      }),
    ]);
    const r = await run(1);
    expect(r.topGcMods[0]).toMatchObject({ modName: 'item_allskills', count: 2, displayLabel: '+X to All Skills' });
    expect(r.topScMods).toHaveLength(0);
  });

  it('buckets Small and Medium Charm mods into topScMods', async () => {
    await seed(pool, [
      mkChar({
        name: 'A',
        items: [charm('Small Charm', { mods: [['maxhp', 20]] }), charm('Medium Charm', { mods: [['maxhp', 20]] })],
      }),
    ]);
    const r = await run(1);
    expect(r.topScMods[0]).toMatchObject({ modName: 'maxhp', count: 2 });
    expect(r.topGcMods).toHaveLength(0);
  });

  it('computes avgCount across characters, mod-less charms included', async () => {
    await seed(pool, [
      mkChar({ name: 'A', items: [charm('Small Charm'), charm('Small Charm'), charm('Large Charm')] }),
      mkChar({ name: 'B', items: [charm('Small Charm')] }),
    ]);
    expect((await run(2)).avgCount).toBe(2);
  });

  it('keeps uniques out of the mod lists', async () => {
    await seed(pool, [
      mkChar({
        name: 'A',
        items: [
          charm('Small Charm', { quality: 'Unique', name: 'Annihilus', mods: [['item_allskills', 1]] }),
          charm('Large Charm', { quality: 'Unique', name: "Gheed's Fortune", mods: [['item_allskills', 1]] }),
          charm('Medium Charm', { quality: 'Unique', name: 'Hellfire Torch', mods: [['item_allskills', 1]] }),
          charm('Small Charm', { mods: [['maxhp', 20]] }),
        ],
      }),
    ]);
    const r = await run(1);
    expect(r.topScMods.map((m) => m.modName)).toEqual(['maxhp']);
    expect(r.topGcMods).toHaveLength(0);
  });

  it('uses the pool as pct denominator', async () => {
    await seed(pool, [
      mkChar({ name: 'A', items: [charm('Small Charm', { mods: [['maxhp', 20]] })] }),
      mkChar({ name: 'B', items: [charm('Small Charm', { mods: [['maxhp', 15]] })] }),
      mkChar({ name: 'C', items: [charm('Small Charm', { mods: [['item_fastercastrate', 5]] })] }),
    ]);
    const life = (await run(3)).topScMods.find((m) => m.modName === 'maxhp')!;
    expect(life.count).toBe(2);
    expect(life.pct).toBeCloseTo(2 / 3);
  });

  it('counts every occurrence, so pct can exceed 1', async () => {
    const gc = () => charm('Large Charm', { mods: [['item_maxhp_percent', 5]] });
    await seed(pool, [mkChar({ name: 'A', items: [gc(), gc(), gc()] }), mkChar({ name: 'B' })]);
    const e = (await run(2)).topGcMods.find((m) => m.modName === 'item_maxhp_percent')!;
    expect(e).toMatchObject({ count: 3, pct: 1.5 });
  });

  it('limits to 12 per bucket sorted by count desc, name asc', async () => {
    const mods: MkItem['mods'] = Array.from({ length: 14 }, (_, i) => [`m${String(i).padStart(2, '0')}`, 1]);
    await seed(pool, [
      mkChar({ name: 'A', items: [charm('Large Charm', { mods }), charm('Large Charm', { mods: [['m13', 1]] })] }),
    ]);
    const r = await run(1);
    expect(r.topGcMods).toHaveLength(12);
    expect(r.topGcMods[0].modName).toBe('m13');
    expect(r.topGcMods[1].modName).toBe('m00');
  });
});
