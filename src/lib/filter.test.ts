import { describe, it, expect } from "vitest";
import { filterCharacters } from "./filter";
import type { Character } from "./types";

// ---------------------------------------------------------------------------
// Helpers — build minimal Character-shaped objects for testing
// ---------------------------------------------------------------------------

function makeChar(opts: {
  className: string;
  level: number;
  skills?: Array<{ name: string; level: number }>;
}): Character {
  return {
    accountName: "test",
    character: {
      name: "TestChar",
      level: opts.level,
      class: { id: 0, name: opts.className },
      life: 1000,
      mana: 200,
      stamina: 100,
      experience: 0,
      attributes: { vitality: 0, strength: 0, dexterity: 0, energy: 0 },
      points: { stat: 0, skill: 0 },
      gold: { stash: 0, character: 0, total: 0 },
      status: {
        is_dead: false,
        is_ladder: true,
        is_hardcore: false,
        is_expansion: true,
      },
      skills: (opts.skills ?? []).map((s, i) => ({
        id: i,
        name: s.name,
        level: s.level,
      })),
    },
    realSkills: [],
    items: [],
    mercenary: {
      id: 0,
      name: "Merc",
      type: 0,
      experience: 0,
      description: "",
      name_id: 0,
      items: [],
    },
    file: {
      header: 0,
      version: 0,
      checksum: 0,
      filesize: 0,
      updated_at: 0,
    },
    lastUpdated: 0,
  } as unknown as Character;
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const paladin85 = makeChar({
  className: "Paladin",
  level: 85,
  skills: [
    { name: "Holy Fire", level: 1 },
    { name: "Concentration", level: 20 },
  ],
});

const paladin90 = makeChar({
  className: "Paladin",
  level: 90,
  skills: [
    { name: "Holy Fire", level: 1 },
    { name: "Concentration", level: 20 },
    { name: "Fanaticism", level: 20 },
  ],
});

const sorc85 = makeChar({
  className: "Sorceress",
  level: 85,
  skills: [{ name: "Blizzard", level: 20 }],
});

const paladin80NoConc = makeChar({
  className: "Paladin",
  level: 80,
  skills: [{ name: "Holy Fire", level: 1 }],
});

const paladin87LowConc = makeChar({
  className: "Paladin",
  level: 87,
  skills: [
    { name: "Holy Fire", level: 1 },
    { name: "Concentration", level: 5 }, // below min
  ],
});

const ALL = [paladin85, paladin90, sorc85, paladin80NoConc, paladin87LowConc];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("filterCharacters", () => {
  it("rejects characters of the wrong class", () => {
    const result = filterCharacters(ALL, { className: "Paladin", skills: [] });
    expect(result.every((c) => c.character.class.name === "Paladin")).toBe(true);
    expect(result.find((c) => c.character.class.name === "Sorceress")).toBeUndefined();
  });

  it("enforces skill minimum levels (rejects character with skill below min)", () => {
    const result = filterCharacters(ALL, {
      className: "Paladin",
      skills: [{ name: "Concentration", minLevel: 20 }],
    });
    // paladin87LowConc (Concentration 5) and paladin80NoConc (no Concentration) should be excluded
    expect(result).not.toContain(paladin87LowConc);
    expect(result).not.toContain(paladin80NoConc);
    expect(result).toContain(paladin85);
    expect(result).toContain(paladin90);
  });

  it("enforces AND logic — all skill requirements must match, not OR", () => {
    const result = filterCharacters(ALL, {
      className: "Paladin",
      skills: [
        { name: "Concentration", minLevel: 20 },
        { name: "Fanaticism", minLevel: 1 }, // only paladin90 has this
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(paladin90);
  });

  it("sorts matched characters by level descending", () => {
    const result = filterCharacters(ALL, {
      className: "Paladin",
      skills: [],
    });
    // Should be paladin90, paladin87LowConc, paladin85, paladin80NoConc
    const levels = result.map((c) => c.character.level);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeLessThanOrEqual(levels[i - 1]);
    }
  });

  it("respects topN truncation", () => {
    const result = filterCharacters(ALL, { className: "Paladin", skills: [] }, 2);
    expect(result).toHaveLength(2);
    // Top 2 by level: paladin90 (90), paladin87LowConc (87)
    expect(result[0].character.level).toBe(90);
    expect(result[1].character.level).toBe(87);
  });

  it("enforces minCharLevel guard", () => {
    const result = filterCharacters(
      ALL,
      { className: "Paladin", skills: [], minCharLevel: 85 },
    );
    expect(result.every((c) => c.character.level >= 85)).toBe(true);
    expect(result.find((c) => c.character.level < 85)).toBeUndefined();
  });

  it("returns empty array when no characters match", () => {
    const result = filterCharacters(ALL, {
      className: "Amazon",
      skills: [],
    });
    expect(result).toHaveLength(0);
  });
});
