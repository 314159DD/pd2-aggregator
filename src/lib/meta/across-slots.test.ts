import { describe, expect, it } from "vitest";
import { acrossSlots } from "./across-slots";
import { META_SLOTS, type AffixSlot, type MetaSlot } from "./types";

const mod = (modName: string, displayLabel: string, count: number) => ({
  modName, displayLabel, category: "x", count, pct: 0, medianValue: 0, p75Value: 0,
});
const empty = (): Record<MetaSlot, AffixSlot> =>
  Object.fromEntries(META_SLOTS.map((s) => [s, { items: 0, mods: [] }])) as unknown as Record<MetaSlot, AffixSlot>;

describe("acrossSlots", () => {
  it("sums counts over the exact item totals", () => {
    const d = empty();
    d.weapon = { items: 10, mods: [mod("fastercastrate", "Faster Cast Rate", 5)] };
    d.helm = { items: 30, mods: [mod("fastercastrate", "Faster Cast Rate", 5)] };
    const r = acrossSlots(d);
    expect(r.totalItems).toBe(40);
    expect(r.mods).toEqual([{ modName: "fastercastrate", displayLabel: "Faster Cast Rate", count: 10, pct: 0.25 }]);
  });

  it("excludes resists, proc mods and meta flags", () => {
    const d = empty();
    d.ring = {
      items: 4,
      mods: [mod("fireresist", "Fire Resist", 4), mod("item_singleskill", "+1 Skill", 2), mod("item_skillonhit", "On hit", 1), mod("x", "Corrupted", 3), mod("ok", "OK", 1)],
    };
    expect(acrossSlots(d).mods.map((m) => m.modName)).toEqual(["ok"]);
  });

  it("handles an empty cohort", () => {
    expect(acrossSlots(empty())).toEqual({ totalItems: 0, mods: [] });
  });
});
