import { describe, it, expect } from "vitest";
import { parseSheet } from "./parseSheet";

const CSV = `S10-13 Tested Build,T3 Map 1,MPM 1,Density 1,(MPM*200)/(D+100) 1,T3 Map 2,MPM 2,Density 2,(MPM*200)/(D+100) 2,T3 Map 3,MPM 3,Density 3,(MPM*200)/(D+100) 3,Top 3 Map Avg. MPM,Top 3 T3 Map Avg. Std. MPM,Top 3 Map Avg. MPM Mean,Tier-Cutoffs,Tiers,A,B,C,D
Nova (H Lvl 1),Blood Moon,719,125,639.11,Phlegethon,677,136,573.73,Canyon,650,116,601.85,682.00,604.90,532,673.58,S+,x,x,x,x
Blessed Hammer (H Lvl 1) ,Blood Moon,741,131,641.56,Phlegethon,672,129,586.90,Throne,531,116,491.67,648.00,573.37,x,649.21,S,x,x,x,x`;

describe("parseSheet", () => {
  it("parses build rows with trimmed names and normalized MPM", () => {
    const { builds } = parseSheet(CSV);
    expect(builds).toHaveLength(2);
    expect(builds[0]).toEqual({
      rawName: "Nova (H Lvl 1)",
      handicap: 1,
      normalizedMpm: 604.9,
    });
    // trailing whitespace on the raw name is trimmed
    expect(builds[1].rawName).toBe("Blessed Hammer (H Lvl 1)");
  });

  it("parses the embedded tier-cutoff legend", () => {
    const { cutoffs } = parseSheet(CSV);
    expect(cutoffs[0]).toEqual({ tier: "S+", minMpm: 673.58 });
    expect(cutoffs[1]).toEqual({ tier: "S", minMpm: 649.21 });
  });
});
