import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { mkChar, seed } from './helpers/meta-seed';
import type { CharacterFilter } from '../src/api/filters';
import { poolSizes, coreStats, avgStats } from '../src/api/meta/stats';

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

describe('poolSizes', () => {
  it('counts the cohort and the base pool without skills', async () => {
    await seed(pool, [
      mkChar({ name: 'A', skills: [['Blizzard', 20]] }),
      mkChar({ name: 'B', skills: [['Fireball', 20]] }),
    ]);
    const r = await poolSizes(pool, { ...F, skills: [{ name: 'Blizzard', minLevel: 10 }] });
    expect(r).toEqual({ poolSize: 1, basePoolSize: 2 });
  });
});

describe('coreStats', () => {
  it('averages the base stats', async () => {
    await seed(pool, [
      mkChar({ name: 'A', attributes: { strength: 100 }, life: 1000 }),
      mkChar({ name: 'B', attributes: { strength: 200 }, life: 2000 }),
    ]);
    const r = await coreStats(pool, F);
    expect(r.map((s) => s.label)).toEqual(['Strength', 'Dexterity', 'Vitality', 'Energy', 'Life', 'Mana']);
    expect(r.find((s) => s.key === 'strength')!.avg).toBe(150);
    expect(r.find((s) => s.key === 'life')!.avg).toBe(1500);
    expect(r.find((s) => s.key === 'dexterity')!.avg).toBe(0);
  });

  it('returns six zero rows for an empty pool', async () => {
    const r = await coreStats(pool, F);
    expect(r).toHaveLength(6);
    expect(r.every((s) => s.avg === 0)).toBe(true);
  });
});

describe('avgStats', () => {
  const FCR = 'item_fastercastrate';

  it('sums equipped items and charms per character and averages over the pool', async () => {
    await seed(pool, [
      mkChar({
        name: 'A',
        items: [
          { quality: 'Rare', slot: 'Left Ring', mods: [[FCR, 10]] },
          { quality: 'Magic', charm: 'Small Charm', mods: [[FCR, 5]] },
        ],
      }),
      mkChar({ name: 'B' }),
    ]);
    const r = await avgStats(pool, F);
    expect(r).toEqual([
      { modName: FCR, displayLabel: 'Faster Cast Rate', suffix: '%', avgValue: 7.5, charsWithMod: 1, pctOfChars: 0.5 },
    ]);
  });

  it('drops excluded mods', async () => {
    await seed(pool, [
      mkChar({
        name: 'A',
        items: [{ quality: 'Rare', slot: 'Helm', mods: [['fireresist', 30], ['item_addskill_tab', 2], [FCR, 1]] }],
      }),
    ]);
    expect((await avgStats(pool, F)).map((s) => s.modName)).toEqual([FCR]);
  });

  it('ignores unique charms, merc items and stored (slotless, non-charm) items', async () => {
    await seed(pool, [
      mkChar({
        name: 'A',
        items: [
          { quality: 'Unique', name: 'Annihilus', charm: 'Small Charm', mods: [['modx', 20]] },
          { quality: 'Rare', slot: 'Helm', owner: 'merc', mods: [['mody', 20]] },
          { quality: 'Rare', mods: [['modz', 20]] },
        ],
      }),
    ]);
    expect(await avgStats(pool, F)).toEqual([]);
  });

  it('counts a non-annihilus unique charm and a switch-slot item', async () => {
    await seed(pool, [
      mkChar({
        name: 'A',
        items: [
          { quality: 'Unique', name: 'Some Other Charm', charm: 'Large Charm', mods: [['modx', 4]] },
          { quality: 'Rare', slot: 'Right Hand Switch', mods: [['mody', 6]] },
        ],
      }),
    ]);
    const r = await avgStats(pool, F);
    expect(r.map((s) => s.modName).sort()).toEqual(['modx', 'mody']);
  });

  it('drops mods labelled Corrupted, Desecrated or Mirrored by the dictionary', async () => {
    await seed(pool, [
      mkChar({ name: 'A', items: [{ quality: 'Rare', slot: 'Helm', mods: [['corrupted', 1], ['mirrored', 1], [FCR, 1]] }] }),
    ]);
    expect((await avgStats(pool, F)).map((s) => s.modName)).toEqual([FCR]);
  });

  it('returns the top 8 ordered by charsWithMod then name', async () => {
    const names = 'abcdefghij'.split('').map((l) => `mod_${l}`);
    await seed(pool, [
      mkChar({ name: 'A', items: [{ quality: 'Rare', slot: 'Helm', mods: names.map((n) => [n, 1] as [string, number]) }] }),
      mkChar({ name: 'B', items: [{ quality: 'Rare', slot: 'Helm', mods: [['mod_j', 1]] }] }),
    ]);
    const r = await avgStats(pool, F);
    expect(r).toHaveLength(8);
    expect(r.map((s) => s.modName)).toEqual(['mod_j', 'mod_a', 'mod_b', 'mod_c', 'mod_d', 'mod_e', 'mod_f', 'mod_g']);
    expect(r[0].displayLabel).toBe('mod_j');
    expect(r[0].suffix).toBe('');
  });

  it('is empty for an empty pool', async () => {
    expect(await avgStats(pool, F)).toEqual([]);
  });
});
