import type { Character } from "../types";
import skillPrereqsRaw from "../../../data/skill-prereqs.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClassSkillMap = Record<
  string,
  { prereqs: string[]; receivesBonusesFrom: string[] }
>;

type SkillPrereqs = Record<string, ClassSkillMap>;

const SKILL_PREREQS = skillPrereqsRaw as SkillPrereqs;

export type SkillUsageEntry = {
  name: string;
  /** Characters with baseLevel >= 1 (any classification). */
  numWithAny: number;
  /** Characters where this skill is part of "the build":
   *  baseLevel > 1, OR baseLevel === 1 and not classified as prereq-only. */
  numAsBuild: number;
  /** Characters where this skill is classified as prereq-only for the
   *  character's actually-invested skills. */
  numAsPrereq: number;
  /** Average baseLevel across characters with the skill (any classification). */
  avgBaseLevel: number;
  /** Average baseLevel restricted to characters where it's part of the build. */
  avgBaseLevelAsBuild: number;
  /** Pool size used for percentage denominators. */
  totalSample: number;
  /** numAsBuild / totalSample (0..1). */
  pctBuild: number;
  /** numWithAny / totalSample (0..1). */
  pctAny: number;
};

// ---------------------------------------------------------------------------
// Classification helper
// ---------------------------------------------------------------------------

/**
 * Returns true if `skillName` is at exactly 1 baseLevel for this character AND
 * some OTHER skill on the same character (at baseLevel > 1) lists it as a
 * prerequisite. Used to filter out "1-point unlock" skills from the build view
 * (e.g. Power Strike 1pt in a Lightning Strike build).
 */
export function isPrereqOnly(
  skillName: string,
  characterSkills: ReadonlyMap<string, number>,
  classMap: ClassSkillMap,
): boolean {
  if (characterSkills.get(skillName) !== 1) return false;
  for (const [otherName, level] of characterSkills) {
    if (level <= 1) continue;
    if (otherName === skillName) continue;
    const def = classMap[otherName];
    if (def?.prereqs.includes(skillName)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

/**
 * Aggregates per-skill usage across the filtered character pool, classifying
 * 1-point skills as "prereq" when they're only present to unlock another
 * skill the same character has invested in. Sorted by pctBuild desc.
 *
 * Returns `null` when the class has no entry in the prereq dataset
 * (typically: no className filter applied). Callers should fall back to
 * server-side `getSkillUsage` data in that case.
 *
 * @param characters  Filtered character pool (already class-matched).
 * @param className   Class name, e.g. "Amazon". Must exist in skill-prereqs.json.
 * @param topN        Cap on returned entries. Default 16 to give room for
 *                    the "show prerequisites" toggle to surface a few more.
 */
export function aggregateSkillUsage(
  characters: Character[],
  className: string,
  topN = 16,
): SkillUsageEntry[] | null {
  const classMap = SKILL_PREREQS[className];
  if (!classMap) return null;
  if (characters.length === 0) return [];

  type Acc = {
    numWithAny: number;
    numAsBuild: number;
    numAsPrereq: number;
    sumBaseLevel: number;
    sumBaseLevelAsBuild: number;
  };

  const stats = new Map<string, Acc>();
  const ensure = (name: string): Acc => {
    let s = stats.get(name);
    if (!s) {
      s = {
        numWithAny: 0,
        numAsBuild: 0,
        numAsPrereq: 0,
        sumBaseLevel: 0,
        sumBaseLevelAsBuild: 0,
      };
      stats.set(name, s);
    }
    return s;
  };

  for (const char of characters) {
    // Per-character map: skill name → baseLevel (>=1 only).
    const charSkills = new Map<string, number>();
    for (const rs of char.realSkills ?? []) {
      if (rs.baseLevel >= 1) charSkills.set(rs.skill, rs.baseLevel);
    }

    for (const [skillName, baseLevel] of charSkills) {
      const s = ensure(skillName);
      s.numWithAny++;
      s.sumBaseLevel += baseLevel;

      if (isPrereqOnly(skillName, charSkills, classMap)) {
        s.numAsPrereq++;
      } else {
        s.numAsBuild++;
        s.sumBaseLevelAsBuild += baseLevel;
      }
    }
  }

  const total = characters.length;
  const result: SkillUsageEntry[] = [];
  for (const [name, s] of stats) {
    result.push({
      name,
      numWithAny: s.numWithAny,
      numAsBuild: s.numAsBuild,
      numAsPrereq: s.numAsPrereq,
      avgBaseLevel: s.numWithAny > 0 ? s.sumBaseLevel / s.numWithAny : 0,
      avgBaseLevelAsBuild:
        s.numAsBuild > 0 ? s.sumBaseLevelAsBuild / s.numAsBuild : 0,
      totalSample: total,
      pctBuild: s.numAsBuild / total,
      pctAny: s.numWithAny / total,
    });
  }

  // Rank by "this skill is part of the build" frequency, descending.
  result.sort((a, b) => b.pctBuild - a.pctBuild);
  return result.slice(0, topN);
}
