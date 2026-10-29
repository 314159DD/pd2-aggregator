import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { upsertListings } from '../src/db/market-repo';
import { upsertCharacter } from '../src/db/characters-repo';
import { toCompact, enrichRaw } from '../src/core/compact';
import { computeItemPrices, getPrices, recomputeGearValues } from '../src/db/prices-repo';
import { runPriceJob } from '../src/collector/jobs';
import ladder from './fixtures/character-ladder.json';

const NOW = new Date('2026-10-29T12:00:00Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
let pool: Pool;
let seq = 0;
beforeEach(async () => { pool = await freshDb(); seq = 0; });
afterEach(async () => { await pool.end(); });

type L = {
  name?: string; quality?: string; runeword?: string | null; hc?: boolean; ladder?: boolean; corrupted?: boolean;
  price: number; state: 'open' | 'sold'; lastSeenDays?: number; goneDays?: number; miss?: number;
};

async function add(l: L): Promise<void> {
  const id = `l${++seq}`;
  await upsertListings(pool, [{
    id, item_name: l.name ?? 'Harlequin Crest', quality: l.quality ?? 'Unique', base_name: 'Shako',
    runeword_key: l.runeword ?? null, is_corrupted: l.corrupted ?? false, is_ladder: l.ladder ?? true,
    is_hardcore: l.hc ?? false, price_text: String(l.price), price_hr: l.price, created_at: null, bumped_at: null,
  }], ago(l.lastSeenDays ?? 0));
  if (l.state === 'sold') {
    await pool.query('update market_listings set gone_at = $2, miss_count = $3 where id = $1',
      [id, ago(l.goneDays ?? 1), l.miss ?? 2]);
  }
}
const open = async (ps: number[], o: Partial<L> = {}) => { for (const price of ps) await add({ price, state: 'open', ...o }); };
const sold = async (ps: number[], o: Partial<L> = {}) => { for (const price of ps) await add({ price, state: 'sold', ...o }); };
const prices = async (mode: 'softcore' | 'hardcore' = 'softcore') => (await getPrices(pool, mode)).items;

describe('computeItemPrices', () => {
  it('uses the ask median for 3 open listings', async () => {
    await open([0.2, 0.3, 0.4]);
    expect(await computeItemPrices(pool, NOW)).toEqual({ priced: 1 });
    expect(await prices()).toEqual([{ itemType: 'Unique', name: 'Harlequin Crest', medianHr: 0.3, samples: 3, source: 'ask' }]);
  });

  it('uses the sold median for 6 sold listings', async () => {
    await sold([1, 2, 3, 4, 5, 6]);
    await computeItemPrices(pool, NOW);
    expect(await prices()).toEqual([{ itemType: 'Unique', name: 'Harlequin Crest', medianHr: 3.5, samples: 6, source: 'sold' }]);
  });

  it('5 sold plus 2 open is sold; 4 sold plus 2 open is no price', async () => {
    await sold([1, 2, 3, 4, 5]);
    await open([9, 9]);
    await computeItemPrices(pool, NOW);
    expect((await prices())[0]).toMatchObject({ medianHr: 3, source: 'sold', samples: 5 });
    await pool.query('delete from market_listings');
    await sold([1, 2, 3, 4]);
    await open([9, 9]);
    expect(await computeItemPrices(pool, NOW)).toEqual({ priced: 0 });
    expect(await prices()).toEqual([]);
  });

  it('2 open listings give no price', async () => {
    await open([1, 2]);
    await computeItemPrices(pool, NOW);
    expect(await prices()).toEqual([]);
  });

  it('ignores stale, corrupted, non-ladder, single-miss and old-sold listings', async () => {
    await open([1, 1]);
    await open([1], { lastSeenDays: 8 });
    await open([1], { corrupted: true });
    await open([1], { ladder: false });
    await sold([1, 1, 1, 1, 1], { miss: 1 });
    await sold([1, 1, 1, 1, 1], { goneDays: 8 });
    await computeItemPrices(pool, NOW);
    expect(await prices()).toEqual([]);
  });

  it('prices hardcore and softcore separately', async () => {
    await open([1, 1, 1]);
    await open([5, 5, 5], { hc: true });
    await computeItemPrices(pool, NOW);
    expect((await prices('softcore'))[0].medianHr).toBe(1);
    expect((await prices('hardcore'))[0].medianHr).toBe(5);
  });

  it('prices runeword listings as Runeword and skips other qualities', async () => {
    await open([2, 2, 2], { name: 'Enigma', quality: 'Normal', runeword: 'enigma' });
    await open([2, 2, 2], { name: 'Jewel', quality: 'Rare' });
    await computeItemPrices(pool, NOW);
    expect(await prices()).toEqual([{ itemType: 'Runeword', name: 'Enigma', medianHr: 2, samples: 3, source: 'ask' }]);
  });

  it('removes stale rows on a second run', async () => {
    await open([1, 1, 1]);
    await computeItemPrices(pool, NOW);
    await pool.query('delete from market_listings where id = $1', ['l1']);
    await computeItemPrices(pool, NOW);
    expect(await prices()).toEqual([]);
    expect((await getPrices(pool, 'softcore')).computedAt).toBeNull();
  });
});

describe('gear value', () => {
  const c = toCompact(ladder as any, 'MC-MEEKS');
  const key = (i: { isRuneword: boolean; quality: string }) => (i.isRuneword ? 'Runeword' : i.quality);
  const priceable = c.items.filter(
    (i) => i.owner === 'player' && (i.isRuneword || ['Unique', 'Set'].includes(i.quality)) && (i.slot !== null || i.isCharm),
  );
  const distinct = [...new Map(priceable.map((i) => [`${key(i)}|${i.name}`, i])).values()];
  const setPrice = (i: (typeof distinct)[number], hr: number) =>
    pool.query(
      `insert into item_prices (mode, item_type, item_name, median_hr, samples, source, computed_at)
       values ('softcore', $1, $2, $3, 3, 'ask', now()) on conflict do nothing`,
      [key(i), i.name, hr],
    );
  const gear = async () =>
    (await pool.query('select gear_value_hr, gear_value_partial, merc_gear_value_hr from characters')).rows[0];
  const ingest = () => upsertCharacter(pool, 14, c, enrichRaw(ladder as any, 'MC-MEEKS'));

  it('fixture has at least three distinct priceable worn items', () => {
    expect(distinct.length).toBeGreaterThanOrEqual(3);
  });

  it('sums priced items and flags partial', async () => {
    await ingest();
    await setPrice(distinct[0], 1.25);
    await setPrice(distinct[1], 2);
    expect(await recomputeGearValues(pool, { season: 14 })).toBe(1);
    const g = await gear();
    const expected = priceable.reduce(
      (s, i) => s + (i.name === distinct[0].name ? 1.25 : i.name === distinct[1].name ? 2 : 0), 0);
    expect(Number(g.gear_value_hr)).toBeCloseTo(expected, 2);
    expect(g.gear_value_partial).toBe(true);
  });

  it('is not partial when every priceable item has a price', async () => {
    await ingest();
    for (const i of distinct) await setPrice(i, 1);
    const id = Number((await pool.query('select id from characters')).rows[0].id);
    await recomputeGearValues(pool, { characterIds: [id] });
    const g = await gear();
    expect(g.gear_value_partial).toBe(false);
    expect(Number(g.gear_value_hr)).toBe(priceable.length);
  });

  it('sets gear value on the ingest path without the job', async () => {
    for (const i of distinct) await setPrice(i, 1);
    await ingest();
    const g = await gear();
    expect(Number(g.gear_value_hr)).toBe(priceable.length);
    expect(Number(g.gear_value_hr)).toBeGreaterThan(0);
    expect(g.gear_value_partial).toBe(false);
  });

  const item = (o: Partial<(typeof c.items)[number]>): (typeof c.items)[number] => ({
    owner: 'player', slot: 'Head', isSwitch: false, isCharm: false, name: 'X', quality: 'Unique',
    baseName: null, baseType: null, isRuneword: false, invCode: null, mods: [], ...o,
  } as any);
  const synth = async (name: string, items: (typeof c.items)) => {
    await upsertCharacter(pool, 14, { ...c, name, items }, enrichRaw(ladder as any, 'MC-MEEKS'));
    return (await pool.query(
      'select gear_value_hr, gear_value_partial, merc_gear_value_hr from characters where name = $1', [name])).rows[0];
  };
  const price = (n: string, hr: number) => setPrice({ isRuneword: false, quality: 'Unique', name: n } as any, hr);

  it('counts worn switch items and charms; merc sum only when merc items exist', async () => {
    await price('Worn', 1); await price('Swap', 2); await price('Charm', 4); await price('Hired', 8);
    const base = [
      item({ name: 'Worn' }),
      item({ name: 'Swap', slot: 'Switch Weapon', isSwitch: true }),
      item({ name: 'Charm', slot: null, isCharm: true }),
      item({ name: 'Worn', slot: null }), // unworn, not counted
    ];
    const noMerc = await synth('NoMerc', base);
    expect(Number(noMerc.gear_value_hr)).toBe(7);
    expect(noMerc.merc_gear_value_hr).toBeNull();
    const withMerc = await synth('WithMerc', [...base, item({ name: 'Hired', owner: 'merc' })]);
    expect(Number(withMerc.gear_value_hr)).toBe(7);
    expect(Number(withMerc.merc_gear_value_hr)).toBe(8);
  });

  it('gives a character without priceable items 0 and false', async () => {
    const g = await synth('Plain', [item({ name: 'Cap', quality: 'Normal' })]);
    expect(Number(g.gear_value_hr)).toBe(0);
    expect(g.gear_value_partial).toBe(false);
    expect(g.merc_gear_value_hr).toBeNull();
  });

  it('runPriceJob prices from listings and updates the season', async () => {
    await ingest();
    const target = distinct[0];
    await open([1, 1, 1], {
      name: target.name, quality: target.isRuneword ? 'Normal' : target.quality,
      runeword: target.isRuneword ? 'x' : null,
    });
    const r = await runPriceJob({ pool, cfg: { currentSeason: 14 } }, NOW);
    expect(r).toEqual({ priced: 1, charactersChanged: 1 });
    const mine = priceable.filter((i) => i.name === target.name).length;
    expect(Number((await gear()).gear_value_hr)).toBe(mine);
    expect(await runPriceJob({ pool, cfg: { currentSeason: 14 } }, NOW)).toEqual({ priced: 1, charactersChanged: 0 });
  });
});
