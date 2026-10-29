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
  _meta: { build: string };
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

describe('meta shaping parity per canonical build', () => {
  for (const f of FIXTURES) {
    describe(f._meta.build, () => {
      const shaped = shapeTopItemsBySlot(f.itemUsage);

      it(`slot coverage >= ${COVERAGE_FLOOR * 100}%`, () => {
        const all = Object.values(shapeTopItemsBySlot(f.itemUsage, Infinity)).flat();
        expect(all.length / f.itemUsage.length, `${f._meta.build}: unslotted items`).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
      });

      it('no invented items and pct preserved', () => {
        const byName = new Map(f.itemUsage.map((r) => [r.item, r]));
        for (const [slot, items] of Object.entries(shaped)) {
          for (const it of items) {
            const row = byName.get(it.itemName);
            expect(row, `${slot}/${it.itemName} not in API response`).toBeDefined();
            expect(it.pct, `${slot}/${it.itemName} pct`).toBe(row!.pct);
          }
        }
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
