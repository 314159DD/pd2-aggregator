import { describe, it, expect } from "vitest";
import { buildPresetsFromSheet } from "./buildSnapshot";
import type { ParsedSheet } from "./parseSheet";

const sheet: ParsedSheet = {
  cutoffs: [
    { tier: "S", minMpm: 600 },
    { tier: "A", minMpm: 500 },
    { tier: "F-", minMpm: 0 },
  ],
  builds: [
    { rawName: "Blessed Hammer", handicap: 0, normalizedMpm: 550 },
    { rawName: "Physical Sacrifice (1-H)", handicap: 0, normalizedMpm: 520 },
    { rawName: "Physical Sacrifice (2-H)", handicap: 0, normalizedMpm: 610 },
    { rawName: "Holy Bolt (H Lvl 1)", handicap: 1, normalizedMpm: 520 },
    { rawName: "Unmapped Build", handicap: 0, normalizedMpm: 400 },
  ],
};
const mapping = {
  "Blessed Hammer": { skills: ["Blessed Hammer"] },
  "Physical Sacrifice (1-H)": { skills: ["Sacrifice"], mergeInto: "Physical Sacrifice" },
  "Physical Sacrifice (2-H)": { skills: ["Sacrifice"], mergeInto: "Physical Sacrifice" },
  "Holy Bolt (H Lvl 1)": { skills: ["Holy Bolt"] },
};
const skillClass: Record<string, string> = {
  "Blessed Hammer": "Paladin",
  Sacrifice: "Paladin",
  "Holy Bolt": "Paladin",
};

describe("buildPresetsFromSheet", () => {
  it("joins, merges variants (highest tier wins), groups by class", () => {
    const { presets } = buildPresetsFromSheet(sheet, mapping, skillClass);
    const pal = presets["Paladin"];
    expect(pal).toHaveLength(3);
    const sac = pal.find((p) => p.id === "physical-sacrifice")!;
    expect(sac.tier).toBe("S"); // 610 -> S beats the 1-H variant's A
    expect(sac.sources).toHaveLength(2);
    expect(sac.skills).toEqual(["Sacrifice"]);
    expect(sac.className).toBe("Paladin");
  });

  it("applies the handicap promotion to a build's tier", () => {
    const { presets } = buildPresetsFromSheet(sheet, mapping, skillClass);
    const hb = presets["Paladin"].find((p) => p.id === "holy-bolt")!;
    // 520 -> A; handicap 1 promotes one sub-tier -> A+
    expect(hb.tier).toBe("A+");
  });

  it("reports builds with no mapping entry", () => {
    const { unmapped } = buildPresetsFromSheet(sheet, mapping, skillClass);
    expect(unmapped).toContain("Unmapped Build");
  });

  it("sorts presets best tier first", () => {
    const { presets } = buildPresetsFromSheet(sheet, mapping, skillClass);
    const pal = presets["Paladin"];
    expect(pal[0].tier).toBe("S");
    expect(pal[pal.length - 1].tier).toBe("A"); // Blessed Hammer, 550 -> A
  });
});
