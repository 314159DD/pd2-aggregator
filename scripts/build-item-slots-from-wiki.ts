/**
 * build-item-slots-from-wiki.ts
 *
 * Scrapes wiki.projectdiablo2.com to enumerate every unique item, set item,
 * and runeword along with the slot it goes in. Merges the result on top of
 * data/item-slots.json so existing snapshot-derived entries (empirical truth
 * for ambiguous items like the "Spirit" runeword used as a shield vs a sword)
 * are preserved.
 *
 * Source pages (4 fetches, ~1.5 MB total):
 *   /wiki/All_Unique_Weapons
 *   /wiki/All_Unique_Non-Weapons
 *   /wiki/All_Set_Items
 *   /wiki/All_Runewords
 *
 * Slot derivation:
 *   - Unique + Runeword pages are organized by <h1> slot category (Helms,
 *     Bows, Shields, Belts, …). We track the current <h1> and attribute
 *     each <h3>/<h4> item under it.
 *   - The Set page's <h1> is tier (Common / Uncommon / Class-Focused) which
 *     tells us nothing about slot, so we read each item's base type from
 *     the first <p><b>BASE</b></p> in its info-box and keyword-match.
 *
 * Run when PD2 ships new items, or when the snapshot is too small to cover
 * popular items (Sprint 2.1 snapshot of 250 chars missed M'avina's set,
 * Lore, Hustle, Crescent Moon, etc.):
 *   npx tsx scripts/build-item-slots-from-wiki.ts
 *
 * Data licensed CC-BY-SA per wiki.projectdiablo2.com footer.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

type Slot =
  | "helm"
  | "armor"
  | "weapon"
  | "offhand"
  | "gloves"
  | "belt"
  | "boots"
  | "amulet"
  | "ring";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0";

const PAGES = [
  "All_Unique_Weapons",
  "All_Unique_Non-Weapons",
  "All_Runewords",
  "All_Set_Items",
] as const;

// h1 section names → slot, for the 3 pages where h1 already classifies by slot.
const H1_TO_SLOT: Record<string, Slot> = {
  Helms: "helm",
  Chests: "armor",
  Shields: "offhand",
  Gloves: "gloves",
  Boots: "boots",
  Belts: "belt",
  Quivers: "offhand",
  Amulets: "amulet",
  Rings: "ring",
  // Everything below is a weapon category.
  Bows: "weapon",
  Crossbows: "weapon",
  Swords: "weapon",
  Axes: "weapon",
  Maces: "weapon",
  Hammers: "weapon",
  Polearms: "weapon",
  Spears: "weapon",
  Wands: "weapon",
  Scepters: "weapon",
  Staves: "weapon",
  Staffs: "weapon",
  Daggers: "weapon",
  Knives: "weapon",
  Throwing: "weapon",
  Javelins: "weapon",
  Claws: "weapon",
  Orbs: "weapon",
  Weapons: "weapon",
};

// Keyword-based base→slot for the Set page (where h1 is useless). Patterns
// ordered: more-specific first. Each test is a case-insensitive substring.
const BASE_KEYWORD_TO_SLOT: Array<[RegExp, Slot]> = [
  // Offhands (specific item-types that aren't called "shield")
  [/\b(Quiver|Arrows|Bolts)\b/i, "offhand"],
  [/\b(Voodoo Head|Auric Shield)\b/i, "offhand"],
  // Shields — generic "Shield" + named shield bases
  [
    /\b(Shield|Buckler|Heater|Defender|Hyperion|Targe|Rondache|Pavise|Aegis|Ward|Bone Shield|Heraldic|Akaran|Gilded Shield|Royal Shield|Bone Visage|Troll Nest|Blade Barrier|Bone Mesh|Crown Shield|Grim Shield|Spiked Shield|Kite Shield|Tower Shield|Round Shield|Small Shield|Large Shield|Luna|Hyperion Shield)\b/i,
    "offhand",
  ],
  // Helms — generic helm bases + class-specifics
  [
    /\b(Helm|Crown|Skull Cap|^Cap\b|Casque|Mask|Diadem|Circlet|Tiara|Coronet|Sallet|Basinet|Hunter'?s Guise|Falcon Mask|Spirit Mask|Alpha Helm|Wolfhead|Hawkmask|Antlers|Sacred Feathers|Griffon|Bone Helm|Death Mask|Great Helm|Grim Helm|Winged Helm|War Hat|Pelt|Druidic Pelt|Primal Helm|Demonhead|Shako|Bonnet|Coif|Hawk Helm|Eagle Helm)\b/i,
    "helm",
  ],
  // Body armors
  [
    /\b(Cuirass|Plate Mail|Chain Mail|Scale Mail|Splint Mail|Linked Mail|Full Plate Mail|Gothic Plate|Ancient Armor|Light Plate|Heavy Plate|Field Plate|Ornate Plate|Templar Coat|Boneweave|Lacquered|Trellised|Russet Armor|Studded Leather|Quilted Armor|Leather Armor|Hard Leather|Breast Plate|Demonhide Armor|Dusk Shroud|Wire Fleece|Diamond Mail|Loricated Mail|Great Hauberk|Balrog Skin|Hellforge Plate|Kraken Shell|Lacquered Plate|Shadow Plate|Sacred Armor|Archon Plate|Wyrmhide|Robe|Tunic|Cape|Mage Plate|Serpentskin Armor)\b/i,
    "armor",
  ],
  // Belts
  [
    /\b(Belt|Sash|Girdle|^Cord$|Demonhide Sash|Sharkskin Belt|Mesh Belt|Battle Belt|War Belt|Spiderweb Sash|Vampirefang Belt|Mithril Coil|Troll Belt|Colossus Girdle|Heavy Belt|Plated Belt)\b/i,
    "belt",
  ],
  // Boots
  [
    /\b(Boots|Greaves|Sabaton|Light Plated Boots|Battle Boots|War Boots|Mesh Boots|Sharkskin Boots|Scarabshell Boots|Boneweave Boots|Mirrored Boots|Myrmidon Greaves|Demonhide Boots|Wyrmhide Boots)\b/i,
    "boots",
  ],
  // Gloves
  [
    /\b(Gloves|Gauntlets|Bracers|Cestus|Vambraces|Crusader Gauntlets|Ogre Gauntlets|Heavy Gloves|Chain Gloves|Light Gauntlets|Heavy Gauntlets|Battle Gauntlets|War Gauntlets|Demonhide Gloves|Sharkskin Gloves|Vampirebone Gloves)\b/i,
    "gloves",
  ],
  // Amulets / rings — must be late so "Amulet" doesn't eat into base names
  [/\bAmulet\b/i, "amulet"],
  [/\bRing\b/i, "ring"],
  // Weapons — broad catch-all (last because everything else above is more specific)
  [
    /\b(Sword|Saber|Falchion|Scimitar|Phase Blade|Cryptic Sword|Mythical Sword|Ancient Sword|Bastard Sword|Flamberge|Claymore|Crystal Sword|Giant Sword|Broad Sword|Long Sword|War Sword|Hand Axe|Hatchet|Cleaver|Twin Axe|Crowbill|Naga|Military Axe|Bearded Axe|Tabar|Gothic Axe|Ancient Axe|Berserker Axe|Glorious Axe|Champion Axe|Small Crescent|Decapitator|Feral Axe|Axe|Mace|Spiked Club|Club|Morning Star|Flail|War Hammer|Maul|Great Maul|Hammer|Cudgel|Truncheon|Tyrant Club|Knout|Wand|Yew Wand|Bone Wand|Grim Wand|Burnt Wand|Petrified Wand|Tomb Wand|Grave Wand|Lich Wand|Unearthed Wand|Polished Wand|Scepter|Grand Scepter|War Scepter|Mighty Scepter|Holy Water Sprinkler|Divine Scepter|Caduceus|Rune Scepter|Seraph Rod|Staff|Long Staff|Gnarled Staff|Battle Staff|War Staff|Cedar Staff|Quarterstaff|Walking Stick|Stalagmite|Archon Staff|Knife|Dirk|Dagger|Stiletto|Kris|Blade|Bone Knife|Mithril Point|Fanged Knife|Legend Spike|Throwing Knife|Cinquedeas|Bow|Short Bow|Hunter's Bow|Long Bow|Composite Bow|Short Battle Bow|Long Battle Bow|Short War Bow|Long War Bow|Edge Bow|Razor Bow|Cedar Bow|Double Bow|Crusader Bow|Ward Bow|Hydra Bow|Spider Bow|Diamond Bow|Shadow Bow|Great Bow|Rune Bow|Gothic Bow|Matriarchal Bow|Grand Matron Bow|Stag Bow|Reflex Bow|Crossbow|Light Crossbow|Repeating Crossbow|Gorgon Crossbow|Colossus Crossbow|Demon Crossbow|Javelin|Pilum|Short Spear|Glaive|Throwing Spear|Spear|Trident|Brandistock|Spetum|Pike|War Spear|Hyperion Spear|Stygian Pike|Maiden Spear|Ceremonial Spear|Matriarchal Spear|Polearm|Bardiche|Voulge|Scythe|Poleaxe|Halberd|War Scythe|Lochaber Axe|Bill|Battle Scythe|Partizan|Bec-de-Corbin|Grim Scythe|Tomahawk|Claw|Talon|Katar|Wrist Sword|Hand Scythe|Greater Talons|Greater Claws|Suwayyah|Wrist Spike|Fascia|Wrist Blade|War Fist|Battle Cestus|Feral Claws|Runic Talons|Scissors Suwayyah|Scissors Katar|Quhab|Scissors Quhab|Orb|Eagle Orb|Sacred Orb|Crystal Orb|Sky Spirit|Heavenly Stone|Demon Heart|Eldritch Orb|Glowing Orb|Lich Wand|Sacrificial Dagger)\b/i,
    "weapon",
  ],
];

// For runewords, the base is a socket-spec like "2-Socket Helms" or
// "4-Socket Bows/Crossbows". Strip the socket prefix; the remainder is a
// plural slot keyword we can match via H1_TO_SLOT.
function runewordBaseSlot(base: string): Slot | null {
  const m = base.match(/^\d+-Socket\s+(.+)$/);
  if (!m) return null;
  const tail = m[1].trim();
  // Tail can be a slash-separated list ("Bows/Crossbows", "Axes/Swords/...").
  // Take the first segment — same slot for all in any union we've seen.
  const first = tail.split("/")[0].trim();
  return H1_TO_SLOT[first] ?? (first.toLowerCase().includes("weapon") ? "weapon" : null);
}

function slotFromBaseKeyword(base: string): Slot | null {
  for (const [re, slot] of BASE_KEYWORD_TO_SLOT) {
    if (re.test(base)) return slot;
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "")).trim();
}

async function fetchWiki(slug: string): Promise<string> {
  const res = await fetch(`https://wiki.projectdiablo2.com/wiki/${slug}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  return res.text();
}

/**
 * Parse a wiki page and return [itemName, slot] tuples.
 *
 * `useH1Context` controls whether items get their slot from the surrounding
 * <h1> section (true for unique + runeword pages where h1 is the slot
 * category) or from the item's own info-box base type (true for the set page
 * where h1 is tier).
 */
function parsePage(
  html: string,
  pageName: string,
  isRuneword: boolean,
): Array<{ name: string; slot: Slot; base: string }> {
  const out: Array<{ name: string; slot: Slot; base: string }> = [];

  // Walk linearly: track the most recent h1 (for unique + runeword slot context).
  // Items appear as <h4 id="ItemName"> on unique + set pages, and <h3 id="..."> on
  // the runewords page. EXCEPTION: on unique pages, some items (mostly rings and
  // amulets which have only one base — no Normal/Exceptional/Elite split) live
  // at <h3>. We accept both h3 and h4 on unique pages and filter to "has an
  // info-box" downstream to drop the section-heading h3s.
  const TOKEN_RE = isRuneword
    ? /<h1 id="([^"]+)"|<h3 id="([^"]+)">/g
    : /<h1 id="([^"]+)"|<h([34]) id="([^"]+)">/g;

  let currentH1: string | null = null;
  let m: RegExpExecArray | null;
  const items: Array<{ name: string; pos: number }> = [];
  const h1s: Array<{ name: string; pos: number }> = [];

  while ((m = TOKEN_RE.exec(html)) !== null) {
    if (m[1] !== undefined) {
      currentH1 = decodeHtmlEntities(m[1]).replace(/_/g, " ");
      h1s.push({ name: currentH1, pos: m.index });
    } else {
      // For runeword page: token is /<h3 id="(...)"/ → name is m[2].
      // For unique/set pages: token is /<h([34]) id="(...)"/ → name is m[3].
      const rawIdGroup = isRuneword ? m[2] : m[3];
      if (rawIdGroup === undefined) continue;
      const rawName = decodeHtmlEntities(rawIdGroup).replace(/_/g, " ");
      // Skip "Set Bonuses for X" headings on the set page.
      if (rawName.startsWith("Set Bonuses for")) continue;
      // Skip TOC / Contents heading.
      if (rawName === "Contents" || rawName === "mw-toc-heading") continue;
      // Skip obvious section headings on unique pages — these are not items
      // and an info-box check would also filter them, but explicit beats slow.
      if (
        /^(Normal|Exceptional|Elite|Unique|Class[- ]Specific)\b/.test(rawName) ||
        /^(Helms|Chests|Shields|Gloves|Boots|Belts|Quivers|Amulets|Rings|Bows|Crossbows|Swords|Axes|Maces|Hammers|Polearms|Spears|Wands|Scepters|Staves|Daggers|Throwing|Javelins|Claws|Orbs|Weapons)$/.test(rawName) ||
        /\b(Helms|Chests|Shields|Gloves|Boots|Belts|Quivers|Amulets|Rings|Bows|Crossbows|Swords|Axes|Maces|Polearms|Spears|Wands|Scepters|Staves|Daggers|Javelins|Claws|Orbs|Pelts|Circlets)$/.test(rawName)
      ) {
        continue;
      }
      items.push({ name: rawName, pos: m.index });
    }
  }

  // For each item, find the info-box base (first <p><b>...</b></p> after the
  // heading, within ~2KB to avoid jumping into the next item).
  for (const it of items) {
    const slice = html.slice(it.pos, it.pos + 2500);
    // Match the first <b>...</b> inside the info-box. Some entries have
    // suffix text after </b> like "<b>Sharkskin Belt</b> (exceptional)" — so
    // we don't require </p> immediately after </b>.
    const boxMatch = slice.match(
      /<div class="item-info-box">\s*<p><b>([\s\S]*?)<\/b>/,
    );
    const base = boxMatch ? stripTags(boxMatch[1]) : "";

    let slot: Slot | null = null;
    if (isRuneword && base) {
      slot = runewordBaseSlot(base);
    } else if (pageName === "All_Set_Items") {
      // Set page: derive slot only from base (h1 is tier, useless).
      slot = slotFromBaseKeyword(base);
    } else {
      // Unique pages: derive from current h1 context, fall back to base keyword.
      // Find the latest h1 whose pos < item.pos.
      let h1Name: string | null = null;
      for (const h of h1s) {
        if (h.pos < it.pos) h1Name = h.name;
        else break;
      }
      const fromH1: Slot | null = h1Name ? H1_TO_SLOT[h1Name] ?? null : null;
      slot = fromH1 ?? slotFromBaseKeyword(base);
    }

    if (slot) {
      out.push({ name: it.name, slot, base });
    }
  }

  return out;
}

async function main() {
  const root = process.cwd();
  const existingPath = join(root, "data", "item-slots.json");

  // Load existing snapshot-derived slot file. Snapshot is empirical truth
  // (handles "Spirit used as shield vs sword" naturally) and wins ties.
  let existing: Record<string, Slot> = {};
  if (existsSync(existingPath)) {
    existing = JSON.parse(await readFile(existingPath, "utf8")) as Record<
      string,
      Slot
    >;
  }

  const allFromWiki: Array<{ name: string; slot: Slot; base: string; source: string }> = [];

  for (const page of PAGES) {
    process.stdout.write(`Fetching ${page}…`);
    const html = await fetchWiki(page);
    const isRuneword = page === "All_Runewords";
    const items = parsePage(html, page, isRuneword);
    console.log(` ${items.length} items`);
    for (const it of items) {
      allFromWiki.push({ ...it, source: page });
    }
  }

  // Build the wiki name → slot dict. If wiki itself has the same item in two
  // pages (shouldn't happen but defensive), the first occurrence wins.
  const wikiMap = new Map<string, Slot>();
  for (const it of allFromWiki) {
    if (!wikiMap.has(it.name)) wikiMap.set(it.name, it.slot);
  }

  // Some D2 items appear in the API with a "The " prefix that the wiki drops
  // for URL cleanliness ("The Spirit Shroud" in-game / API, "Spirit Shroud"
  // as wiki page). The reverse also exists: items that the wiki spells WITH
  // "The " but the API doesn't. Add both variants so either spelling resolves.
  for (const [name, slot] of [...wikiMap.entries()]) {
    if (name.startsWith("The ")) {
      const stripped = name.slice(4);
      if (!wikiMap.has(stripped)) wikiMap.set(stripped, slot);
    } else {
      const prefixed = `The ${name}`;
      if (!wikiMap.has(prefixed)) wikiMap.set(prefixed, slot);
    }
  }

  // Merge: snapshot-derived `existing` wins for items that appear in both.
  // Wiki fills in everything snapshot missed.
  const result: Record<string, Slot> = { ...Object.fromEntries(wikiMap), ...existing };

  // Sort for diff-friendliness.
  const sorted: Record<string, Slot> = {};
  for (const k of Object.keys(result).sort()) sorted[k] = result[k];

  await writeFile(existingPath, JSON.stringify(sorted, null, 2) + "\n", "utf8");

  // ── Report ───────────────────────────────────────────────────────────────
  const wikiOnly = [...wikiMap.keys()].filter((n) => !(n in existing));
  const overlap = [...wikiMap.keys()].filter((n) => n in existing);
  const conflicts = overlap.filter((n) => wikiMap.get(n) !== existing[n]);
  console.log(`\nWiki source: ${wikiMap.size} items`);
  console.log(`  Already in snapshot-derived file: ${overlap.length}`);
  console.log(`  Wiki adds new: ${wikiOnly.length}`);
  console.log(`  Conflicts (snapshot kept):        ${conflicts.length}`);
  console.log(`Total in data/item-slots.json: ${Object.keys(sorted).length}`);

  const bySlot: Record<string, number> = {};
  for (const slot of Object.values(sorted)) {
    bySlot[slot] = (bySlot[slot] ?? 0) + 1;
  }
  console.log(`\nBy slot:`);
  for (const [k, v] of Object.entries(bySlot).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(8)} ${String(v).padStart(4)}`);
  }

  if (conflicts.length > 0) {
    console.log(`\nWiki/snapshot conflicts (kept snapshot — empirical truth):`);
    for (const n of conflicts.slice(0, 30)) {
      console.log(
        `  ${n.padEnd(40)} wiki=${wikiMap.get(n)} snapshot=${existing[n]}`,
      );
    }
    if (conflicts.length > 30) {
      console.log(`  …and ${conflicts.length - 30} more`);
    }
  }

  // Surface items the wiki couldn't classify — useful for finding regex gaps.
  const unclassified = allFromWiki.filter((it) => !it.slot);
  if (unclassified.length > 0) {
    console.log(
      `\n${unclassified.length} wiki items lacked a derivable slot (base regex gap?):`,
    );
    for (const it of unclassified.slice(0, 20)) {
      console.log(`  ${it.name.padEnd(36)}  base="${it.base}"  (${it.source})`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
