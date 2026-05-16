/**
 * build-runeword-runes.ts
 *
 * Scrapes wiki.projectdiablo2.com/wiki/All_Runewords and extracts each
 * runeword's rune recipe. Writes public/runeword-runes.json:
 *   { "Enigma": ["Jah", "Ith", "Ber"], "Spirit": ["Tal", "Thul", "Ort", "Amn"], ... }
 *
 * Re-run on PD2 season patches that add or rebalance runewords.
 *
 *   npx tsx scripts/build-runeword-runes.ts
 *
 * Source page format (per runeword):
 *   <h3 id="Enigma">Enigma</h3>
 *   <div class="item-info-box">
 *     <p><b>3-Socket Chests</b></p>
 *     <p><b>Jah • Ith • Ber</b></p>
 *     ...
 *   </div>
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const URL = "https://wiki.projectdiablo2.com/wiki/All_Runewords";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const RUNE_NAMES = new Set([
  "El", "Eld", "Tir", "Nef", "Eth", "Ith", "Tal", "Ral", "Ort", "Thul",
  "Amn", "Sol", "Shael", "Dol", "Hel", "Io", "Lum", "Ko", "Fal", "Lem",
  "Pul", "Um", "Mal", "Ist", "Gul", "Vex", "Ohm", "Lo", "Sur", "Ber",
  "Jah", "Cham", "Zod",
]);

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").trim();
}

export function parseRunewords(html: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  // Match each h3 (runeword name) and the immediately-following item-info-box.
  const blockRe = /<h3 id="([^"]+)">([^<]+)<\/h3>\s*<\/div>\s*<div class="item-info-box">([\s\S]*?)<\/div>/g;
  for (const m of html.matchAll(blockRe)) {
    const name = stripTags(m[2]).trim();
    const box = m[3];
    // Inside the box, find <p><b>...</b></p> paragraphs. The runes paragraph
    // contains rune names separated by " • " (U+2022) or "&#8226;".
    const paraRe = /<p>([\s\S]*?)<\/p>/g;
    for (const pm of box.matchAll(paraRe)) {
      const text = stripTags(pm[1]).replace(/&#8226;|&bull;/g, "•").trim();
      // Split on bullet, em dash with spaces, or " - "
      const parts = text.split(/\s*•\s*/).map((p) => p.trim());
      if (parts.length < 2) continue;
      if (parts.every((p) => RUNE_NAMES.has(p))) {
        result[name] = parts;
        break;
      }
    }
  }
  return result;
}

async function main() {
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Fetch ${URL}: ${res.status}`);
  const html = await res.text();

  const recipes = parseRunewords(html);
  const count = Object.keys(recipes).length;

  await writeFile(
    join(process.cwd(), "public", "runeword-runes.json"),
    JSON.stringify(
      Object.fromEntries(Object.entries(recipes).sort()),
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log(`Wrote public/runeword-runes.json with ${count} runewords.`);
  const sample = Object.entries(recipes).slice(0, 5);
  for (const [name, runes] of sample) {
    console.log(`  ${name}: ${runes.join(" + ")}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith("build-runeword-runes.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
