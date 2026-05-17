/** The 18-step Dark Humility tier scale, best to worst. */
export const TIER_ORDER = [
  "S+", "S", "S-",
  "A+", "A", "A-",
  "B+", "B", "B-",
  "C+", "C", "C-",
  "D+", "D", "D-",
  "F+", "F", "F-",
] as const;

export type Tier = (typeof TIER_ORDER)[number];

/** A single tier cutoff parsed from the sheet legend. */
export type TierCutoff = { tier: Tier; minMpm: number };

/** One build row parsed from the DH sheet (pre-tier, pre-skill-join). */
export type SheetBuild = {
  /** Exact build name from the sheet, whitespace-trimmed. */
  rawName: string;
  /** Handicap level parsed from a "(H Lvl N)" suffix; 0 if absent. */
  handicap: number;
  /** Normalized MPM — the "Top 3 T3 Map Avg. Std. MPM" column. */
  normalizedMpm: number;
};
