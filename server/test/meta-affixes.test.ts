import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Pool } from 'pg';
import { freshDb } from './helpers/db';
import { mkChar, seed, type MkItem } from './helpers/meta-seed';
import type { CharacterFilter } from '../src/api/filters';
import { affixModsBySlot, affixBucketKey } from '../src/api/meta/affixes';

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

const one = (name: string, item: MkItem) => mkChar({ name, items: [item] });

describe('affixBucketKey', () => {
  it('keeps the name except for skill tabs', () => {
    expect(affixBucketKey('maxhp', '+40 to Life')).toBe('maxhp');
    expect(affixBucketKey('item_addskill_tab', '+3 to Combat Skills (Paladin Only)')).toBe(
      'item_addskill_tab|Combat Skills (Paladin Only)',
    );
  });
});

describe('affixModsBySlot', () => {
  it('counts mods of a single rare ring', async () => {
    await seed(pool, [one('A', { quality: 'Rare', slot: 'Left Ring', mods: [['maxhp', 40], ['item_fastercastrate', 10]] })]);
    const r = await affixModsBySlot(pool, F);
    expect(r.ring.items).toBe(1);
    const life = r.ring.mods.find((m) => m.modName === 'maxhp')!;
    expect(life).toMatchObject({ count: 1, pct: 1, medianValue: 40 });
    expect(r.ring.mods.find((m) => m.modName === 'item_fastercastrate')!.displayLabel).toBe('Faster Cast Rate');
  });

  it('excludes Unique, Set, Normal and Runeword items', async () => {
    await seed(pool, [
      one('A', { quality: 'Unique', slot: 'Left Ring', mods: [['maxhp', 100]] }),
      one('B', { quality: 'Set', slot: 'Right Ring', mods: [['maxhp', 100]] }),
      one('C', { quality: 'Normal', slot: 'Helm', mods: [['maxhp', 100]] }),
      one('D', { quality: 'Normal', slot: 'Armor', runeword: true, mods: [['maxhp', 100]] }),
    ]);
    const r = await affixModsBySlot(pool, F);
    for (const s of Object.values(r)) expect(s).toEqual({ items: 0, mods: [] });
  });

  it('computes pct across characters', async () => {
    await seed(pool, [
      one('A', { quality: 'Rare', slot: 'Left Ring', mods: [['maxhp', 30]] }),
      one('B', { quality: 'Magic', slot: 'Left Ring', mods: [['fireresist', 15]] }),
    ]);
    const r = await affixModsBySlot(pool, F);
    expect(r.ring.items).toBe(2);
    expect(r.ring.mods.find((m) => m.modName === 'maxhp')!.pct).toBe(0.5);
  });

  it('matches the old median and nearest-rank p75', async () => {
    await seed(pool, [1, 2, 3, 4].map((v) => one(`E${v}`, { quality: 'Rare', slot: 'Amulet', mods: [['maxhp', v]] })));
    await seed(pool, [5, 1, 3].map((v) => one(`O${v}`, { quality: 'Rare', slot: 'Belt', mods: [['maxhp', v]] })));
    const r = await affixModsBySlot(pool, F);
    expect(r.amulet.mods[0]).toMatchObject({ medianValue: 2.5, p75Value: 3 });
    expect(r.belt.mods[0]).toMatchObject({ medianValue: 3, p75Value: 5 });
  });

  it('sorts by count', async () => {
    await seed(pool, [
      ...[1, 2, 3].map((i) => one(`A${i}`, { quality: 'Rare', slot: 'Left Ring', mods: [['maxhp', 25]] })),
      one('B', { quality: 'Crafted', slot: 'Left Ring', mods: [['item_fastercastrate', 10]] }),
    ]);
    const r = await affixModsBySlot(pool, F);
    expect(r.ring.mods[0]).toMatchObject({ modName: 'maxhp', count: 3 });
  });

  it('labels unknown mods with the name and category unknown', async () => {
    await seed(pool, [one('A', { quality: 'Rare', slot: 'Helm', mods: [['exotic_unknown_mod', 5]] })]);
    const m = (await affixModsBySlot(pool, F)).helm.mods[0];
    expect(m).toMatchObject({ modName: 'exotic_unknown_mod', displayLabel: 'exotic_unknown_mod', category: 'unknown' });
  });

  it('collapses skill-tab magnitudes and splits tabs', async () => {
    await seed(pool, [
      one('A', { quality: 'Rare', slot: 'Amulet', mods: [['item_addskill_tab', 3, '+3 to Combat Skills (Paladin Only)']] }),
      one('B', { quality: 'Rare', slot: 'Amulet', mods: [['item_addskill_tab', 1, '+1 to Combat Skills (Paladin Only)']] }),
      one('C', { quality: 'Rare', slot: 'Amulet', mods: [['item_addskill_tab', 1, '+1 to Warcries Skills (Barbarian Only)']] }),
    ]);
    const mods = (await affixModsBySlot(pool, F)).amulet.mods;
    const combat = mods.find((m) => m.modName === 'item_addskill_tab|Combat Skills (Paladin Only)')!;
    expect(combat).toMatchObject({ count: 2, displayLabel: 'Combat Skills (Paladin Only)', category: 'skill' });
    expect(mods.find((m) => m.modName === 'item_addskill_tab|Warcries Skills (Barbarian Only)')!.count).toBe(1);
  });

  it('counts a switch weapon under weapon and ignores charms', async () => {
    await seed(pool, [
      mkChar({
        name: 'A',
        items: [
          { quality: 'Rare', slot: 'Right Hand Switch', mods: [['maxhp', 10]] },
          { quality: 'Rare', charm: 'Small Charm', mods: [['maxhp', 10]] },
        ],
      }),
    ]);
    const r = await affixModsBySlot(pool, F);
    expect(r.weapon.items).toBe(1);
    expect(Object.values(r).reduce((s, x) => s + x.items, 0)).toBe(1);
  });

  it('never returns flag labels', async () => {
    await seed(pool, [one('A', { quality: 'Rare', slot: 'Helm', mods: [['corrupted', 1, 'Corrupted'], ['maxhp', 5]] })]);
    const mods = (await affixModsBySlot(pool, F)).helm.mods;
    expect(mods.map((m) => m.modName)).toEqual(['maxhp']);
  });

  it('tolerates non-number mod values', async () => {
    await seed(pool, [one('A', { quality: 'Rare', slot: 'Helm', mods: [['maxhp', 'x' as unknown as number]] })]);
    expect((await affixModsBySlot(pool, F)).helm.mods[0]).toMatchObject({ count: 1, medianValue: 0 });
  });

  it('returns the top 15 mods only', async () => {
    const mods: Array<[string, number]> = Array.from({ length: 20 }, (_, i) => [`mod_${String(i).padStart(2, '0')}`, i]);
    await seed(pool, [one('A', { quality: 'Rare', slot: 'Helm', mods })]);
    expect((await affixModsBySlot(pool, F)).helm.mods).toHaveLength(15);
  });

  it('gives every slot an empty entry for an empty cohort', async () => {
    const r = await affixModsBySlot(pool, F);
    expect(Object.keys(r)).toHaveLength(9);
    for (const s of Object.values(r)) expect(s).toEqual({ items: 0, mods: [] });
  });
});
