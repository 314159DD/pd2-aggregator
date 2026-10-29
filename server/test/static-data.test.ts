import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  slotFromItemName,
  SLOT_BY_EQUIPMENT,
  skillRole,
  RUNE_NAMES,
  RUNE_ITEM_NAMES,
  runewordRecipe,
  META_SLOTS,
} from "../src/core/static-data";

const root = join(__dirname, "..", "..");
const files: Array<[string, string]> = [
  ["item-slots.json", "data/item-slots.json"],
  ["skill-prereqs.json", "data/skill-prereqs.json"],
  ["skill-classification.json", "data/skill-classification.json"],
  ["mod-dictionary.json", "data/mod-dictionary.json"],
  ["runeword-runes.json", "public/runeword-runes.json"],
];

describe("static data copies", () => {
  for (const [name, src] of files) {
    it(`${name} is byte-identical to ${src}`, () => {
      // Line endings may differ per checkout (core.autocrlf); everything else must match byte for byte.
      const lf = (b: Buffer) => Buffer.from(b.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
      const copy = lf(readFileSync(join(__dirname, "..", "src", "core", "static", name)));
      const orig = lf(readFileSync(join(root, src)));
      expect(copy.equals(orig), "run node server/scripts/sync-static.js").toBe(true);
    });
  }
});

describe("static-data helpers", () => {
  it("slotFromItemName", () => {
    expect(slotFromItemName("Harlequin Crest")).toBe("helm");
    expect(slotFromItemName("Heart of the Oak")).toBe("weapon");
    expect(slotFromItemName("Raven Frost")).toBe("ring");
    expect(slotFromItemName("Nonexistent Thing")).toBeNull();
  });
  it("SLOT_BY_EQUIPMENT and META_SLOTS", () => {
    expect(SLOT_BY_EQUIPMENT["Left Hand Switch"]).toBe("offhand");
    expect(META_SLOTS).toHaveLength(9);
  });
  it("skillRole", () => {
    expect(skillRole("Amazon", "Inner Sight")).toBe("synergy");
    expect(skillRole("Amazon", "Strafe")).toBe("core");
    expect(skillRole("Amazon", "Nope")).toBe("core");
    expect(skillRole("Nobody", "Nope")).toBe("core");
  });
  it("runes", () => {
    expect(RUNE_NAMES).toHaveLength(33);
    expect(RUNE_ITEM_NAMES[0]).toBe("El Rune");
    expect(runewordRecipe("Beast")).toEqual(["Ber", "Tir", "Um", "Mal", "Lum"]);
    expect(runewordRecipe("Nope")).toBeNull();
  });
});
