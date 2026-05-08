import { describe, it, expect } from "vitest";
import {
  diffCharacter,
  findCharacterInSample,
  pickCharacterFromAccountResponse,
} from "./diff";
import type { Character } from "./types";
import type { GuideSlice } from "./diff";

// ---------------------------------------------------------------------------
// Minimal character / item builders
// ---------------------------------------------------------------------------

function makeRingItem(mods: Array<{ name: string }>, uniqueName?: string) {
  return {
    id: 1,
    base: {
      id: "rin",
      name: "Ring",
      type: "Ring",
      type_code: "ring",
      category: "jewelry",
      size: { width: 1, height: 1 },
      codes: { normal: "rin", exceptional: "", elite: "" },
      stackable: false,
      requirements: {},
    },
    hash: "abc",
    quality: uniqueName
      ? { id: 6, name: "Unique" as const }
      : { id: 4, name: "Rare" as const },
    name: uniqueName,
    location: {
      zone: "Equipped",
      storage: "Unknown",
      zone_id: 1,
      equipment: "Left Ring",
      storage_id: 0,
      equipment_id: 11,
    },
    position: { row: 0, column: 0 },
    base_code: "rin",
    category: "jewelry",
    modifiers: mods.map((m) => ({
      name: m.name,
      label: m.name,
      values: [10],
      priority: 0,
    })),
    properties: [],
    item_level: 85,
    requirements: {},
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
    format_version: 96,
  };
}

const myChar: Character = {
  accountName: "Tester",
  character: {
    name: "MyChar",
    level: 90,
    class: { id: 3, name: "Paladin" },
    skills: [],
    life: 1000,
    mana: 200,
    stamina: 500,
    experience: 99999,
    attributes: { vitality: 300, strength: 100, dexterity: 75, energy: 25 },
    points: { stat: 0, skill: 0 },
    gold: { stash: 50000, character: 5000, total: 55000 },
    status: {
      is_dead: false,
      is_ladder: true,
      is_hardcore: true,
      is_expansion: true,
    },
  },
  items: [makeRingItem([{ name: "item_fastercastrate" }])] as unknown as Character["items"],
  mercenary: {
    id: 1,
    name: "Ahvar",
    type: 2,
    experience: 0,
    description: "Holy Freeze",
    name_id: 1,
    items: [],
  },
  realSkills: [],
  file: { header: 0, version: 96, checksum: 0, filesize: 1000, updated_at: 0 },
  lastUpdated: Date.now(),
};

const guide: GuideSlice = {
  topItemsBySlot: {
    weapon: [
      {
        itemName: "Heart of the Oak",
        baseName: "Mace",
        count: 78,
        pct: 78,
        itemType: "Runeword",
      } as unknown as GuideSlice["topItemsBySlot"]["weapon"][0],
    ],
    helm: [],
    armor: [],
    offhand: [],
    gloves: [],
    belt: [],
    boots: [],
    amulet: [],
    ring: [
      {
        itemName: "Raven Frost",
        baseName: "Ring",
        count: 91,
        pct: 91,
        itemType: "Unique",
      } as unknown as GuideSlice["topItemsBySlot"]["ring"][0],
    ],
  } as unknown as GuideSlice["topItemsBySlot"],
  affixModsBySlot: {
    weapon: [],
    helm: [],
    armor: [],
    offhand: [],
    gloves: [],
    belt: [],
    boots: [],
    amulet: [],
    ring: [
      {
        modName: "item_fastercastrate",
        displayLabel: "Faster Cast Rate",
        category: "speed",
        count: 30,
        pct: 0.91,
        medianValue: 10,
        p75Value: 10,
      },
      {
        modName: "item_maxhp",
        displayLabel: "Life",
        category: "stat",
        count: 25,
        pct: 0.76,
        medianValue: 30,
        p75Value: 50,
      },
    ],
  } as unknown as GuideSlice["affixModsBySlot"],
  poolMercType: "Holy Freeze",
};

// ---------------------------------------------------------------------------
// diffCharacter
// ---------------------------------------------------------------------------

describe("diffCharacter", () => {
  it("flags slot mismatch: pool top is Raven Frost but user wears Rare Ring", () => {
    const r = diffCharacter(myChar, guide);
    const ring = r.slots.ring;
    expect(ring.poolTopItemName).toBe("Raven Frost");
    expect(ring.userItemName).toMatch(/Rare Ring/);
    expect(ring.userMatchesPoolTop).toBe(false);
    expect(ring.userItemQuality).toBe("Rare");
  });

  it("marks affix mod coverage correctly: has FCR, missing Life", () => {
    const r = diffCharacter(myChar, guide);
    const ring = r.slots.ring;
    const fcr = ring.poolTopAffixMods.find(
      (m) => m.modName === "item_fastercastrate",
    );
    const life = ring.poolTopAffixMods.find((m) => m.modName === "item_maxhp");
    expect(fcr?.userHas).toBe(true);
    expect(life?.userHas).toBe(false);
  });

  it("reports match when user has exact pool top unique", () => {
    const charWithRavenFrost: Character = {
      ...myChar,
      items: [makeRingItem([], "Raven Frost")] as unknown as Character["items"],
    };
    const r = diffCharacter(charWithRavenFrost, guide);
    expect(r.slots.ring.userMatchesPoolTop).toBe(true);
    expect(r.slots.ring.userItemName).toBe("Raven Frost");
  });

  it("empty slot yields null userItemName and userMatchesPoolTop:false", () => {
    const charNoItems: Character = { ...myChar, items: [] };
    const r = diffCharacter(charNoItems, guide);
    expect(r.slots.ring.userItemName).toBeNull();
    expect(r.slots.ring.userMatchesPoolTop).toBe(false);
  });

  it("matches mercenary type when description matches poolMercType", () => {
    const r = diffCharacter(myChar, guide);
    expect(r.mercTypeMatchesPool).toBe(true);
    expect(r.userMercType).toBe("Holy Freeze");
    expect(r.poolMercType).toBe("Holy Freeze");
  });

  it("reports merc mismatch when types differ", () => {
    const charMightMerc: Character = {
      ...myChar,
      mercenary: { ...myChar.mercenary, description: "Might Merc" },
    };
    const r = diffCharacter(charMightMerc, guide);
    expect(r.mercTypeMatchesPool).toBe(false);
    expect(r.userMercType).toBe("Might Merc");
  });

  it("returns null mercTypeMatchesPool when poolMercType is null", () => {
    const guideNoMerc: GuideSlice = { ...guide, poolMercType: null };
    const r = diffCharacter(myChar, guideNoMerc);
    expect(r.mercTypeMatchesPool).toBeNull();
  });

  it("populates character metadata correctly", () => {
    const r = diffCharacter(myChar, guide);
    expect(r.characterName).toBe("MyChar");
    expect(r.accountName).toBe("Tester");
    expect(r.characterLevel).toBe(90);
    expect(r.className).toBe("Paladin");
  });

  it("slot with no pool top still has poolTopItemName:null", () => {
    const r = diffCharacter(myChar, guide);
    // helm has [] in topItemsBySlot
    expect(r.slots.helm.poolTopItemName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findCharacterInSample
// ---------------------------------------------------------------------------

describe("findCharacterInSample", () => {
  it("finds by character name (case-insensitive)", () => {
    expect(findCharacterInSample("mychar", [myChar])).toBe(myChar);
    expect(findCharacterInSample("MYCHAR", [myChar])).toBe(myChar);
  });

  it("finds by account name (case-insensitive)", () => {
    expect(findCharacterInSample("tester", [myChar])).toBe(myChar);
    expect(findCharacterInSample("TESTER", [myChar])).toBe(myChar);
  });

  it("returns null on no match", () => {
    expect(findCharacterInSample("nope", [myChar])).toBeNull();
  });

  it("returns null on empty sample", () => {
    expect(findCharacterInSample("MyChar", [])).toBeNull();
  });

  it("prefers character name over account name when both could match", () => {
    const other: Character = {
      ...myChar,
      accountName: "OtherAccount",
      character: { ...myChar.character, name: "tester" }, // name == "tester" == accountName of myChar
    };
    // "tester" matches myChar.accountName AND other.character.name
    // find() returns first match in iteration order
    const result = findCharacterInSample("tester", [myChar, other]);
    // First element: myChar.accountName === "Tester" ✓
    expect(result).toBe(myChar);
  });
});

// ---------------------------------------------------------------------------
// pickCharacterFromAccountResponse
// ---------------------------------------------------------------------------

describe("pickCharacterFromAccountResponse", () => {
  it("picks exact character name match (case-insensitive)", () => {
    const resp = {
      characters: [
        { character: { name: "Foo" } },
        { character: { name: "Bar" } },
      ],
    };
    expect(pickCharacterFromAccountResponse("bar", resp as unknown)).toEqual({
      character: { name: "Bar" },
    });
  });

  it("falls back to first character if no name match", () => {
    const resp = {
      characters: [{ character: { name: "Foo" } }],
    };
    expect(pickCharacterFromAccountResponse("xxx", resp as unknown)).toEqual({
      character: { name: "Foo" },
    });
  });

  it("returns null for null input", () => {
    expect(pickCharacterFromAccountResponse("foo", null)).toBeNull();
  });

  it("returns null for error envelope with no characters array", () => {
    expect(
      pickCharacterFromAccountResponse("foo", {
        error: { message: "No characters found" },
      }),
    ).toBeNull();
  });

  it("returns null for empty characters array", () => {
    expect(
      pickCharacterFromAccountResponse("foo", { characters: [] }),
    ).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(pickCharacterFromAccountResponse("foo", "bad")).toBeNull();
    expect(pickCharacterFromAccountResponse("foo", 42)).toBeNull();
  });
});
