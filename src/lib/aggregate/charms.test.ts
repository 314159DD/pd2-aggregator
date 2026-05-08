import { describe, it, expect } from "vitest";
import { aggregateCharms } from "./charms";
import type { Character, Item } from "../types";
import type { ModDictionary } from "./types";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let idCounter = 100;

function makeCharm(opts: {
  baseType: "Small Charm" | "Medium Charm" | "Large Charm";
  qualityName?: string;
  name?: string;
  mods?: Array<{ name: string; values: number[] }>;
}): Item {
  const id = idCounter++;
  const baseTypeToCode: Record<string, { id: string; name: string; type_code: string }> = {
    "Small Charm": { id: "cm1", name: "Small Charm", type_code: "scha" },
    "Medium Charm": { id: "cm2", name: "Large Charm", type_code: "mcha" },
    "Large Charm": { id: "cm3", name: "Grand Charm", type_code: "lcha" },
  };
  const baseInfo = baseTypeToCode[opts.baseType];

  return {
    id,
    base: {
      id: baseInfo.id,
      name: baseInfo.name,
      type: opts.baseType,
      type_code: baseInfo.type_code,
      category: "misc",
      size: { width: 1, height: 1 },
      codes: { normal: baseInfo.id, exceptional: "", elite: "" },
      stackable: false,
      requirements: {},
    },
    hash: `hash-${id}`,
    quality: { id: 4, name: (opts.qualityName ?? "Magic") as never },
    name: opts.name,
    location: {
      zone: "Stored",
      storage: "Inventory",
      zone_id: 0,
      equipment: "",
      storage_id: 1,
      equipment_id: 0,
    },
    position: { row: 0, column: 0 },
    base_code: baseInfo.id,
    category: "misc",
    modifiers: (opts.mods ?? []).map((m) => ({
      name: m.name,
      label: m.name,
      values: m.values,
      priority: 0,
    })),
    properties: [],
    item_level: 96,
    requirements: { level: 32 },
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
  allskills: { category: "skill", displayLabel: "All Skills" },
  item_fastercastrate: { category: "fcr", displayLabel: "Faster Cast Rate" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("aggregateCharms", () => {
  it("returns zeros for empty character pool", () => {
    const result = aggregateCharms([], DICT);
    expect(result.avgCount).toBe(0);
    expect(result.annihilus.count).toBe(0);
    expect(result.torch.count).toBe(0);
    expect(result.gheeds.count).toBe(0);
    expect(result.topGcMods).toHaveLength(0);
    expect(result.topScMods).toHaveLength(0);
  });

  it("detects Annihilus by name + Unique quality", () => {
    const chars = [
      makeChar([
        makeCharm({ baseType: "Small Charm", qualityName: "Unique", name: "Annihilus" }),
      ]),
      makeChar([
        makeCharm({ baseType: "Small Charm", qualityName: "Magic", name: "Small Charm of Vita" }),
      ]),
    ];
    const result = aggregateCharms(chars, DICT);
    expect(result.annihilus.count).toBe(1);
    expect(result.annihilus.pct).toBe(0.5);
  });

  it("detects Hellfire Torch by name + Unique quality on Medium Charm", () => {
    const chars = [
      makeChar([
        makeCharm({ baseType: "Medium Charm", qualityName: "Unique", name: "Hellfire Torch" }),
        makeCharm({ baseType: "Medium Charm", qualityName: "Unique", name: "Hellfire Torch" }),
      ]),
    ];
    const result = aggregateCharms([chars[0]], DICT);
    // 2 torches on 1 character
    expect(result.torch.count).toBe(2);
    expect(result.torch.pct).toBe(2); // 2/1 chars
  });

  it("detects Gheed's Fortune on Large Charm base type", () => {
    const chars = [
      makeChar([
        makeCharm({ baseType: "Large Charm", qualityName: "Unique", name: "Gheed's Fortune" }),
      ]),
      makeChar([]), // no Gheed's
    ];
    const result = aggregateCharms(chars, DICT);
    expect(result.gheeds.count).toBe(1);
    expect(result.gheeds.pct).toBe(0.5);
  });

  it("buckets Grand Charm mods into topGcMods", () => {
    const chars = [
      makeChar([
        makeCharm({
          baseType: "Large Charm",
          mods: [{ name: "allskills", values: [1] }],
        }),
        makeCharm({
          baseType: "Large Charm",
          mods: [{ name: "allskills", values: [1] }],
        }),
      ]),
    ];
    const result = aggregateCharms(chars, DICT);
    expect(result.topGcMods.length).toBeGreaterThan(0);
    expect(result.topGcMods[0].modName).toBe("allskills");
    expect(result.topGcMods[0].count).toBe(2);
    expect(result.topGcMods[0].displayLabel).toBe("All Skills");
    // SC mods should be empty
    expect(result.topScMods).toHaveLength(0);
  });

  it("buckets Small and Medium Charm mods into topScMods", () => {
    const chars = [
      makeChar([
        makeCharm({
          baseType: "Small Charm",
          mods: [{ name: "maxhp", values: [20] }],
        }),
        makeCharm({
          baseType: "Medium Charm",
          mods: [{ name: "maxhp", values: [20] }],
        }),
      ]),
    ];
    const result = aggregateCharms(chars, DICT);
    expect(result.topScMods.length).toBeGreaterThan(0);
    expect(result.topScMods[0].modName).toBe("maxhp");
    expect(result.topScMods[0].count).toBe(2);
    // GC mods should be empty
    expect(result.topGcMods).toHaveLength(0);
  });

  it("computes avgCount correctly across chars", () => {
    const chars = [
      makeChar([
        makeCharm({ baseType: "Small Charm" }),
        makeCharm({ baseType: "Small Charm" }),
        makeCharm({ baseType: "Large Charm" }),
      ]),
      makeChar([
        makeCharm({ baseType: "Small Charm" }),
      ]),
    ];
    const result = aggregateCharms(chars, DICT);
    // char1 has 3 charms, char2 has 1 charm → avg = (3+1)/2 = 2
    expect(result.avgCount).toBe(2);
  });

  it("unique charms are excluded from topGcMods/topScMods", () => {
    const chars = [
      makeChar([
        makeCharm({ baseType: "Small Charm", qualityName: "Unique", name: "Annihilus" }),
        makeCharm({ baseType: "Large Charm", qualityName: "Unique", name: "Gheed's Fortune" }),
        makeCharm({ baseType: "Medium Charm", qualityName: "Unique", name: "Hellfire Torch" }),
        // Only this one should contribute to SC bucket
        makeCharm({
          baseType: "Small Charm",
          mods: [{ name: "maxhp", values: [20] }],
        }),
      ]),
    ];
    const result = aggregateCharms(chars, DICT);
    // topScMods should only have maxhp (from the non-unique small charm)
    expect(result.topScMods.find((m) => m.modName === "maxhp")).toBeDefined();
    // topGcMods should be empty (Gheed's was excluded)
    expect(result.topGcMods).toHaveLength(0);
  });

  it("pct uses total chars in pool as denominator", () => {
    const chars = [
      makeChar([makeCharm({ baseType: "Small Charm", mods: [{ name: "maxhp", values: [20] }] })]),
      makeChar([makeCharm({ baseType: "Small Charm", mods: [{ name: "maxhp", values: [15] }] })]),
      makeChar([makeCharm({ baseType: "Small Charm", mods: [{ name: "item_fastercastrate", values: [5] }] })]),
    ];
    const result = aggregateCharms(chars, DICT);
    const life = result.topScMods.find((m) => m.modName === "maxhp");
    expect(life).toBeDefined();
    expect(life!.count).toBe(2);
    // pct = 2 / 3 chars
    expect(life!.pct).toBeCloseTo(2 / 3);
  });

  // Snapshot-driven smoke test
  it("snapshot smoke: Paladin charm aggregation returns non-zero counts", async () => {
    const { default: snap } = await import("../../../data/snapshot.json");
    const { filterCharacters } = await import("../filter");
    const { default: dict } = await import("../../../data/mod-dictionary.json");

    const chars = (snap as { characters: Character[] }).characters;
    const paladins = filterCharacters(chars, { className: "Paladin", skills: [] });

    expect(paladins.length).toBeGreaterThan(0);

    const result = aggregateCharms(paladins, dict as ModDictionary);

    expect(result.avgCount).toBeGreaterThan(0);
    // Expect at least some small charm mods
    expect(result.topScMods.length).toBeGreaterThan(0);

    console.info(
      `[smoke] charms avgCount=${result.avgCount.toFixed(1)}, ` +
      `anni=${result.annihilus.count}/${paladins.length}, ` +
      `torch=${result.torch.count}/${paladins.length}, ` +
      `gheeds=${result.gheeds.count}/${paladins.length}`,
    );
    console.info(
      `[smoke] topGcMod[0]: ${result.topGcMods[0]?.modName ?? "none"}, ` +
      `topScMod[0]: ${result.topScMods[0]?.modName ?? "none"}`,
    );
  }, 30_000);
});
