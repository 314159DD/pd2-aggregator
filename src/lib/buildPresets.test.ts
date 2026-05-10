import { describe, it, expect } from "vitest";
import {
  BUILD_PRESETS,
  PRESET_MIN_LEVEL,
  isPresetActive,
  type BuildPreset,
} from "./buildPresets";
import skillPrereqs from "../../data/skill-prereqs.json";

describe("BUILD_PRESETS data", () => {
  it("covers all 7 classes", () => {
    const classes = [
      "Amazon",
      "Assassin",
      "Barbarian",
      "Druid",
      "Necromancer",
      "Paladin",
      "Sorceress",
    ];
    for (const c of classes) {
      expect(BUILD_PRESETS[c], `missing class ${c}`).toBeDefined();
      expect(BUILD_PRESETS[c].length, `class ${c} should have ≥4 builds`).toBeGreaterThanOrEqual(4);
    }
  });

  it("every preset's skills exist in skill-prereqs.json for that class", () => {
    // If a preset references a skill the prereq dataset doesn't know about,
    // the spelling is probably wrong and the filter won't match anything.
    const dangling: string[] = [];
    for (const [cls, presets] of Object.entries(BUILD_PRESETS)) {
      const knownSkills = new Set(
        Object.keys(
          (skillPrereqs as Record<string, Record<string, unknown>>)[cls] ?? {},
        ),
      );
      for (const preset of presets) {
        for (const skill of preset.skills) {
          if (!knownSkills.has(skill)) {
            dangling.push(`${cls} / ${preset.name} → "${skill}"`);
          }
        }
      }
    }
    expect(dangling, `unverified skill names:\n${dangling.join("\n")}`).toEqual([]);
  });

  it("preset names are unique within a class", () => {
    for (const [cls, presets] of Object.entries(BUILD_PRESETS)) {
      const names = presets.map((p) => p.name);
      const unique = new Set(names);
      expect(names.length, `${cls} has duplicate preset names`).toBe(unique.size);
    }
  });

  it("PRESET_MIN_LEVEL is 20 (the standard build/synergy threshold)", () => {
    expect(PRESET_MIN_LEVEL).toBe(20);
  });
});

describe("isPresetActive", () => {
  const hammerdin: BuildPreset = {
    name: "Hammerdin",
    skills: ["Blessed Hammer"],
  };
  const auradin: BuildPreset = {
    name: "Auradin",
    skills: ["Holy Fire", "Holy Shock"],
  };

  it("returns true when current skills exactly match a single-skill preset", () => {
    expect(isPresetActive(["Blessed Hammer"], hammerdin)).toBe(true);
  });

  it("returns false when current skills are empty", () => {
    expect(isPresetActive([], hammerdin)).toBe(false);
  });

  it("returns false when an extra skill is selected", () => {
    expect(isPresetActive(["Blessed Hammer", "Vigor"], hammerdin)).toBe(false);
  });

  it("returns false when a different skill is selected", () => {
    expect(isPresetActive(["Smite"], hammerdin)).toBe(false);
  });

  it("matches multi-skill presets regardless of order", () => {
    expect(isPresetActive(["Holy Fire", "Holy Shock"], auradin)).toBe(true);
    expect(isPresetActive(["Holy Shock", "Holy Fire"], auradin)).toBe(true);
  });

  it("returns false when only one of a multi-skill preset's skills is selected", () => {
    expect(isPresetActive(["Holy Fire"], auradin)).toBe(false);
  });
});
