import type { ParsedSheet } from "./parseSheet";
import type { Tier } from "./types";
import { TIER_ORDER } from "./types";
import { tierForBuild } from "./tiering";

export type SkillMapEntry = { skills: string[]; mergeInto?: string; notes?: string };
export type SkillMap = Record<string, SkillMapEntry>;

export type KontraPreset = {
  id: string;
  name: string;
  tier: Tier;
  className: string;
  skills: string[];
  sources: string[];
};
export type KontraPresetsByClass = Record<string, KontraPreset[]>;

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const tierRank = (t: Tier) => TIER_ORDER.indexOf(t);

/**
 * Join parsed DH sheet builds with the curated skill mapping into class-grouped,
 * tier-sorted presets. Builds sharing a `mergeInto` collapse into one preset
 * whose tier is the best of the group. Builds with no usable mapping entry are
 * returned in `unmapped` rather than silently dropped.
 */
export function buildPresetsFromSheet(
  sheet: ParsedSheet,
  mapping: SkillMap,
  skillClass: Record<string, string>,
): { presets: KontraPresetsByClass; unmapped: string[] } {
  const unmapped: string[] = [];
  const groups = new Map<
    string,
    { name: string; skills: string[]; className: string; tier: Tier; sources: string[] }
  >();

  for (const b of sheet.builds) {
    const entry = mapping[b.rawName];
    if (!entry || entry.skills.length === 0) {
      unmapped.push(b.rawName);
      continue;
    }
    const className = skillClass[entry.skills[0]];
    if (!className) {
      unmapped.push(b.rawName); // skill not recognised — needs curation
      continue;
    }
    const tier = tierForBuild(b.normalizedMpm, b.handicap, sheet.cutoffs);
    const displayName = entry.mergeInto ?? b.rawName.replace(/\s*\(.*$/, "").trim();
    const key = entry.mergeInto ?? b.rawName;

    const existing = groups.get(key);
    if (existing) {
      existing.sources.push(b.rawName);
      if (tierRank(tier) < tierRank(existing.tier)) existing.tier = tier;
    } else {
      groups.set(key, {
        name: displayName,
        skills: entry.skills,
        className,
        tier,
        sources: [b.rawName],
      });
    }
  }

  const presets: KontraPresetsByClass = {};
  for (const g of groups.values()) {
    (presets[g.className] ??= []).push({
      id: slug(g.name),
      name: g.name,
      tier: g.tier,
      className: g.className,
      skills: g.skills,
      sources: g.sources,
    });
  }
  for (const cls of Object.keys(presets)) {
    presets[cls].sort(
      (a, b) => tierRank(a.tier) - tierRank(b.tier) || a.name.localeCompare(b.name),
    );
  }
  return { presets, unmapped };
}
