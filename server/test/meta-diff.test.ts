import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { freshDb } from './helpers/db';
import { mkChar, seed } from './helpers/meta-seed';
import { loadConfig } from '../src/config';
import { createApp } from '../src/api/app';
import { diffCharacter, findDiffCharacter, type DiffGuide, type DiffUser } from '../src/api/meta/diff';
import { META_SLOTS } from '../src/core/static-data';
import type { AffixSlot, MetaSlot, TopItem } from '../src/api/meta/types';

const cfg = loadConfig({ DATABASE_URL: 'postgres://x', CURRENT_SEASON: '14' } as any);
const api = '/api/v1';

const top = (itemName: string, itemType: TopItem['itemType'] = 'Unique'): TopItem => ({
  itemName, itemType, count: 10, pct: 50, invCode: null, price: null, runes: null, runeCostHr: null, runeCostEstimated: false,
});
const mod = (modName: string, displayLabel: string, pct: number) => ({
  modName, displayLabel, category: 'x', count: 1, pct, medianValue: 1, p75Value: 1,
});
const emptyGuide = (): DiffGuide => ({
  topItemsBySlot: Object.fromEntries(META_SLOTS.map((s) => [s, []])) as unknown as Record<MetaSlot, TopItem[]>,
  affixModsBySlot: Object.fromEntries(META_SLOTS.map((s) => [s, { items: 0, mods: [] }])) as unknown as Record<MetaSlot, AffixSlot>,
  poolMercType: null,
});
const guide = (): DiffGuide => {
  const g = emptyGuide();
  g.topItemsBySlot.ring = [top('Raven Frost')];
  g.topItemsBySlot.weapon = [top('Heart of the Oak', 'Runeword')];
  g.affixModsBySlot.ring = { items: 100, mods: [mod('item_fastercastrate', 'Faster Cast Rate', 0.91), mod('item_maxhp', 'Life', 0.76)] };
  g.poolMercType = 'Holy Freeze';
  return g;
};
const ring = (mods: Array<{ name: string; label: string }> = [], over: Partial<DiffUser['items'][number]> = {}): DiffUser['items'][number] => ({
  slot: 'Left Ring', isSwitch: false, name: 'Ring', quality: 'Rare', baseName: 'Ring', isRuneword: false, mods, ...over,
});
const user = (over: Partial<DiffUser> = {}): DiffUser => ({
  name: 'MyChar', account: 'Tester', level: 90, className: 'Paladin', mode: 'softcore',
  items: [ring([{ name: 'item_fastercastrate', label: 'item_fastercastrate' }])],
  mercDescription: 'Holy Freeze',
  ...over,
});

describe('diffCharacter', () => {
  it('flags slot mismatch: pool top is Raven Frost but user wears a Rare Ring', () => {
    const r = diffCharacter(user(), guide()).slots.ring;
    expect(r.poolTopItemName).toBe('Raven Frost');
    expect(r.userItemName).toMatch(/Rare Ring/);
    expect(r.userMatchesPoolTop).toBe(false);
    expect(r.userItemQuality).toBe('Rare');
  });

  it('marks affix coverage: has FCR, missing Life', () => {
    const mods = diffCharacter(user(), guide()).slots.ring.poolTopAffixMods;
    expect(mods.find((m) => m.modName === 'item_fastercastrate')?.userHas).toBe(true);
    expect(mods.find((m) => m.modName === 'item_maxhp')?.userHas).toBe(false);
  });

  it('reports a match on the exact pool top unique', () => {
    const r = diffCharacter(user({ items: [ring([], { name: 'Raven Frost', quality: 'Unique' })] }), guide());
    expect(r.slots.ring.userMatchesPoolTop).toBe(true);
    expect(r.slots.ring.userItemName).toBe('Raven Frost');
  });

  it('empty slot: userItemName null, no match', () => {
    const r = diffCharacter(user({ items: [] }), guide()).slots.ring;
    expect(r.userItemName).toBeNull();
    expect(r.userItemQuality).toBeNull();
    expect(r.userMatchesPoolTop).toBe(false);
  });

  it('names a runeword without its own name as Runeword (base)', () => {
    const r = diffCharacter(
      user({ items: [{ slot: 'Right Hand', isSwitch: false, name: 'Mace', quality: 'Normal', baseName: 'Mace', isRuneword: true, mods: [] }] }),
      guide(),
    );
    expect(r.slots.weapon.userItemName).toBe('Runeword (Mace)');
  });

  it('merc: match, mismatch and null', () => {
    const r = diffCharacter(user(), guide());
    expect(r).toMatchObject({ mercTypeMatchesPool: true, userMercType: 'Holy Freeze', poolMercType: 'Holy Freeze' });
    expect(diffCharacter(user({ mercDescription: 'Might Merc' }), guide())).toMatchObject({ mercTypeMatchesPool: false, userMercType: 'Might Merc' });
    expect(diffCharacter(user(), { ...guide(), poolMercType: null }).mercTypeMatchesPool).toBeNull();
    expect(diffCharacter(user({ mercDescription: null }), guide()).mercTypeMatchesPool).toBeNull();
  });

  it('carries the metadata', () => {
    expect(diffCharacter(user(), guide())).toMatchObject({
      characterName: 'MyChar', accountName: 'Tester', characterLevel: 90, className: 'Paladin', mode: 'softcore',
    });
  });

  it('slot without a pool top has poolTopItemName null', () => {
    expect(diffCharacter(user(), guide()).slots.helm.poolTopItemName).toBeNull();
  });

  it('a main-hand unique beats a weapon-switch rare', () => {
    const items: DiffUser['items'] = [
      { slot: 'Right Hand Switch', isSwitch: true, name: 'Some Rare', quality: 'Rare', baseName: 'Wand', isRuneword: false, mods: [] },
      { slot: 'Right Hand', isSwitch: false, name: 'Heart of the Oak', quality: 'Unique', baseName: 'Flail', isRuneword: true, mods: [] },
    ];
    const w = diffCharacter(user({ items }), guide()).slots.weapon;
    expect(w.userItemName).toBe('Heart of the Oak');
    expect(w.userMatchesPoolTop).toBe(true);
  });

  it('uses the switch item when there is no main-hand item', () => {
    const items: DiffUser['items'] = [
      { slot: 'Right Hand Switch', isSwitch: true, name: 'Wand', quality: 'Rare', baseName: 'Wand', isRuneword: false, mods: [] },
    ];
    expect(diffCharacter(user({ items }), guide()).slots.weapon.userItemName).toBe('Rare Wand');
  });

  it('matches a skill tab by tab name, not by the magnitude', () => {
    const g = emptyGuide();
    g.affixModsBySlot.amulet = {
      items: 10,
      mods: [
        mod('item_addskill_tab|Combat Skills (Paladin Only)', 'Combat Skills (Paladin Only)', 0.8),
        mod('item_addskill_tab|Cold Skills (Sorceress Only)', 'Cold Skills (Sorceress Only)', 0.1),
      ],
    };
    const amulet: DiffUser['items'][number] = {
      slot: 'Amulet', isSwitch: false, name: 'Amulet', quality: 'Rare', baseName: 'Amulet', isRuneword: false,
      mods: [{ name: 'item_addskill_tab', label: '+2 to Combat Skills (Paladin Only)' }],
    };
    const m = diffCharacter(user({ items: [amulet] }), g).slots.amulet.poolTopAffixMods;
    expect(m.map((x) => x.userHas)).toEqual([true, false]);
  });

  it('caps the affix list at 5', () => {
    const g = emptyGuide();
    g.affixModsBySlot.ring = { items: 1, mods: Array.from({ length: 8 }, (_, i) => mod(`m${i}`, `M${i}`, 0.5)) };
    expect(diffCharacter(user(), g).slots.ring.poolTopAffixMods).toHaveLength(5);
  });
});

let pool: Pool;
let app: Express;

beforeAll(async () => {
  pool = await freshDb();
  await seed(pool, [
    mkChar({
      name: 'MC-Meeks', account: 'Meeksy', level: 95, merc: 'Defiance',
      items: [
        { name: 'Harlequin Crest', quality: 'Unique', slot: 'Helm', baseName: 'Shako' },
        { name: 'Ring', quality: 'Rare', slot: 'Left Ring', baseName: 'Ring', mods: [['item_fastercastrate', 10]] },
      ],
    }),
    mkChar({ name: 'Foo', account: 'Foo-Acc', level: 88, items: [{ name: 'Harlequin Crest', quality: 'Unique', slot: 'Helm', baseName: 'Shako' }] }),
    mkChar({ name: 'AcctLow', account: 'LvlAcc', level: 81 }),
    mkChar({ name: 'AcctHigh', account: 'LvlAcc', level: 99 }),
    mkChar({ name: 'SharedAcc', account: 'Other', level: 85 }),
    mkChar({ name: 'Holder', account: 'SharedAcc', level: 99 }),
    mkChar({ name: 'HcOnly', mode: 'hardcore', level: 90, items: [{ name: 'Stone of Jordan', quality: 'Unique', slot: 'Left Ring', baseName: 'Ring' }] }),
    mkChar({ name: 'SameName', mode: 'softcore', level: 90 }),
    mkChar({ name: 'SameName', mode: 'hardcore', level: 90 }),
  ]);
  app = createApp({ pool, cfg });
});
afterAll(async () => {
  await pool.end();
});

describe('findDiffCharacter', () => {
  const idOf = async (name: string, mode = 'softcore') =>
    Number((await pool.query('select id from characters where name = $1 and mode = $2', [name, mode])).rows[0].id);

  it('finds by character name, case-insensitive', async () => {
    expect((await findDiffCharacter(pool, 14, 'softcore', 'mc-meeks'))?.id).toBe(await idOf('MC-Meeks'));
    expect((await findDiffCharacter(pool, 14, 'softcore', 'MC-MEEKS'))?.id).toBe(await idOf('MC-Meeks'));
  });
  it('finds by account name, case-insensitive', async () => {
    expect((await findDiffCharacter(pool, 14, 'softcore', 'MEEKSY'))?.id).toBe(await idOf('MC-Meeks'));
  });
  it('returns null without a match', async () => {
    expect(await findDiffCharacter(pool, 14, 'softcore', 'nope')).toBeNull();
    expect(await findDiffCharacter(pool, 13, 'softcore', 'Foo')).toBeNull();
  });
  it('prefers a character name over an account name', async () => {
    expect((await findDiffCharacter(pool, 14, 'softcore', 'sharedacc'))?.id).toBe(await idOf('SharedAcc'));
  });
  it('an account picks its highest-level character', async () => {
    expect((await findDiffCharacter(pool, 14, 'softcore', 'lvlacc'))?.id).toBe(await idOf('AcctHigh'));
  });
  it('falls back to the other mode and reports it', async () => {
    expect(await findDiffCharacter(pool, 14, 'softcore', 'HcOnly')).toMatchObject({ mode: 'hardcore' });
  });
  it('the requested mode wins for a name present in both', async () => {
    expect(await findDiffCharacter(pool, 14, 'hardcore', 'SameName')).toMatchObject({ mode: 'hardcore' });
    expect(await findDiffCharacter(pool, 14, 'softcore', 'SameName')).toMatchObject({ mode: 'softcore' });
  });
});

describe('GET /meta/diff', () => {
  const get = (qs: string) => request(app).get(`${api}/meta/diff${qs}`);

  it('returns the diff of a named character against the cohort', async () => {
    const r = await get('?gameMode=softcore&classes=Paladin&char=mc-meeks');
    expect(r.status).toBe(200);
    expect(r.body.diff).toMatchObject({ characterName: 'MC-Meeks', accountName: 'Meeksy', mode: 'softcore', characterLevel: 95 });
    expect(r.body.diff.slots.helm.poolTopItemName).toBe('Harlequin Crest');
    expect(r.body.diff.slots.helm.userMatchesPoolTop).toBe(true);
    expect(r.body.diff.userMercType).toBe('Defiance');
  });

  it('cache key includes the character, case-insensitively', async () => {
    const a = await get('?gameMode=softcore&classes=Paladin&char=Foo');
    const b = await get('?gameMode=softcore&classes=Paladin&char=MC-MEEKS');
    expect(a.body.diff.characterName).toBe('Foo');
    expect(b.body.diff.characterName).toBe('MC-Meeks');
    const c = await get('?gameMode=softcore&classes=Paladin&char=mc-meeks');
    expect(c.body).toEqual(b.body);
  });

  it('a hardcore character found from gameMode=softcore reports mode hardcore', async () => {
    const r = await get('?gameMode=softcore&classes=Paladin&char=HcOnly');
    expect(r.status).toBe(200);
    expect(r.body.diff.mode).toBe('hardcore');
  });

  it('a cross-mode character is compared against the cohort of its own mode', async () => {
    const r = await get('?gameMode=softcore&char=HcOnly');
    expect(r.body.diff.mode).toBe('hardcore');
    expect(r.body.diff.slots.ring.poolTopItemName).toBe('Stone of Jordan');
  });

  it('blank or missing char is 404', async () => {
    for (const qs of ['?gameMode=softcore&char=', '?gameMode=softcore&char=%20%20', '?gameMode=softcore']) {
      const r = await get(qs);
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: { message: 'Character not found' } });
    }
  });

  it('unknown character is 404 with the error body', async () => {
    const r = await get('?gameMode=softcore&classes=Paladin&char=No%20Such');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: { message: 'Character not found' } });
  });

  it('an empty cohort gives null pool tops', async () => {
    const r = await get('?gameMode=softcore&classes=Druid&char=Foo');
    expect(r.status).toBe(200);
    for (const s of META_SLOTS) {
      expect(r.body.diff.slots[s].poolTopItemName).toBeNull();
      expect(r.body.diff.slots[s].poolTopAffixMods).toEqual([]);
    }
    expect(r.body.diff.poolMercType).toBeNull();
    expect(r.body.diff.mercTypeMatchesPool).toBeNull();
  });

  it('a different cohort gives a different body for the same character', async () => {
    const a = await get('?gameMode=softcore&classes=Paladin&char=Foo');
    const b = await get('?gameMode=softcore&classes=Sorceress&char=Foo');
    expect(a.body.diff.slots.helm.poolTopItemName).toBe('Harlequin Crest');
    expect(b.body.diff.slots.helm.poolTopItemName).toBeNull();
  });
});
