import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { upsertListings } from '../src/db/market-repo';
import { upsertCharacter } from '../src/db/characters-repo';
import { toCompact, enrichRaw } from '../src/core/compact';
import ladder from './fixtures/character-ladder.json';
import { getPricesFor, computeItemPrices, getPrices, getPriceMap, getRunePrices, recomputeGearValues } from '../src/db/prices-repo';

const NOW = new Date('2026-10-29T12:00:00Z');
let pool: Pool;
let seq = 0;
beforeEach(async () => { pool = await freshDb(); seq = 0; });
afterEach(async () => { await pool.end(); });

async function add(o: { name: string; quality?: string; base?: string; price: number; hc?: boolean }): Promise<void> {
  await upsertListings(pool, [{
    id: `r${++seq}`, item_name: o.name, quality: o.quality ?? 'Normal', base_name: o.base ?? o.name,
    runeword_key: null, is_corrupted: false, is_ladder: true, is_hardcore: o.hc ?? false,
    price_text: String(o.price), price_hr: o.price, created_at: null, bumped_at: null,
  }], NOW);
}
const ber = async (ps: number[], o: { quality?: string; hc?: boolean } = {}) => {
  for (const price of ps) await add({ name: 'Ber Rune', price, ...o });
};

describe('rune prices', () => {
  it('prices a rune from 3 open listings and exposes it by short name', async () => {
    await ber([1, 1.2, 1.4]);
    await computeItemPrices(pool, NOW);
    expect((await getPrices(pool, 'softcore')).items).toEqual([
      { itemType: 'Rune', name: 'Ber Rune', medianHr: 1.2, samples: 3, source: 'ask' },
    ]);
    expect(await getRunePrices(pool, 'softcore')).toEqual(new Map([['Ber', 1.2]]));
  });

  it('needs 3 samples', async () => {
    await ber([1, 1.2]);
    await add({ name: 'Harlequin Crest', quality: 'Unique', base: 'Shako', price: 1 });
    await add({ name: 'Harlequin Crest', quality: 'Unique', base: 'Shako', price: 1 });
    await add({ name: 'Harlequin Crest', quality: 'Unique', base: 'Shako', price: 1 });
    await computeItemPrices(pool, NOW);
    expect((await getPrices(pool, 'softcore')).items.map((x) => x.itemType)).toEqual(['Unique']);
    expect((await getRunePrices(pool, 'softcore')).size).toBe(0);
  });

  it('a Ber Rune listing with quality Unique is not a rune', async () => {
    await ber([1, 1, 1], { quality: 'Unique' });
    await computeItemPrices(pool, NOW);
    const items = (await getPrices(pool, 'softcore')).items;
    expect(items.every((x) => x.itemType !== 'Rune')).toBe(true);
  });

  it('prices hardcore separately', async () => {
    await ber([1, 1, 1]);
    await ber([5, 6, 7], { hc: true });
    await computeItemPrices(pool, NOW);
    expect((await getRunePrices(pool, 'softcore')).get('Ber')).toBe(1);
    expect((await getRunePrices(pool, 'hardcore')).get('Ber')).toBe(6);
  });

  it('keeps unique pricing and getPriceMap excludes runes', async () => {
    await ber([1, 1, 1]);
    for (const p of [0.2, 0.3, 0.4]) await add({ name: 'Harlequin Crest', quality: 'Unique', base: 'Shako', price: p });
    await computeItemPrices(pool, NOW);
    const m = await getPriceMap(pool, 'softcore');
    expect(m.get('Unique|Harlequin Crest')).toEqual({ medianHr: 0.3, samples: 3, source: 'ask' });
    expect([...m.keys()].some((k) => k.startsWith('Rune|'))).toBe(false);
    expect(m.size).toBe(1);
  });

  it('recomputeGearValues ignores a worn Ber Rune even when Ber Rune is priced', async () => {
    const c = toCompact(ladder as any, 'MC-MEEKS');
    const it = (o: Record<string, unknown>) => ({
      owner: 'player', slot: 'Head', isSwitch: false, isCharm: false, name: 'X', quality: 'Unique',
      baseName: null, baseType: null, isRuneword: false, invCode: null, mods: [], ...o,
    }) as any;
    await upsertCharacter(pool, 14, {
      ...c, name: 'Runner',
      items: [it({ name: 'Harlequin Crest' }), it({ name: 'Ber Rune', quality: 'Normal', slot: 'Weapon', baseName: 'Ber Rune' })],
    }, enrichRaw(ladder as any, 'MC-MEEKS'));
    const gear = async () => (await pool.query('select gear_value_hr, gear_value_partial from characters')).rows[0];
    for (const p of [0.2, 0.3, 0.4]) await add({ name: 'Harlequin Crest', quality: 'Unique', base: 'Shako', price: p });

    // Before any rune price exists.
    await computeItemPrices(pool, NOW);
    await recomputeGearValues(pool, { season: 14 });
    const before = await gear();
    expect(Number(before.gear_value_hr)).toBe(0.3);
    expect(before.gear_value_partial).toBe(false);

    // Now Ber Rune is priced too.
    await ber([5, 5, 5]);
    await computeItemPrices(pool, NOW);
    expect((await getRunePrices(pool, 'softcore')).get('Ber')).toBe(5);
    await recomputeGearValues(pool, { season: 14 });
    expect(await gear()).toEqual(before);
  });

  it('getPricesFor never returns Rune rows', async () => {
    await ber([1, 1, 1]);
    await computeItemPrices(pool, NOW);
    expect((await getPrices(pool, 'softcore')).items).toHaveLength(1);
    expect((await getPricesFor(pool, 'softcore', ['Ber Rune'])).size).toBe(0);
  });
});
