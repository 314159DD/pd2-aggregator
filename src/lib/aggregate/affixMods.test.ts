import { describe, it, expect } from "vitest";
import { aggregateAffixModsBySlot } from "./affixMods";
import type { Character, Item } from "../types";
import type { ModDictionary } from "./types";

// ---------------------------------------------------------------------------
// Minimal fixture builders
// ---------------------------------------------------------------------------

let itemIdCounter = 1;

function makeItem(opts: {
  equipment: string;
  qualityName: string;
  mods?: Array<{ name: string; values: number[] }>;
}): Item {
  return {
    id: itemIdCounter++,
    base: {
      id: "rin",
      name: "Ring",
      type: "misc",
      type_code: "ring",
      category: "misc",
      size: { width: 1, height: 1 },
      codes: { normal: "rin", exceptional: "", elite: "" },
      stackable: false,
      requirements: {},
    },
    hash: "abc",
    quality: { id: 4, name: opts.qualityName as never },
    location: {
      zone: "Equipped",
      storage: "Equipped",
      zone_id: 1,
      equipment: opts.equipment,
      storage_id: 0,
      equipment_id: 0,
    },
    position: { row: 0, column: 0 },
    base_code: "rin",
    category: "misc",
    modifiers: (opts.mods ?? []).map((m) => ({
      name: m.name,
      label: m.name,
      values: m.values,
      priority: 0,
    })),
    properties: [],
    item_level: 96,
    requirements: { level: 60 },
    is_identified: true,
    is_ethereal: false,
    is_runeword: false,
    is_socketed: false,
    socket_count: 0,
    socketed_count: 0,
    corrupted: false,
    desecrated: false,
    is_simple: false,
    is_ear: false,
    is_new: false,
    is_starter: false,
    graphic_id: 0,
    format_version: 103,
  } as unknown as Item;
}

function makeChar(items: Item[]): Character {
  return {
    accountName: "test",
    character: {
      name: "TestChar",
      level: 90,
      class: { id: 3, name: "Paladin" },
      life: 1000,
      mana: 200,
      stamina: 100,
      experience: 0,
      attributes: { vitality: 0, strength: 0, dexterity: 0, energy: 0 },
      points: { stat: 0, skill: 0 },
      gold: { stash: 0, character: 0, total: 0 },
      status: { is_dead: false, is_ladder: true, is_hardcore: false, is_expansion: true },
      skills: [],
    },
    realSkills: [],
    items,
    mercenary: { id: 0, name: "", type: 0, experience: 0, description: "", name_id: 0, items: [] },
    file: { header: 0, version: 0, checksum: 0, filesize: 0, updated_at: 0 },
    lastUpdated: 0,
  } as unknown as Character;
}

const DICT: ModDictionary = {
  maxhp: { category: "life", displayLabel: "Life" },
  item_fastercastrate: { category: "fcr", displayLabel: "Faster Cast Rate" },
  fireresist: { category: "resist", displayLabel: "Fire Resist" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("aggregateAffixModsBySlot", () => {
  it("counts mods correctly for a single rare ring", () => {
    const char = makeChar([
      makeItem({
        equipment: "Left Ring",
        qualityName: "Rare",
        mods: [
          { name: "maxhp", values: [40] },
          { name: "item_fastercastrate", values: [10] },
        ],
      }),
    ]);
    const result = aggregateAffixModsBySlot([char], DICT);
    const ringMods = result.ring ?? [];
    const life = ringMods.find((m) => m.modName === "maxhp");
    const fcr = ringMods.find((m) => m.modName === "item_fastercastrate");
    expect(life).toBeDefined();
    expect(life!.count).toBe(1);
    expect(life!.pct).toBe(1); // 1/1
    expect(life!.medianValue).toBe(40);
    expect(fcr).toBeDefined();
    expect(fcr!.displayLabel).toBe("Faster Cast Rate");
  });

  it("excludes non-eligible quality items (Unique/Set/Normal/Runeword)", () => {
    const char = makeChar([
      makeItem({
        equipment: "Left Ring",
        qualityName: "Unique", // should be excluded
        mods: [{ name: "maxhp", values: [100] }],
      }),
    ]);
    const result = aggregateAffixModsBySlot([char], DICT);
    // ring slot may not exist at all, or be empty
    expect((result.ring ?? []).find((m) => m.modName === "maxhp")).toBeUndefined();
  });

  it("computes correct pct across multiple characters", () => {
    const chars = [
      makeChar([
        makeItem({
          equipment: "Amulet",
          qualityName: "Rare",
          mods: [{ name: "maxhp", values: [30] }],
        }),
      ]),
      makeChar([
        makeItem({
          equipment: "Amulet",
          qualityName: "Magic",
          mods: [{ name: "maxhp", values: [20] }],
        }),
      ]),
      makeChar([
        makeItem({
          equipment: "Amulet",
          qualityName: "Rare",
          mods: [{ name: "fireresist", values: [15] }], // no maxhp here
        }),
      ]),
    ];
    const result = aggregateAffixModsBySlot(chars, DICT);
    const amuletMods = result.amulet ?? [];
    const life = amuletMods.find((m) => m.modName === "maxhp");
    expect(life).toBeDefined();
    expect(life!.count).toBe(2);
    expect(life!.pct).toBeCloseTo(2 / 3);
  });

  it("computes median and p75 correctly", () => {
    // Three rings each with different life values: 10, 20, 30
    const chars = [10, 20, 30].map((v) =>
      makeChar([
        makeItem({
          equipment: "Right Ring",
          qualityName: "Rare",
          mods: [{ name: "maxhp", values: [v] }],
        }),
      ]),
    );
    const result = aggregateAffixModsBySlot(chars, DICT);
    const life = (result.ring ?? []).find((m) => m.modName === "maxhp");
    expect(life).toBeDefined();
    expect(life!.medianValue).toBe(20); // median of [10,20,30]
    expect(life!.p75Value).toBe(30);    // 75th pct of [10,20,30] = 30
  });

  it("sorts mods by count descending", () => {
    // maxhp appears on 3 items, item_fastercastrate on 1
    const chars = [1, 2, 3].map(() =>
      makeChar([
        makeItem({
          equipment: "Left Ring",
          qualityName: "Rare",
          mods: [{ name: "maxhp", values: [25] }],
        }),
      ]),
    ).concat([
      makeChar([
        makeItem({
          equipment: "Left Ring",
          qualityName: "Crafted",
          mods: [{ name: "item_fastercastrate", values: [10] }],
        }),
      ]),
    ]);
    const result = aggregateAffixModsBySlot(chars, DICT);
    const ring = result.ring ?? [];
    expect(ring[0].modName).toBe("maxhp");
    expect(ring[0].count).toBe(3);
  });

  it("returns unknown displayLabel and category for mods not in dictionary", () => {
    const char = makeChar([
      makeItem({
        equipment: "Helm",
        qualityName: "Rare",
        mods: [{ name: "exotic_unknown_mod", values: [5] }],
      }),
    ]);
    const result = aggregateAffixModsBySlot([char], DICT);
    const mod = (result.helm ?? []).find((m) => m.modName === "exotic_unknown_mod");
    expect(mod).toBeDefined();
    expect(mod!.displayLabel).toBe("exotic_unknown_mod");
    expect(mod!.category).toBe("unknown");
  });

  // Snapshot-driven smoke test
  it("snapshot smoke: Paladin ring slot has at least one mod with count > 0", async () => {
    const { default: snap } = await import("../../../data/snapshot.json");
    const { filterCharacters } = await import("../filter");
    const { default: dict } = await import("../../../data/mod-dictionary.json");

    const chars = (snap as { characters: Character[] }).characters;
    const paladins = filterCharacters(chars, { className: "Paladin", skills: [] });

    expect(paladins.length).toBeGreaterThan(0);

    const result = aggregateAffixModsBySlot(paladins, dict as ModDictionary);
    const ring = result.ring ?? [];
    expect(ring.length).toBeGreaterThan(0);
    expect(ring[0].count).toBeGreaterThan(0);

    // Log top mod for informational purposes
    console.info(
      `[smoke] ring top mod: ${ring[0].modName}, count=${ring[0].count}, pct=${ring[0].pct.toFixed(2)}`,
    );
  }, 30_000);
});
