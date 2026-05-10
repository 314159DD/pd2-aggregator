/**
 * refresh-validation-fixtures.ts
 *
 * Fetches the 5 stats endpoints from api.pd2.tools for each of 7 canonical
 * builds (one per class) and writes one combined JSON file per build to
 * src/lib/validation/fixtures/.
 *
 * The parity test suite (src/lib/validation/parity.test.ts) reads these
 * fixtures and asserts that our shaping / slot-mapping preserves API data.
 *
 * Deliberately uses src/lib/api.ts (the same API client the app uses), so any
 * bug in URL building affects the fixtures the same way it affects production.
 * Humans diffing fixtures vs pd2.tools' UI catch those — see the design spec.
 *
 * Run weekly during active development, on every PD2 patch, or whenever a
 * parity test starts looking suspicious:
 *   npx tsx scripts/refresh-validation-fixtures.ts
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  getItemUsage,
  getSkillUsage,
  getMercTypeUsage,
  getMercItemUsage,
  getLevelDistribution,
  type CommonFilter,
  type ItemUsageRow,
  type SkillUsageRow,
  type MercTypeUsageRow,
  type LevelDistribution,
} from "../src/lib/api";

type CanonicalBuild = {
  slug: string;
  className: string;
  build: string;
  skills: Array<{ name: string; minLevel: number }>;
};

const CANONICAL_BUILDS: CanonicalBuild[] = [
  { slug: "amazon-lightning-fury",      className: "Amazon",      build: "Lightning Fury",    skills: [{ name: "Lightning Fury", minLevel: 20 }] },
  { slug: "assassin-lightning-trapsin", className: "Assassin",    build: "Lightning Trapsin", skills: [{ name: "Lightning Sentry", minLevel: 20 }] },
  { slug: "barbarian-whirlwind",        className: "Barbarian",   build: "Whirlwind",         skills: [{ name: "Whirlwind", minLevel: 20 }] },
  { slug: "druid-wind-tornado",         className: "Druid",       build: "Wind (Tornado)",    skills: [{ name: "Tornado", minLevel: 20 }] },
  { slug: "necromancer-bone-spear",     className: "Necromancer", build: "Bone Spear",        skills: [{ name: "Bone Spear", minLevel: 20 }] },
  { slug: "paladin-hammerdin",          className: "Paladin",     build: "Hammerdin",         skills: [{ name: "Blessed Hammer", minLevel: 20 }] },
  { slug: "sorceress-blizzard",         className: "Sorceress",   build: "Blizzard",          skills: [{ name: "Blizzard", minLevel: 20 }] },
];

const COMMON: Omit<CommonFilter, "className"> = {
  gameMode: "hardcore",
  minLevel: 80,
};

type FixtureFile = {
  _meta: {
    build: string;
    fetchedAt: string;
    filter: CommonFilter;
    skills: CanonicalBuild["skills"];
  };
  itemUsage: ItemUsageRow[];
  skillUsage: SkillUsageRow[];
  mercTypeUsage: MercTypeUsageRow[];
  mercItemUsage: ItemUsageRow[];
  levelDistribution: LevelDistribution;
};

async function fetchOne(b: CanonicalBuild): Promise<FixtureFile> {
  const filter: CommonFilter = { ...COMMON, className: b.className };
  const [itemUsage, skillUsage, mercTypeUsage, mercItemUsage, levelDistribution] =
    await Promise.all([
      getItemUsage(filter, b.skills),
      getSkillUsage(filter, b.skills),
      getMercTypeUsage(filter, b.skills),
      getMercItemUsage(filter, b.skills),
      getLevelDistribution(
        { gameMode: filter.gameMode, className: filter.className },
        b.skills,
      ),
    ]);
  return {
    _meta: {
      build: b.slug,
      fetchedAt: new Date().toISOString(),
      filter,
      skills: b.skills,
    },
    itemUsage,
    skillUsage,
    mercTypeUsage,
    mercItemUsage,
    levelDistribution,
  };
}

async function main() {
  const root = process.cwd();
  const outDir = join(root, "src", "lib", "validation", "fixtures");
  await mkdir(outDir, { recursive: true });

  // Concurrency cap of 3 — be polite to api.pd2.tools.
  const CONCURRENCY = 3;
  for (let i = 0; i < CANONICAL_BUILDS.length; i += CONCURRENCY) {
    const batch = CANONICAL_BUILDS.slice(i, i + CONCURRENCY);
    console.log(`Fetching: ${batch.map((b) => b.slug).join(", ")}…`);
    await Promise.all(
      batch.map(async (b) => {
        const data = await fetchOne(b);
        const path = join(outDir, `${b.slug}.json`);
        await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
        const total = data.itemUsage[0]?.totalSample ?? 0;
        console.log(
          `  ✓ ${b.slug}.json  totalSample=${total}  rows=${data.itemUsage.length}`,
        );
      }),
    );
  }

  console.log(
    `\n✓ Wrote ${CANONICAL_BUILDS.length} fixtures to ${outDir}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
