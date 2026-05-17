import { describe, it, expect } from "vitest";
import { tierFor, applyHandicap, tierForBuild } from "./tiering";
import type { TierCutoff } from "./types";

const CUTOFFS: TierCutoff[] = [
  { tier: "S+", minMpm: 673.58 },
  { tier: "S", minMpm: 649.21 },
  { tier: "S-", minMpm: 624.84 },
  { tier: "A+", minMpm: 600.47 },
  { tier: "A", minMpm: 576.1 },
  { tier: "F-", minMpm: 0 },
];

describe("tierFor", () => {
  it("returns the highest tier whose cutoff the MPM meets", () => {
    expect(tierFor(700, CUTOFFS)).toBe("S+");
    expect(tierFor(604.9, CUTOFFS)).toBe("A+");
    expect(tierFor(649.21, CUTOFFS)).toBe("S"); // exact boundary is inclusive
  });

  it("returns the lowest tier when MPM is below every higher cutoff", () => {
    expect(tierFor(10, CUTOFFS)).toBe("F-");
  });
});

describe("applyHandicap", () => {
  it("promotes by one sub-tier per handicap level", () => {
    expect(applyHandicap("B", 1)).toBe("B+"); // idx 7 -> 6
    expect(applyHandicap("B", 2)).toBe("A-"); // idx 7 -> 5
  });

  it("leaves the tier unchanged when there is no handicap", () => {
    expect(applyHandicap("B", 0)).toBe("B");
  });

  it("clamps at S+ and never overflows", () => {
    expect(applyHandicap("S-", 5)).toBe("S+");
  });
});

describe("tierForBuild", () => {
  it("looks up the cutoff tier then applies the handicap promotion", () => {
    // 576.1 -> A (idx 4); handicap 1 promotes one sub-tier -> idx 3 -> A+
    expect(tierForBuild(576.1, 1, CUTOFFS)).toBe("A+");
    // no handicap -> plain cutoff lookup
    expect(tierForBuild(576.1, 0, CUTOFFS)).toBe("A");
  });
});
