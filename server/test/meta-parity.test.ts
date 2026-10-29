import { describe, it, expect } from 'vitest';
import { shapeTopItemsBySlot, type UsageRow } from '../src/api/meta/items';

import amazonLightningFury from '../../src/lib/validation/fixtures/amazon-lightning-fury.json';
import assassinLightningTrapsin from '../../src/lib/validation/fixtures/assassin-lightning-trapsin.json';
import barbarianWhirlwind from '../../src/lib/validation/fixtures/barbarian-whirlwind.json';
import druidWindTornado from '../../src/lib/validation/fixtures/druid-wind-tornado.json';
import necromancerBoneSpear from '../../src/lib/validation/fixtures/necromancer-bone-spear.json';
import paladinHammerdin from '../../src/lib/validation/fixtures/paladin-hammerdin.json';
import sorceressBlizzard from '../../src/lib/validation/fixtures/sorceress-blizzard.json';

type MetaTopItem = { itemName: string; itemType: string; count: number; pct: number };
type Fixture = {
  _meta: { build: string; api?: string };
  itemUsage: UsageRow[];
  meta?: { topItemsBySlot: Record<string, MetaTopItem[]> };
};

const FIXTURES = [
  amazonLightningFury,
  assassinLightningTrapsin,
  barbarianWhirlwind,
  druidWindTornado,
  necromancerBoneSpear,
  paladinHammerdin,
  sorceressBlizzard,
] as unknown as Fixture[];

const COVERAGE_FLOOR = 0.95;
// Unique charms have no equipment slot by design, so they are not slot items.
const UNIQUE_CHARM_NAMES = new Set(['Hellfire Torch', 'Annihilus', "Gheed's Fortune"]);

describe('meta shaping parity per canonical build', () => {
  for (const f of FIXTURES) {
    describe(f._meta.build, () => {
      const shaped = shapeTopItemsBySlot(f.itemUsage);

      it(`slot coverage >= ${COVERAGE_FLOOR * 100}%`, () => {
        const all = Object.values(shapeTopItemsBySlot(f.itemUsage, Infinity)).flat();
        const slotItems = f.itemUsage.filter((r) => !UNIQUE_CHARM_NAMES.has(r.item));
        expect(all.length / slotItems.length, `${f._meta.build}: unslotted items`).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
      });

      it('no invented items and pct preserved', () => {
        const byName = new Map(f.itemUsage.map((r) => [r.item, r]));
        for (const [slot, items] of Object.entries(shaped)) {
          for (const entry of items) {
            const row = byName.get(entry.itemName);
            expect(row, `${slot}/${entry.itemName} not in API response`).toBeDefined();
            expect(entry.pct, `${slot}/${entry.itemName} pct`).toBe(row!.pct);
          }
        }
      });

      it('meta key is present once the fixture was captured from our API', () => {
        if (f._meta.api) expect(f.meta, `${f._meta.build}: _meta.api set but meta missing`).toBeDefined();
      });

      it.skipIf(!f.meta)('captured /meta topItemsBySlot equals shaping of itemUsage', () => {
        const projected = Object.fromEntries(
          Object.entries(f.meta!.topItemsBySlot).map(([slot, items]) => [
            slot,
            items.map(({ itemName, itemType, count, pct }) => ({ itemName, itemType, count, pct })),
          ]),
        );
        expect(projected).toEqual(shaped);
      });
    });
  }
});
