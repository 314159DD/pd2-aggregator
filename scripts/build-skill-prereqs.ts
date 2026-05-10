/**
 * build-skill-prereqs.ts
 *
 * Fetches PD2 wiki class skill pages and extracts each skill's prereq chain
 * and "receives bonuses from" (synergy) list. Writes data/skill-prereqs.json.
 *
 * Used by the build-sheet aggregator to distinguish "main / synergy / utility"
 * skills from "1-pt prereq only" skills — so e.g. Power Strike doesn't pollute
 * Lightning Strike Javazon results.
 *
 * Data source: wiki.projectdiablo2.com (community wiki).
 * Per source page footer: content licensed CC-BY-SA. Attribution surfaced
 * in the app UI footer.
 *
 * Run on each PD2 season patch:
 *   npx tsx scripts/build-skill-prereqs.ts
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const CLASSES = [
  "Amazon",
  "Assassin",
  "Barbarian",
  "Druid",
  "Necromancer",
  "Paladin",
  "Sorceress",
] as const;

type ClassName = (typeof CLASSES)[number];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type SkillEntry = {
  prereqs: string[];
  receivesBonusesFrom: string[];
};

type ClassSkills = Record<string, SkillEntry>;

// PD2 renamed some skills from vanilla D2; prereq/synergy lists on the wiki
// sometimes still use the old name. Normalize references to the live name.
// Key = name as it appears in older references; value = current PD2 name.
const RENAMES: Record<string, string> = {
  "Poison Dagger": "Poison Strike",
};

async function fetchClassPage(className: ClassName): Promise<string> {
  const url = `https://wiki.projectdiablo2.com/wiki/All_${className}_Skills`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Fetch ${url}: ${res.status}`);
  return res.text();
}

// Strip a skill name as it appears in the "Required Skills" list.
// "Glacial Spike [18]" -> "Glacial Spike"
function stripLevelBracket(s: string): string {
  return s.replace(/\s*\[\d+\]\s*$/, "").trim();
}

// Decode a small set of HTML entities that appear in skill names.
function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Strip HTML tags from a fragment (best-effort — used only on small fragments).
function stripTags(s: string): string {
  return decodeHtml(s.replace(/<[^>]+>/g, "")).trim();
}

function parseClassPage(html: string): ClassSkills {
  // Each skill section starts with: <div class="mw-heading mw-heading2"><h2 id="Skill_Name">Skill Name</h2></div>
  // Split on these heading divs to chunk per skill.
  const HEADING_RE =
    /<div class="mw-heading mw-heading2"><h2 id="([^"]+)">([^<]+)<\/h2><\/div>/g;

  // Collect [skillName, startIndex] tuples.
  const headings: Array<{ name: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = HEADING_RE.exec(html)) !== null) {
    const name = decodeHtml(m[2]).trim();
    // Skip the auto-generated table-of-contents heading.
    if (name === "Contents") continue;
    headings.push({ name, start: m.index });
  }

  const skills: ClassSkills = {};

  for (let i = 0; i < headings.length; i++) {
    const { name, start } = headings[i];
    const end = i + 1 < headings.length ? headings[i + 1].start : html.length;
    const section = html.slice(start, end);

    // ── Required Skills ────────────────────────────────────────────────────
    // Pattern: <li><b>Required Skills:</b> Skill1 [1], Skill2 [6]</li>
    //      or: <li><b>Required Skills:</b> None</li>
    let prereqs: string[] = [];
    const prereqMatch = section.match(
      /<b>Required Skills:<\/b>\s*([\s\S]*?)<\/li>/,
    );
    if (prereqMatch) {
      const raw = stripTags(prereqMatch[1]);
      if (raw && raw.toLowerCase() !== "none") {
        prereqs = raw
          .split(",")
          .map((s) => stripLevelBracket(s))
          .map((s) => RENAMES[s] ?? s)
          .filter(Boolean);
      }
    }

    // ── Receives bonuses from ──────────────────────────────────────────────
    // Pattern: <p><b>{Skill Name} Receives Bonuses From:</b></p>
    //          <ul><li>OtherSkill: +X% Damage per Level</li>...</ul>
    // Case varies across pages (Sorceress uses lowercase, others Title Case).
    // The <ul> may immediately follow the </p> with arbitrary whitespace.
    //
    // Filter applied below: each <li> must have a colon AND a "per Level" /
    // "per N Levels" marker. This rejects:
    //   - self-descriptive lines like "Gains +3 Absorb per Energy" (no colon)
    //   - changelog blocks like "Fire blast synergies increased from 9% to 12%"
    //     (no "per Level")
    let receivesBonusesFrom: string[] = [];
    const bonusMatch = section.match(
      /<b>[^<]*receives bonuses from:<\/b>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i,
    );
    if (bonusMatch) {
      const ulInner = bonusMatch[1];
      const liRe = /<li>([\s\S]*?)<\/li>/g;
      let lm: RegExpExecArray | null;
      const seen = new Set<string>();
      while ((lm = liRe.exec(ulInner)) !== null) {
        const liText = stripTags(lm[1]);
        if (!/:/.test(liText)) continue;
        if (!/per\s+(\w+\s+)?Levels?\b/i.test(liText)) continue;
        const synergyName = liText.slice(0, liText.indexOf(":")).trim();
        if (!synergyName) continue;
        const canonical = RENAMES[synergyName] ?? synergyName;
        if (seen.has(canonical)) continue;
        seen.add(canonical);
        receivesBonusesFrom.push(canonical);
      }
    }

    skills[name] = { prereqs, receivesBonusesFrom };
  }

  return skills;
}

// Build a fuzzy-match index over class skill names. Used to resolve
// references that the wiki spells inconsistently ("Fireclaw" vs "Fire Claws").
function normalizeSkillKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/s$/, "");
}

function resolveDanglingReferences(out: Record<string, ClassSkills>): {
  resolved: number;
  remaining: Array<{ cls: string; skill: string; ref: string }>;
} {
  let resolved = 0;
  const remaining: Array<{ cls: string; skill: string; ref: string }> = [];

  for (const cls of Object.keys(out)) {
    const knownNames = Object.keys(out[cls]);
    const fuzzyIndex = new Map<string, string>();
    for (const n of knownNames) fuzzyIndex.set(normalizeSkillKey(n), n);

    const fix = (ref: string): string | null => {
      if (knownNames.includes(ref)) return ref;
      const canonical = fuzzyIndex.get(normalizeSkillKey(ref));
      return canonical ?? null;
    };

    for (const skill of Object.keys(out[cls])) {
      const entry = out[cls][skill];
      const newPrereqs: string[] = [];
      for (const r of entry.prereqs) {
        const fixed = fix(r);
        if (fixed) {
          if (fixed !== r) resolved++;
          newPrereqs.push(fixed);
        } else {
          remaining.push({ cls, skill, ref: r });
        }
      }
      const newBonuses: string[] = [];
      for (const r of entry.receivesBonusesFrom) {
        const fixed = fix(r);
        if (fixed) {
          if (fixed !== r) resolved++;
          newBonuses.push(fixed);
        } else {
          remaining.push({ cls, skill, ref: r });
        }
      }
      entry.prereqs = newPrereqs;
      entry.receivesBonusesFrom = newBonuses;
    }
  }

  return { resolved, remaining };
}

async function main() {
  const root = process.cwd();
  const out: Record<ClassName, ClassSkills> = {} as Record<ClassName, ClassSkills>;

  for (const cls of CLASSES) {
    process.stdout.write(`Fetching ${cls}…`);
    const html = await fetchClassPage(cls);
    const parsed = parseClassPage(html);
    out[cls] = parsed;
    console.log(` ${Object.keys(parsed).length} skills`);
  }

  // ── Fuzzy-resolve references, then report any still-dangling ones ─────────
  const { resolved, remaining } = resolveDanglingReferences(out);
  if (resolved > 0) {
    console.log(`Fuzzy-resolved ${resolved} reference(s) (case/space mismatches).`);
  }
  if (remaining.length > 0) {
    for (const { cls, skill, ref } of remaining) {
      console.warn(`  ⚠ ${cls}/${skill}: dropped non-skill ref "${ref}"`);
    }
    console.warn(
      `\n${remaining.length} reference(s) couldn't be matched and were dropped. ` +
        `These are typically generic phrases ("All Other Curses") not real skill names.`,
    );
  } else {
    console.log("\n✓ All prereq + synergy references resolve within their class.");
  }

  const outPath = join(root, "data", "skill-prereqs.json");
  await writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`✓ Wrote ${outPath}`);

  // ── Coverage summary ─────────────────────────────────────────────────────
  console.log("\nCoverage:");
  for (const cls of CLASSES) {
    const skills = Object.keys(out[cls]);
    const withPrereqs = skills.filter((s) => out[cls][s].prereqs.length > 0).length;
    const withSynergies = skills.filter(
      (s) => out[cls][s].receivesBonusesFrom.length > 0,
    ).length;
    console.log(
      `  ${cls.padEnd(12)} ${String(skills.length).padStart(2)} skills  ` +
        `${String(withPrereqs).padStart(2)} w/ prereqs  ` +
        `${String(withSynergies).padStart(2)} w/ synergies`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
