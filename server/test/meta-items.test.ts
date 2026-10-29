import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { mkChar, seed } from './helpers/meta-seed';
import type { CharacterFilter } from '../src/api/filters';
import {
  shapeTopItemsBySlot,
  topItemsBySlot,
  mercSummary,
  skillFrequency,
  levelDistribution,
  type UsageRow,
} from '../src/api/meta/items';

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

const row = (item: string, itemType: string, n: number, pct: number): UsageRow => ({
  item, itemType, numOccurrences: n, totalSample: 100, pct,
});

describe('shapeTopItemsBySlot', () => {
  it('buckets rows into slots via item-name lookup', () => {
    const out = shapeTopItemsBySlot([
      row('Heart of the Oak', 'Runeword', 78, 78),
      row('Harlequin Crest', 'Unique', 62, 62),
      row('Raven Frost', 'Unique', 91, 91),
    ]);
    expect(out.weapon[0]).toMatchObject({ itemName: 'Heart of the Oak', pct: 78 });
    expect(out.helm[0]).toMatchObject({ itemName: 'Harlequin Crest', pct: 62 });
    expect(out.ring[0]).toMatchObject({ itemName: 'Raven Frost', pct: 91 });
  });

  it('drops items with no slot match', () => {
    const out = shapeTopItemsBySlot([row('Mystery Trinket That Does Not Exist', 'Unique', 5, 5)]);
    for (const arr of Object.values(out)) expect(arr).toEqual([]);
  });

  it('limits each slot to 8, count desc then name asc', () => {
    const names = [
      'Harlequin Crest', 'Crown of Ages', "Andariel's Visage", 'Veil of Steel', 'Vampire Gaze',
      "Cerebus' Bite", "Arreat's Face", 'Giant Skull', 'Stealskull',
    ];
    const out = shapeTopItemsBySlot(names.map((n, i) => row(n, 'Unique', 90 - i * 10, 90 - i * 10)));
    expect(out.helm.length).toBeLessThanOrEqual(8);
    expect(out.helm[0].itemName).toBe('Harlequin Crest');
    const ties = shapeTopItemsBySlot([row('Harlequin Crest', 'Unique', 5, 5), row("Andariel's Visage", 'Unique', 5, 5)]);
    expect(ties.helm.map((i) => i.itemName)).toEqual(["Andariel's Visage", 'Harlequin Crest']);
  });
});

async function setPrice(type: string, name: string, hr: number): Promise<void> {
  await pool.query(
    `insert into item_prices (mode, item_type, item_name, median_hr, samples, source, computed_at)
     values ('softcore', $1, $2, $3, 5, 'sold', now())`,
    [type, name, hr],
  );
}

const crest = { name: 'Harlequin Crest', quality: 'Unique', slot: 'Helm', invCode: 'uap' };
const spirit = { name: 'Spirit', quality: 'Normal', slot: 'Left Hand', runeword: true };

async function seedCrests(): Promise<void> {
  await seed(pool, [
    mkChar({ name: 'A', items: [crest] }),
    mkChar({ name: 'B', items: [crest] }),
    mkChar({ name: 'C', items: [crest] }),
    mkChar({ name: 'D', items: [spirit] }),
  ]);
}

describe('topItemsBySlot', () => {
  it('counts wearers and picks the inventory code', async () => {
    await seedCrests();
    const r = await topItemsBySlot(pool, F);
    expect(r.helm[0]).toMatchObject({ itemName: 'Harlequin Crest', count: 3, pct: 75, invCode: 'uap', price: null });
    expect(r.offhand[0]).toMatchObject({ itemName: 'Spirit', itemType: 'Runeword', count: 1, pct: 25 });
  });

  it('attaches the item price when present', async () => {
    await seedCrests();
    await setPrice('Unique', 'Harlequin Crest', 0.3);
    const r = await topItemsBySlot(pool, F);
    expect(r.helm[0].price).toEqual({ medianHr: 0.3, samples: 5, source: 'sold' });
  });

  it('estimates rune cost when a rune has no price', async () => {
    await seedCrests();
    await setPrice('Rune', 'Tal Rune', 0.01);
    await setPrice('Rune', 'Thul Rune', 0.02);
    await setPrice('Rune', 'Ort Rune', 0.03);
    const sp = (await topItemsBySlot(pool, F)).offhand[0];
    expect(sp.runeCostHr).toBe(0.07);
    expect(sp.runeCostEstimated).toBe(true);
    expect(sp.runes![3]).toEqual({ rune: 'Amn', medianHr: null });
    expect(sp.runes![0]).toEqual({ rune: 'Tal', medianHr: 0.01 });
  });

  it('is not estimated when every rune is priced', async () => {
    await seedCrests();
    for (const [r, p] of [['Tal', 0.01], ['Thul', 0.02], ['Ort', 0.03], ['Amn', 0.04]] as const) {
      await setPrice('Rune', `${r} Rune`, p);
    }
    const sp = (await topItemsBySlot(pool, F)).offhand[0];
    expect(sp.runeCostHr).toBe(0.1);
    expect(sp.runeCostEstimated).toBe(false);
  });

  it('has no rune data for a runeword without a recipe and for uniques', async () => {
    await seed(pool, [
      mkChar({ name: 'A', items: [{ name: 'Spirit Forge', quality: 'Normal', slot: 'Armor', runeword: true }, crest] }),
    ]);
    const r = await topItemsBySlot(pool, F);
    expect(r.armor[0]).toMatchObject({ itemName: 'Spirit Forge', runes: null, runeCostHr: null, runeCostEstimated: false });
    expect(r.helm[0]).toMatchObject({ runes: null, runeCostHr: null, runeCostEstimated: false });
  });

  it('returns empty slots for an empty cohort', async () => {
    const r = await topItemsBySlot(pool, F);
    expect(Object.keys(r)).toHaveLength(9);
    for (const arr of Object.values(r)) expect(arr).toEqual([]);
  });
});

describe('mercSummary', () => {
  it('summarises types and gear', async () => {
    const visage = { name: "Andariel's Visage", quality: 'Unique', slot: 'Helm', owner: 'merc' as const, invCode: 'xx' };
    await seed(pool, [
      mkChar({ name: 'A', merc: 'Defensive Auras', items: [visage] }),
      mkChar({ name: 'B', merc: 'Defensive Auras' }),
      mkChar({ name: 'C', merc: 'Fire Arrow' }),
    ]);
    const r = await mercSummary(pool, F);
    expect(r.topType).toBe('Defensive Auras');
    expect(r.typeFrequency[0]).toMatchObject({ mercType: 'Defensive Auras', act: 2, numOccurrences: 2 });
    expect(r.typeFrequency[1]).toMatchObject({ mercType: 'Fire Arrow', act: 1 });
    expect(r.topItemsBySlot.helm[0]).toMatchObject({ itemName: "Andariel's Visage", invCode: 'xx' });
  });

  it('is empty for an empty cohort', async () => {
    expect(await mercSummary(pool, F)).toEqual({ topType: '', typeFrequency: [], topItemsBySlot: {} });
  });
});

describe('skillFrequency', () => {
  it('lists skills with 20 hard points', async () => {
    await seed(pool, [
      mkChar({ name: 'A', skills: [['Blessed Hammer', 20], ['Vigor', 5]] }),
      mkChar({ name: 'B', skills: [['Blessed Hammer', 20]] }),
    ]);
    const r = await skillFrequency(pool, F);
    expect(r).toEqual([{ name: 'Blessed Hammer', numOccurrences: 2, totalSample: 2, pct: 100 }]);
  });

  it('is empty for an empty cohort', async () => {
    expect(await skillFrequency(pool, F)).toEqual([]);
  });
});

describe('levelDistribution', () => {
  it('applies minLevel and sorts ascending', async () => {
    await seed(pool, [
      mkChar({ name: 'A', level: 80 }),
      mkChar({ name: 'B', level: 90 }),
      mkChar({ name: 'C', level: 85 }),
      mkChar({ name: 'D', level: 90 }),
    ]);
    expect(await levelDistribution(pool, { ...F, minLevel: 85 })).toEqual([
      { level: 85, count: 1 },
      { level: 90, count: 2 },
    ]);
    expect(await levelDistribution(pool, { ...F, minLevel: 99 })).toEqual([]);
  });
});
