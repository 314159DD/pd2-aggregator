/**
 * build-kontra-snapshot.ts
 *
 * Builds data/kontra-builds.json from the Dark Humility tier-list Google Sheet
 * and the curated data/kontra-build-skills.json mapping.
 *
 * Run:  npx tsx scripts/build-kontra-snapshot.ts
 * Auto-refreshed nightly by .github/workflows/refresh-price-snapshot.yml.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseSheet } from "../src/lib/kontra/parseSheet";
import { buildPresetsFromSheet, type SkillMap } from "../src/lib/kontra/buildSnapshot";

const SHEET_ID = "1ipTsARndewEJaREWfcDeuCelKWpCEcFy9nrigp220_Y";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;
const ROOT = process.cwd();

/** skill name -> class, derived from data/skill-prereqs.json. */
async function loadSkillClass(): Promise<Record<string, string>> {
  const raw = JSON.parse(
    await readFile(join(ROOT, "data/skill-prereqs.json"), "utf8"),
  ) as Record<string, Record<string, unknown>>;
  const out: Record<string, string> = {};
  for (const [className, skills] of Object.entries(raw)) {
    for (const skillName of Object.keys(skills)) out[skillName] = className;
  }
  return out;
}

async function main() {
  const res = await fetch(CSV_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const csv = await res.text();

  const sheet = parseSheet(csv);
  const mapping = JSON.parse(
    await readFile(join(ROOT, "data/kontra-build-skills.json"), "utf8"),
  ) as SkillMap;
  const skillClass = await loadSkillClass();

  const { presets, unmapped } = buildPresetsFromSheet(sheet, mapping, skillClass);

  await writeFile(
    join(ROOT, "data/kontra-builds.json"),
    JSON.stringify(presets, null, 2) + "\n",
  );

  const classCount = Object.keys(presets).length;
  const presetCount = Object.values(presets).reduce((n, p) => n + p.length, 0);
  console.log(
    `Wrote data/kontra-builds.json — ${presetCount} presets across ${classCount} classes ` +
      `(from ${sheet.builds.length} sheet builds, ${sheet.cutoffs.length} tier cutoffs).`,
  );
  if (unmapped.length) {
    console.warn(`\n${unmapped.length} sheet builds have no usable mapping entry:`);
    for (const u of unmapped) console.warn(`  - ${u}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
