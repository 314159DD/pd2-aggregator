/**
 * refresh-validation-fixtures.ts
 *
 * Fetches the 5 stats endpoints plus /meta from our own API for each of 7
 * canonical builds (one per class) and writes one combined JSON file per
 * build to src/lib/validation/fixtures/.
 *
 * Uses plain fetch (no import of src/lib/api.ts) so URL building is explicit
 * here. Softcore: S14 hardcore pools are too small early in the season.
 *
 * Tests reading the fixtures: src/lib/validation/parity.test.ts and
 * server/test/meta-parity.test.ts.
 *
 * Run weekly, on PD2 patches, or when a parity test looks suspicious:
 *   npx tsx scripts/refresh-validation-fixtures.ts [--dry-run]
 * --dry-run prints the URLs per build and writes nothing.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "https://api.pd2meta.info/api/v1";
const DRY_RUN = process.argv.includes("--dry-run");

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

const COMMON = { gameMode: "softcore", minLevel: 80 } as const;

const STATS_ENDPOINTS = {
  itemUsage: "characters/stats/item-usage",
  skillUsage: "characters/stats/skill-usage",
  mercTypeUsage: "characters/stats/merc-type-usage",
  mercItemUsage: "characters/stats/merc-item-usage",
  levelDistribution: "characters/stats/level-distribution",
} as const;

function query(b: CanonicalBuild, withMinLevel: boolean): string {
  const p = new URLSearchParams();
  p.set("gameMode", COMMON.gameMode);
  p.set("classes", b.className);
  if (withMinLevel) p.set("minLevel", String(COMMON.minLevel));
  p.set("skills", JSON.stringify(b.skills));
  return p.toString();
}

function urlsFor(b: CanonicalBuild): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const [key, path] of Object.entries(STATS_ENDPOINTS)) {
    // level distribution ignores minLevel (as the old client did)
    urls[key] = `${API}/${path}?${query(b, key !== "levelDistribution")}`;
  }
  urls.meta = `${API}/meta?${query(b, true)}`;
  return urls;
}

async function getJson(url: string): Promise<any> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return r.json();
}

async function fetchOne(b: CanonicalBuild) {
  const urls = urlsFor(b);
  const keys = Object.keys(urls);
  const results = await Promise.all(keys.map((k) => getJson(urls[k])));
  const data = Object.fromEntries(keys.map((k, i) => [k, results[i]]));
  return {
    _meta: {
      build: b.slug,
      fetchedAt: new Date().toISOString(),
      api: API,
      season: data.meta.season as number,
      filter: { ...COMMON, className: b.className },
      skills: b.skills,
    },
    itemUsage: data.itemUsage,
    skillUsage: data.skillUsage,
    mercTypeUsage: data.mercTypeUsage,
    mercItemUsage: data.mercItemUsage,
    levelDistribution: data.levelDistribution,
    meta: data.meta,
  };
}

async function main() {
  if (DRY_RUN) {
    for (const b of CANONICAL_BUILDS) {
      console.log(`# ${b.slug}`);
      for (const [k, u] of Object.entries(urlsFor(b))) console.log(`  ${k}: ${u}`);
    }
    console.log("\n(dry run, nothing written)");
    return;
  }
  const outDir = join(process.cwd(), "src", "lib", "validation", "fixtures");
  await mkdir(outDir, { recursive: true });

  // Concurrency cap of 3, be polite to the API.
  const CONCURRENCY = 3;
  for (let i = 0; i < CANONICAL_BUILDS.length; i += CONCURRENCY) {
    const batch = CANONICAL_BUILDS.slice(i, i + CONCURRENCY);
    console.log(`Fetching: ${batch.map((b) => b.slug).join(", ")}...`);
    await Promise.all(
      batch.map(async (b) => {
        const data = await fetchOne(b);
        await writeFile(join(outDir, `${b.slug}.json`), JSON.stringify(data, null, 2) + "\n", "utf8");
        console.log(`  ok ${b.slug}.json  totalSample=${data.itemUsage[0]?.totalSample ?? 0}  rows=${data.itemUsage.length}`);
      }),
    );
  }
  console.log(`\nWrote ${CANONICAL_BUILDS.length} fixtures to ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
