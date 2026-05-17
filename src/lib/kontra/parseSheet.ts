import type { SheetBuild, TierCutoff, Tier } from "./types";
import { TIER_ORDER } from "./types";

const TIER_SET = new Set<string>(TIER_ORDER);

/** Split one CSV line, respecting double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function handicapFrom(name: string): number {
  const m = name.match(/\(H Lvl (\d+)\)/i);
  return m ? Number(m[1]) : 0;
}

export type ParsedSheet = { builds: SheetBuild[]; cutoffs: TierCutoff[] };

/**
 * Parse the Dark Humility tier-list CSV into build rows and the embedded
 * 18-row tier-cutoff legend. See
 * docs/specs/2026-05-17-kontra-tierlist-integration-design.md for the sheet shape.
 */
export function parseSheet(csv: string): ParsedSheet {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = splitCsvLine(lines[0]).map((h) => h.trim());

  const idx = (name: string) => header.indexOf(name);
  const nameCol = 0;
  const mpmCol = idx("Top 3 T3 Map Avg. Std. MPM");
  const cutoffCol = idx("Tier-Cutoffs");
  const tierCol = idx("Tiers");
  if (mpmCol < 0 || cutoffCol < 0 || tierCol < 0) {
    throw new Error("DH sheet header changed — expected columns missing");
  }

  const builds: SheetBuild[] = [];
  const cutoffs: TierCutoff[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const rawName = (cells[nameCol] ?? "").trim();
    const mpm = Number(cells[mpmCol]);
    if (rawName && Number.isFinite(mpm)) {
      builds.push({
        rawName,
        handicap: handicapFrom(rawName),
        normalizedMpm: mpm,
      });
    }
    const cutoffVal = Number(cells[cutoffCol]);
    const tierVal = (cells[tierCol] ?? "").trim();
    if (Number.isFinite(cutoffVal) && TIER_SET.has(tierVal)) {
      cutoffs.push({ tier: tierVal as Tier, minMpm: cutoffVal });
    }
  }

  return { builds, cutoffs };
}
