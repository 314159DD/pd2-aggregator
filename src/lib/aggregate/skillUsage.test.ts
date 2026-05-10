import { describe, it, expect } from "vitest";
import {
  aggregateSkillUsage,
  isPrereqOnly,
  type SkillUsageEntry,
} from "./skillUsage";
import type { Character, RealSkill } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rs(skill: string, baseLevel: number): RealSkill {
  return { skill, level: baseLevel, baseLevel };
}

function char(realSkills: RealSkill[], className = "Amazon"): Character {
  // Only the fields the aggregator actually reads. Everything else is dummy.
  return {
    accountName: "test",
    character: {
      name: "test",
      level: 90,
      class: { id: 0, name: className },
      life: 0,
      mana: 0,
      stamina: 0,
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
      skills: [],
    },
    realSkills,
    items: [],
    mercenary: {
      id: 0,
      name: "",
      type: 0,
      experience: 0,
      description: "",
      name_id: 0,
      items: [],
    },
    file: { header: 0, version: 0, checksum: 0, filesize: 0, updated_at: 0 },
    lastUpdated: 0,
  };
}

const skillByName = (
  rows: SkillUsageEntry[],
  name: string,
): SkillUsageEntry | undefined => rows.find((r) => r.name === name);

// ---------------------------------------------------------------------------
// isPrereqOnly
// ---------------------------------------------------------------------------

describe("isPrereqOnly", () => {
  // Mini classMap that mirrors the real prereq shape for Lightning Strike.
  const javaClassMap = {
    "Lightning Strike": {
      prereqs: ["Jab", "Power Strike", "Charged Strike"],
      receivesBonusesFrom: ["Power Strike", "Charged Strike"],
    },
    "Power Strike": { prereqs: ["Jab"], receivesBonusesFrom: [] },
    "Charged Strike": {
      prereqs: ["Jab", "Power Strike"],
      receivesBonusesFrom: ["Power Strike"],
    },
    Jab: { prereqs: [], receivesBonusesFrom: [] },
  };

  it("flags Power Strike as prereq when Lightning Strike is invested", () => {
    const skills = new Map([
      ["Power Strike", 1],
      ["Lightning Strike", 20],
      ["Jab", 1],
    ]);
    expect(isPrereqOnly("Power Strike", skills, javaClassMap)).toBe(true);
  });

  it("does NOT flag Power Strike as prereq when invested > 1 pt (synergy)", () => {
    const skills = new Map([
      ["Power Strike", 20],
      ["Lightning Strike", 20],
    ]);
    expect(isPrereqOnly("Power Strike", skills, javaClassMap)).toBe(false);
  });

  it("does NOT flag a 1-pt skill when nothing downstream is invested", () => {
    const skills = new Map([
      ["Jab", 1],
      // No Power Strike or Charged Strike or Lightning Strike invested
    ]);
    expect(isPrereqOnly("Jab", skills, javaClassMap)).toBe(false);
  });

  it("flags Jab when Power Strike is invested (transitive prereq via direct list)", () => {
    const skills = new Map([
      ["Jab", 1],
      ["Power Strike", 20],
    ]);
    // Power Strike's prereqs include Jab → Jab is prereq.
    expect(isPrereqOnly("Jab", skills, javaClassMap)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// aggregateSkillUsage — real prereq data
// ---------------------------------------------------------------------------

describe("aggregateSkillUsage (Amazon — Lightning Strike cohort)", () => {
  // Build a synthetic Lightning Strike Javazon cohort. Three identical chars
  // makes the classification deterministic at 100%/0%.
  const cohort = [
    char([
      rs("Jab", 1),
      rs("Power Strike", 1),
      rs("Charged Strike", 20),
      rs("Lightning Strike", 20),
      rs("Decoy", 1),
      rs("Valkyrie", 1),
    ]),
    char([
      rs("Jab", 1),
      rs("Power Strike", 1),
      rs("Charged Strike", 20),
      rs("Lightning Strike", 20),
      rs("Decoy", 1),
      rs("Valkyrie", 1),
    ]),
    char([
      rs("Jab", 1),
      rs("Power Strike", 1),
      rs("Charged Strike", 20),
      rs("Lightning Strike", 20),
      rs("Decoy", 1),
      rs("Valkyrie", 1),
    ]),
  ];

  const out = aggregateSkillUsage(cohort, "Amazon");

  it("returns an array (not null) for a known class", () => {
    expect(out).not.toBeNull();
  });

  it("classifies Power Strike (1pt) as prereq, not as build", () => {
    const row = skillByName(out!, "Power Strike");
    expect(row).toBeDefined();
    expect(row!.numAsPrereq).toBe(3);
    expect(row!.numAsBuild).toBe(0);
    expect(row!.pctBuild).toBe(0);
  });

  it("classifies Jab (1pt) as prereq because Power Strike+Charged Strike are invested", () => {
    const row = skillByName(out!, "Jab");
    expect(row!.numAsPrereq).toBe(3);
    expect(row!.numAsBuild).toBe(0);
  });

  it("keeps Charged Strike (20pt synergy) as part of the build", () => {
    const row = skillByName(out!, "Charged Strike");
    expect(row!.numAsBuild).toBe(3);
    expect(row!.numAsPrereq).toBe(0);
    expect(row!.pctBuild).toBe(1);
  });

  it("keeps Lightning Strike (20pt main) as part of the build", () => {
    const row = skillByName(out!, "Lightning Strike");
    expect(row!.numAsBuild).toBe(3);
    expect(row!.numAsPrereq).toBe(0);
  });

  it("keeps Decoy (1pt utility, no skill requires it) as part of the build", () => {
    const row = skillByName(out!, "Decoy");
    expect(row!.numAsBuild).toBe(3);
    expect(row!.numAsPrereq).toBe(0);
  });

  it("returns rows sorted by pctBuild desc", () => {
    for (let i = 1; i < out!.length; i++) {
      expect(out![i - 1].pctBuild).toBeGreaterThanOrEqual(out![i].pctBuild);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("aggregateSkillUsage edge cases", () => {
  it("returns null for an unknown class (caller should fall back to server data)", () => {
    expect(aggregateSkillUsage([char([rs("Jab", 1)])], "NotAClass")).toBeNull();
  });

  it("returns empty array for an empty cohort", () => {
    expect(aggregateSkillUsage([], "Amazon")).toEqual([]);
  });

  it("handles a skill the prereq map doesn't know about — treats as build", () => {
    const out = aggregateSkillUsage(
      [char([rs("Made Up Skill", 5), rs("Jab", 1)])],
      "Amazon",
    );
    const row = skillByName(out!, "Made Up Skill");
    expect(row!.numAsBuild).toBe(1);
    expect(row!.numAsPrereq).toBe(0);
  });

  it("baseLevel averages exclude prereq classifications for avgBaseLevelAsBuild", () => {
    const out = aggregateSkillUsage(
      [
        char([
          rs("Power Strike", 1), // prereq (because of Lightning Strike at 20)
          rs("Lightning Strike", 20),
        ]),
        char([
          rs("Power Strike", 20), // synergy, full investment
          rs("Lightning Strike", 20),
        ]),
      ],
      "Amazon",
    );
    const row = skillByName(out!, "Power Strike");
    expect(row!.numAsBuild).toBe(1);
    expect(row!.numAsPrereq).toBe(1);
    expect(row!.avgBaseLevel).toBeCloseTo(10.5); // (1 + 20) / 2
    expect(row!.avgBaseLevelAsBuild).toBe(20); // only the 20pt one
  });
});
